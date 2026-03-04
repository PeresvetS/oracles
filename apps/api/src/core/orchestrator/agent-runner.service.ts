import { randomUUID } from 'crypto';
import { Injectable, Inject, Logger } from '@nestjs/common';
import type { Agent, MessageRole, Prisma } from '@prisma/client';
import {
  AGENT_DEFAULTS,
  AGENT_ROLE,
  MESSAGE_ROLE,
  SESSION_STATUS,
  type ChatMessage,
  type LlmChatParams,
  type LlmChatResponse,
  type ToolCall,
  type ToolCallResult,
  type ToolDefinition,
  type ReasoningDetail,
  type UrlCitation,
} from '@oracle/shared';
import { PrismaService } from '@prisma/prisma.service';
import { LlmGatewayService } from '@integrations/llm/llm-gateway.service';
import {
  SESSION_EVENT_EMITTER,
  type ISessionEventEmitter,
} from '@core/orchestrator/interfaces/session-event-emitter.interface';
import type {
  RunAgentParams,
  AgentRunnerResult,
} from '@core/orchestrator/interfaces/orchestrator.types';
import {
  TOOL_NAMES,
  CALL_RESEARCHER_TOOL_DEFINITION,
  AGENT_TIMEOUT_ERROR,
  RESEARCH_LIMIT_REACHED_MESSAGE,
} from '@core/orchestrator/constants/orchestrator.constants';

/** Пустой результат при полном провале всех попыток */
const EMPTY_RESULT: Omit<AgentRunnerResult, 'messageId'> = {
  content: '',
  tokensInput: 0,
  tokensOutput: 0,
  costUsd: 0,
  latencyMs: 0,
  toolCalls: [],
};

/** Аргументы тулзы, переданные от LLM */
interface ToolArguments {
  query: string;
}

/** Результат одной итерации стрим-вызова */
interface StreamIterationResult {
  content: string;
  toolCalls: ToolCall[];
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  latencyMs: number;
  /** Блоки reasoning из ответа (для multi-turn передаются обратно в LLM) */
  reasoning_details: ReasoningDetail[];
  /** URL-цитаты из OpenRouter web plugin (annotations) */
  annotations: UrlCitation[];
}

/**
 * Сервис запуска агентов.
 *
 * Отвечает за:
 * - Стриминг ответов LLM через chatStream (события message:start/chunk/end)
 * - Цикл tool calls: call_researcher (через Perplexity)
 * - Веб-поиск через OpenRouter web plugin (plugins: [{id:"web"}]) — результаты как annotations
 * - Таймаут на стрим с AbortController (AGENT_DEFAULTS.TIMEOUT_MS = 120с)
 * - Сохранение Message в БД с pre-generated UUID
 * - Агрегацию токенов по Agent + Session
 * - Retry с exponential backoff (3 попытки: 1s, 2s, 4s)
 */
@Injectable()
export class AgentRunnerService {
  private readonly logger = new Logger(AgentRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmGateway: LlmGatewayService,
    @Inject(SESSION_EVENT_EMITTER)
    private readonly eventEmitter: ISessionEventEmitter,
  ) {}

  /**
   * Запустить агента: стриминг через chatStream, tool call loop, сохранение Message.
   *
   * При ошибке — retry с exponential backoff (3 попытки: 1s, 2s, 4s).
   * При полном провале — возвращает пустой результат, не бросает исключение.
   */
  async runAgent(params: RunAgentParams): Promise<AgentRunnerResult> {
    const { agent, sessionId } = params;
    let lastErrorMessage = 'Неизвестная ошибка';

    for (let attempt = 1; attempt <= AGENT_DEFAULTS.RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.executeWithToolLoop(params);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        lastErrorMessage = errorMessage;
        this.logger.warn(
          `[${sessionId}] Агент ${agent.name}: попытка ${attempt}/${AGENT_DEFAULTS.RETRY_ATTEMPTS} не удалась: ${errorMessage}`,
        );

        if (attempt < AGENT_DEFAULTS.RETRY_ATTEMPTS) {
          const delayMs = AGENT_DEFAULTS.RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          await this.delay(delayMs);
        }
      }
    }

    this.logger.error(
      `[${sessionId}] Агент ${agent.name}: все ${AGENT_DEFAULTS.RETRY_ATTEMPTS} попыток исчерпаны`,
    );

    if (agent.role === AGENT_ROLE.DIRECTOR) {
      await this.pauseSessionAfterDirectorFailure(
        sessionId,
        agent.id,
        agent.name,
        lastErrorMessage,
      );
    }

    const emptyMessage = await this.saveMessage({
      sessionId: params.sessionId,
      roundId: params.roundId,
      agentId: agent.id,
      role: MESSAGE_ROLE.AGENT,
      content: '',
      modelUsed: agent.modelId,
      tokensInput: 0,
      tokensOutput: 0,
      costUsd: 0,
      latencyMs: 0,
      toolCalls: null,
    });

    return { ...EMPTY_RESULT, messageId: emptyMessage.id };
  }

  /**
   * Построить список tool definitions для агента.
   *
   * web_search работает через OpenRouter plugin (webSearchEnabled в LlmChatParams) — не tool_call.
   * call_researcher — только для Директора (явный tool_call через Perplexity).
   *
   * @returns Массив ToolDefinition (может быть пустым)
   */
  buildToolDefinitions(_agent: Agent, isDirector: boolean): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    if (isDirector) {
      tools.push(CALL_RESEARCHER_TOOL_DEFINITION);
    }

    return tools;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Приватные методы: core flow
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Выполнить цикл tool calls со стримингом и вернуть финальный результат.
   *
   * Генерирует messageId до начала стриминга.
   * Эмитит message:start → N×message:chunk → message:end.
   * Цикл продолжается пока LLM возвращает tool_calls (до MAX_TOOL_CALLS_PER_TURN итераций).
   * Токены суммируются по всем LLM-вызовам в рамках одного хода.
   */
  private async executeWithToolLoop(params: RunAgentParams): Promise<AgentRunnerResult> {
    const { agent, sessionId, roundId, tools } = params;

    // UUID генерируется ДО стриминга — используется и в WS-событиях, и в Prisma
    const messageId = randomUUID();

    let currentMessages: ChatMessage[] = [...params.messages];
    const accumulatedToolCalls: ToolCallResult[] = [];
    let totalTokensInput = 0;
    let totalTokensOutput = 0;
    let totalCostUsd = 0;
    let finalContent = '';
    let totalLatencyMs = 0;
    let emittedMessageEnd = false;

    // Уведомить клиентов о начале стриминга
    this.eventEmitter.emitMessageStart(sessionId, {
      messageId,
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role,
      roundId,
    });

    try {
      for (let iteration = 0; iteration < AGENT_DEFAULTS.MAX_TOOL_CALLS_PER_TURN; iteration++) {
        const chatParams: LlmChatParams = {
          provider: agent.provider,
          modelId: agent.modelId,
          messages: currentMessages,
          webSearchEnabled: agent.webSearchEnabled ?? false,
          ...(tools && tools.length > 0 && { tools }),
        };

        const iterResult = await this.executeStreamWithTimeout(chatParams, messageId, sessionId);

        totalTokensInput += iterResult.tokensInput;
        totalTokensOutput += iterResult.tokensOutput;
        totalCostUsd += iterResult.costUsd;
        finalContent = iterResult.content;
        totalLatencyMs += iterResult.latencyMs;

        // Обработать annotations из OpenRouter web plugin
        if (iterResult.annotations.length > 0) {
          const citationResult = this.formatAnnotationsAsResult(iterResult.annotations);
          this.eventEmitter.emitToolResult(sessionId, {
            messageId,
            agentId: agent.id,
            toolName: TOOL_NAMES.WEB_SEARCH,
            result: citationResult,
          });
          accumulatedToolCalls.push({
            tool: TOOL_NAMES.WEB_SEARCH,
            query: 'openrouter:web_plugin',
            result: citationResult,
          });
        }

        // Если нет tool_calls — это финальный ответ
        if (iterResult.toolCalls.length === 0) {
          break;
        }

        // Выполнить все tool calls из ответа
        const toolResults = await this.processToolCalls(
          iterResult.toolCalls,
          params,
          iterResult.content,
          messageId,
          iterResult.reasoning_details,
        );

        // Добавляем результаты в историю сообщений для следующей итерации
        currentMessages = [...currentMessages, ...toolResults.messages];
        accumulatedToolCalls.push(...toolResults.results);

        this.logger.debug(
          `[${sessionId}] Агент ${agent.name}: итерация tool loop ${iteration + 1}, tool calls: ${iterResult.toolCalls.length}`,
        );
      }

      // Уведомить клиентов о завершении стриминга с метриками
      this.eventEmitter.emitMessageEnd(sessionId, {
        messageId,
        tokensInput: totalTokensInput,
        tokensOutput: totalTokensOutput,
        costUsd: totalCostUsd,
        latencyMs: totalLatencyMs,
      });
      emittedMessageEnd = true;
    } catch (error: unknown) {
      if (!emittedMessageEnd) {
        this.eventEmitter.emitMessageEnd(sessionId, {
          messageId,
          tokensInput: totalTokensInput,
          tokensOutput: totalTokensOutput,
          costUsd: totalCostUsd,
          latencyMs: totalLatencyMs,
        });
      }
      throw error;
    }

    this.logger.debug(
      `[${sessionId}] ${agent.name}: суммарно ${totalTokensInput}+${totalTokensOutput} tokens, $${totalCostUsd.toFixed(4)}`,
    );

    const toolCallsJson =
      accumulatedToolCalls.length > 0
        ? (accumulatedToolCalls as unknown as Prisma.InputJsonValue)
        : null;

    const message = await this.saveMessage({
      id: messageId,
      sessionId,
      roundId,
      agentId: agent.id,
      role: MESSAGE_ROLE.AGENT,
      content: finalContent,
      modelUsed: agent.modelId,
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costUsd: totalCostUsd,
      latencyMs: totalLatencyMs,
      toolCalls: toolCallsJson,
    });

    await this.updateTokenAggregates(agent.id, sessionId, {
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costUsd: totalCostUsd,
    });

    return {
      content: finalContent,
      tokensInput: totalTokensInput,
      tokensOutput: totalTokensOutput,
      costUsd: totalCostUsd,
      latencyMs: totalLatencyMs,
      toolCalls: accumulatedToolCalls,
      messageId: message.id,
    };
  }

  /**
   * Выполнить стриминг LLM с таймаутом через AbortController.
   *
   * Эмитит message:chunk для каждого текстового чанка.
   * Аккумулирует tool_calls из стрима.
   * При превышении TIMEOUT_MS — AbortController прерывает итерацию.
   *
   * @throws Error при таймауте или ошибке стриминга
   */
  private async executeStreamWithTimeout(
    chatParams: LlmChatParams,
    messageId: string,
    sessionId: string,
  ): Promise<StreamIterationResult> {
    const startTime = Date.now();
    const deadlineTs = startTime + AGENT_DEFAULTS.TIMEOUT_MS;
    const streamIterator = this.llmGateway.chatStream(chatParams)[Symbol.asyncIterator]();

    try {
      let content = '';
      const toolCalls: ToolCall[] = [];
      const reasoningDetails: ReasoningDetail[] = [];
      const annotations: UrlCitation[] = [];
      let tokensInput = 0;
      let tokensOutput = 0;
      let costUsd = 0;
      while (true) {
        const remainingMs = deadlineTs - Date.now();
        if (remainingMs <= 0) {
          throw new Error(AGENT_TIMEOUT_ERROR);
        }

        const nextChunk = await this.waitWithTimeout(streamIterator.next(), remainingMs);
        if (nextChunk.done) {
          break;
        }

        const chunk = nextChunk.value;

        switch (chunk.type) {
          case 'text':
            content += chunk.text ?? '';
            this.eventEmitter.emitMessageChunk(sessionId, {
              messageId,
              chunk: chunk.text ?? '',
            });
            break;

          case 'reasoning':
            if (chunk.reasoning) {
              reasoningDetails.push({ type: 'thinking', text: chunk.reasoning });
              this.eventEmitter.emitThinkingChunk(sessionId, {
                messageId,
                thinking: chunk.reasoning,
              });
            }
            break;

          case 'tool_call':
            if (chunk.toolCall) {
              toolCalls.push(chunk.toolCall);
            }
            break;

          case 'annotations':
            if (chunk.annotations?.length) {
              annotations.push(...chunk.annotations);
            }
            break;

          case 'done':
            tokensInput = chunk.usage?.tokensInput ?? 0;
            tokensOutput = chunk.usage?.tokensOutput ?? 0;
            costUsd = chunk.usage?.costUsd ?? 0;
            break;

          default:
            // 'usage' chunk — обрабатывается как 'done'
            break;
        }
      }

      return {
        content,
        toolCalls,
        tokensInput,
        tokensOutput,
        costUsd,
        latencyMs: Date.now() - startTime,
        reasoning_details: reasoningDetails,
        annotations,
      };
    } finally {
      await streamIterator.return?.(undefined as never);
    }
  }

  private async waitWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(AGENT_TIMEOUT_ERROR)), timeoutMs);
      timeoutId.unref();
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    });
  }

  /**
   * Выполнить синхронный LLM-вызов с таймаутом (для callResearcher).
   *
   * Использует Promise.race с setTimeout — не стримит ответ ресерчера.
   *
   * @throws Error при превышении таймаута
   */
  private executeWithTimeout(chatParams: LlmChatParams): Promise<LlmChatResponse> {
    let timeoutId: NodeJS.Timeout | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(AGENT_TIMEOUT_ERROR)),
        AGENT_DEFAULTS.TIMEOUT_MS,
      );
      timeoutId.unref();
    });

    return Promise.race([this.llmGateway.chat(chatParams), timeoutPromise]).finally(() => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    });
  }

  /**
   * Обработать все tool calls из стрима.
   * Возвращает новые сообщения для добавления в контекст и результаты для хранения.
   */
  private async processToolCalls(
    toolCalls: ToolCall[],
    params: RunAgentParams,
    assistantContent: string,
    messageId: string,
    reasoningDetails?: ReasoningDetail[],
  ): Promise<{ messages: ChatMessage[]; results: ToolCallResult[] }> {
    const newMessages: ChatMessage[] = [];
    const results: ToolCallResult[] = [];

    // Добавить assistant message с tool_calls (формат OpenAI)
    // reasoning_details передаются для сохранения multi-turn continuity с thinking-моделями
    newMessages.push({
      role: 'assistant',
      content: assistantContent,
      tool_calls: toolCalls,
      ...(reasoningDetails?.length ? { reasoning_details: reasoningDetails } : {}),
    });

    // Выполнить каждый tool call и добавить результат
    for (const toolCall of toolCalls) {
      let query = '';
      try {
        const args = JSON.parse(toolCall.function.arguments) as ToolArguments;
        query = args.query ?? toolCall.function.arguments;
      } catch {
        query = toolCall.function.arguments;
      }

      this.eventEmitter.emitToolStart(params.sessionId, {
        messageId,
        agentId: params.agent.id,
        toolName: toolCall.function.name,
        query,
      });

      const result = await this.executeTool(toolCall, query, params);

      this.eventEmitter.emitToolResult(params.sessionId, {
        messageId,
        agentId: params.agent.id,
        toolName: toolCall.function.name,
        result,
      });

      newMessages.push({
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      });

      results.push({
        tool: toolCall.function.name,
        query,
        result,
      });
    }

    return { messages: newMessages, results };
  }

  /**
   * Выполнить тулзу по имени.
   */
  private async executeTool(
    toolCall: ToolCall,
    query: string,
    params: RunAgentParams,
  ): Promise<string> {
    switch (toolCall.function.name) {
      case TOOL_NAMES.CALL_RESEARCHER:
        return this.callResearcher(query, params);

      default:
        this.logger.warn(`[${params.sessionId}] Неизвестная тулза: ${toolCall.function.name}`);
        return `Неизвестная тулза: ${toolCall.function.name}`;
    }
  }

  /**
   * Вызвать ресерчера (Perplexity) для глубокого анализа.
   *
   * Использует НЕ-стриминговый вызов (chat, не chatStream) — короткий ответ,
   * стриминг для ресерчера избыточен.
   * Проверяет лимит researchCallsUsed < maxResearchCalls.
   * Сохраняет отдельное Message от ресерчера.
   * Инкрементирует researchCallsUsed в БД и в памяти.
   */
  private async callResearcher(query: string, params: RunAgentParams): Promise<string> {
    const { session, sessionId, roundId } = params;

    if (!session) {
      this.logger.warn(`[${sessionId}] callResearcher: сессия не передана в params`);
      return 'Ошибка: сессия не передана агенту. Используй имеющиеся данные.';
    }

    if (session.researchCallsUsed >= session.maxResearchCalls) {
      this.logger.warn(
        `[${sessionId}] Лимит research calls исчерпан (${session.researchCallsUsed}/${session.maxResearchCalls})`,
      );
      return RESEARCH_LIMIT_REACHED_MESSAGE;
    }

    const researcher = session.agents.find((a) => a.role === AGENT_ROLE.RESEARCHER);
    if (!researcher) {
      this.logger.warn(`[${sessionId}] Ресерчер не назначен в сессии`);
      return 'Ресерчер не назначен в данной сессии. Используй веб-поиск.';
    }

    const response = await this.executeWithTimeout({
      provider: researcher.provider,
      modelId: researcher.modelId,
      messages: [
        { role: 'system', content: researcher.systemPrompt },
        { role: 'user', content: query },
      ],
    });

    // Сохранить сообщение ресерчера в БД
    await this.saveMessage({
      sessionId,
      roundId,
      agentId: researcher.id,
      role: MESSAGE_ROLE.AGENT,
      content: response.content,
      modelUsed: response.model,
      tokensInput: response.tokensInput,
      tokensOutput: response.tokensOutput,
      costUsd: response.costUsd,
      latencyMs: response.latencyMs,
      toolCalls: null,
    });

    await this.updateTokenAggregates(researcher.id, sessionId, {
      tokensInput: response.tokensInput,
      tokensOutput: response.tokensOutput,
      costUsd: response.costUsd,
    });

    // Инкрементировать в БД
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { researchCallsUsed: { increment: 1 } },
    });

    // Обновить in-memory счётчик
    session.researchCallsUsed += 1;

    this.logger.log(
      `[${sessionId}] Research call выполнен (${session.researchCallsUsed}/${session.maxResearchCalls})`,
    );

    return response.content;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Приватные методы: инфраструктурные
  // ──────────────────────────────────────────────────────────────────────────

  /** Сохранить сообщение в БД */
  private async saveMessage(data: {
    id?: string;
    sessionId: string;
    roundId: string;
    agentId: string;
    role: MessageRole;
    content: string;
    modelUsed: string;
    tokensInput: number;
    tokensOutput: number;
    costUsd: number;
    latencyMs: number;
    toolCalls: Prisma.InputJsonValue | null;
  }) {
    return this.prisma.message.create({
      data: {
        ...(data.id && { id: data.id }),
        sessionId: data.sessionId,
        roundId: data.roundId,
        agentId: data.agentId,
        role: data.role,
        content: data.content,
        modelUsed: data.modelUsed,
        tokensInput: data.tokensInput,
        tokensOutput: data.tokensOutput,
        costUsd: data.costUsd,
        latencyMs: data.latencyMs,
        ...(data.toolCalls !== null && { toolCalls: data.toolCalls }),
      },
    });
  }

  /** Атомарно инкрементировать токены агента и сессии */
  private async updateTokenAggregates(
    agentId: string,
    sessionId: string,
    usage: { tokensInput: number; tokensOutput: number; costUsd: number },
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.agent.update({
        where: { id: agentId },
        data: {
          totalTokensInput: { increment: usage.tokensInput },
          totalTokensOutput: { increment: usage.tokensOutput },
          totalCostUsd: { increment: usage.costUsd },
        },
      }),
      this.prisma.session.update({
        where: { id: sessionId },
        data: {
          totalTokensInput: { increment: usage.tokensInput },
          totalTokensOutput: { increment: usage.tokensOutput },
          totalCostUsd: { increment: usage.costUsd },
        },
      }),
    ]);
  }

  /** Задержка для retry */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms).unref());
  }

  /** Форматировать URL-цитаты из OpenRouter web plugin в читаемую строку для WS и БД */
  private formatAnnotationsAsResult(annotations: UrlCitation[]): string {
    return annotations
      .map(
        (a, i) =>
          `${i + 1}. ${a.title}\n   ${a.url}${a.content ? `\n   ${a.content.slice(0, 200)}` : ''}`,
      )
      .join('\n');
  }

  private async pauseSessionAfterDirectorFailure(
    sessionId: string,
    directorId: string,
    directorName: string,
    lastErrorMessage: string,
  ): Promise<void> {
    const errorMessage = `Директор ${directorName} не ответил после всех попыток: ${lastErrorMessage}`;

    const currentSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        status: true,
        currentRound: true,
        totalCostUsd: true,
      },
    });

    if (currentSession && currentSession.status !== SESSION_STATUS.PAUSED) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { status: SESSION_STATUS.PAUSED },
      });
    }

    this.eventEmitter.emitSessionStatusChanged(sessionId, {
      status: SESSION_STATUS.PAUSED,
      currentRound: currentSession?.currentRound ?? 0,
      totalCostUsd: currentSession?.totalCostUsd ?? 0,
    });
    this.eventEmitter.emitSessionError(sessionId, errorMessage, directorId);
    this.logger.error(`[${sessionId}] ${errorMessage}`);
  }
}
