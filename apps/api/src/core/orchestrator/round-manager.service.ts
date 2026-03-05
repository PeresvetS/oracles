import { Injectable, Logger } from '@nestjs/common';
import type { Agent, Round, Message, Prisma } from '@prisma/client';
import {
  AGENT_DEFAULTS,
  AGENT_ROLE,
  IDEA_STATUS,
  ROUND_STATUS,
  MESSAGE_ROLE,
  SESSION_MODE,
  type ChatMessage,
  type RoundType,
  type SessionFilters,
} from '@oracle/shared';
import { PrismaService } from '@prisma/prisma.service';
import { LlmGatewayService } from '@integrations/llm/llm-gateway.service';
import { PromptsService } from '@core/prompts/prompts.service';
import {
  SUMMARIZATION_SYSTEM_PROMPT,
  IDEA_SUMMARY_MAX_LENGTH,
} from '@core/orchestrator/constants/orchestrator.constants';
import type { SessionWithAgents } from '@core/orchestrator/interfaces/orchestrator.types';

/** Сообщение из БД с агентом (для маппинга ролей) */
interface MessageWithAgent extends Message {
  agent: Pick<Agent, 'id' | 'name' | 'role'> | null;
}

/** Кэшированное саммари раундов */
interface SummaryCacheEntry {
  /** До какого номера раунда включительно посчитано саммари */
  roundNumber: number;
  summary: string;
}

/** Текст-заглушка, если в VALIDATE не передан отдельный список идей */
const VALIDATE_IDEAS_MISSING_TEXT =
  'Список existingIdeas не передан. Валидируй только то, что явно указано во вводных пользователя.';

/**
 * Сервис управления раундами.
 *
 * Отвечает за создание/завершение раундов и построение контекста для агента.
 *
 * Формат контекста (04-AGENTS.md):
 * 1. Системный промпт (обработан через PromptsService)
 * 2. Контекст сессии: режим + вводные
 * 3. Саммари предыдущих раундов (только round >= CONTEXT_SUMMARIZE_FROM_ROUND)
 * 4. Список активных идей
 * 5. История сообщений (полная для round < 3, только текущий раунд для round >= 3)
 */
@Injectable()
export class RoundManagerService {
  private readonly logger = new Logger(RoundManagerService.name);

  /** Кэш саммари по sessionId: пересчитывается только при смене текущего раунда */
  private readonly summaryCache = new Map<string, SummaryCacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmGateway: LlmGatewayService,
    private readonly promptsService: PromptsService,
  ) {}

  /**
   * Создать новый раунд.
   * Автоматически определяет номер (max + 1).
   */
  async createRound(sessionId: string, type: RoundType, userMessage?: string): Promise<Round> {
    const lastRound = await this.prisma.round.findFirst({
      where: { sessionId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });

    const number = (lastRound?.number ?? 0) + 1;

    const round = await this.prisma.round.create({
      data: {
        sessionId,
        type,
        number,
        status: ROUND_STATUS.IN_PROGRESS,
        ...(userMessage !== undefined && { userMessage }),
      },
    });

    this.logger.log(`Раунд ${number} (${type}) создан для сессии ${sessionId}`);
    return round;
  }

  /**
   * Завершить раунд: статус COMPLETED + completedAt.
   */
  async completeRound(roundId: string): Promise<Round> {
    return this.prisma.round.update({
      where: { id: roundId },
      data: {
        status: ROUND_STATUS.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  /**
   * Построить полный контекст сообщений для агента.
   *
   * Структура результата:
   * [0] system: обработанный системный промпт агента
   * [1] system: контекст сессии (режим + вводные)
   * [2] system: саммари (только если round >= CONTEXT_SUMMARIZE_FROM_ROUND)
   * [N] system: список активных идей (если есть)
   * [...] chat: история сообщений (с маппингом ролей)
   *
   * Маппинг ролей:
   * - Сообщения ТОГО ЖЕ агента → { role: 'assistant', content }
   * - Сообщения ДРУГИХ агентов → { role: 'user', content: '[Name]: ...' }
   * - USER сообщения → { role: 'user', content }
   * - SYSTEM/DIRECTOR_DECISION → { role: 'system', content }
   */
  async buildAgentContext(
    agent: Agent,
    session: SessionWithAgents,
    currentRoundNumber: number,
  ): Promise<ChatMessage[]> {
    const needsSummarization = currentRoundNumber >= AGENT_DEFAULTS.CONTEXT_SUMMARIZE_FROM_ROUND;
    const result: ChatMessage[] = [];

    // 1. Обработанный системный промпт
    const promptContext = {
      inputPrompt: session.inputPrompt,
      existingIdeas: this.formatExistingIdeasText(session.existingIdeas),
      filters: (session.filters ?? {}) as SessionFilters,
    };
    const processedPrompt = this.promptsService.processPrompt(agent.systemPrompt, promptContext);
    result.push({ role: 'system', content: processedPrompt });

    // 2. Контекст сессии
    result.push({ role: 'system', content: this.formatSessionContext(session) });

    // 3. Саммари предыдущих раундов (только для round >= CONTEXT_SUMMARIZE_FROM_ROUND)
    if (needsSummarization) {
      const summary = await this.getOrCreateSummary(session, currentRoundNumber);
      if (summary) {
        result.push({
          role: 'system',
          content: `Саммари предыдущих раундов (1-${currentRoundNumber - 1}):\n\n${summary}`,
        });
      }
    }

    // 4. Список активных идей
    const ideasText = await this.loadActiveIdeas(session.id);
    if (ideasText) {
      result.push({ role: 'system', content: `Активные идеи:\n${ideasText}` });
    }

    // 5. История сообщений
    if (needsSummarization) {
      // Только сообщения текущего раунда
      const currentMessages = await this.loadSessionMessages(session.id, {
        roundNumberGte: currentRoundNumber,
      });
      result.push(...this.mapMessages(currentMessages, agent));
    } else {
      // Полная история всех сообщений
      const allMessages = await this.loadSessionMessages(session.id);
      result.push(...this.mapMessages(allMessages, agent));
    }

    return result;
  }

  /**
   * Суммаризировать предыдущие раунды через LLM.
   * Использует Директора как модель для суммаризации.
   */
  async summarizePreviousRounds(
    messages: ChatMessage[],
    session: SessionWithAgents,
  ): Promise<string> {
    const director = session.agents.find((a) => a.role === AGENT_ROLE.DIRECTOR);

    if (!director) {
      this.logger.warn(`Директор не найден в сессии ${session.id}, пропуск суммаризации`);
      return this.fallbackSummary(messages);
    }

    const summaryMessages: ChatMessage[] = [
      { role: 'system', content: SUMMARIZATION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: messages.map((m) => `[${m.role}]: ${m.content}`).join('\n\n'),
      },
    ];

    const response = await this.llmGateway.chat({
      provider: director.provider,
      modelId: director.modelId,
      messages: summaryMessages,
      temperature: 0.3,
    });

    this.logger.debug(
      `Суммаризация: ${response.tokensInput} in, ${response.tokensOutput} out, $${response.costUsd.toFixed(4)}`,
    );

    return response.content;
  }

  /**
   * Очистить кэш суммаризации для сессии.
   * Вызывается при завершении или сбросе сессии.
   */
  clearSummaryCache(sessionId: string): void {
    this.summaryCache.delete(sessionId);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Приватные методы
  // ──────────────────────────────────────────────────────────────────────────

  /** Форматировать контекст сессии: режим + вводные */
  private formatSessionContext(session: SessionWithAgents): string {
    const modeLabel =
      session.mode === SESSION_MODE.GENERATE ? 'Генерация идей' : 'Валидация существующих идей';
    const lines: string[] = [`Режим: ${modeLabel}`, `Вводные: ${session.inputPrompt}`];

    if (session.mode === SESSION_MODE.VALIDATE) {
      const existingIdeas = this.parseExistingIdeas(session.existingIdeas);
      lines.push('КРИТИЧЕСКОЕ ПРАВИЛО: в режиме VALIDATE не генерируй новый список идей с нуля.');
      lines.push(
        'Работай только с идеями из блока existingIdeas ниже или из вводных пользователя.',
      );

      if (existingIdeas.length > 0) {
        lines.push('existingIdeas для валидации:');
        lines.push(...existingIdeas.map((idea, index) => `${index + 1}. ${idea}`));
      } else {
        lines.push(VALIDATE_IDEAS_MISSING_TEXT);
      }
    }

    return lines.join('\n');
  }

  private formatExistingIdeasText(existingIdeasRaw: string | null): string {
    const ideas = this.parseExistingIdeas(existingIdeasRaw);
    if (ideas.length === 0) {
      return 'Нет существующих идей';
    }

    return ideas.map((idea, index) => `${index + 1}. ${idea}`).join('\n');
  }

  private parseExistingIdeas(existingIdeasRaw: string | null): string[] {
    if (!existingIdeasRaw) {
      return [];
    }

    try {
      const parsed = JSON.parse(existingIdeasRaw) as unknown;
      if (!Array.isArray(parsed)) {
        return [existingIdeasRaw.trim()].filter((idea) => idea.length > 0);
      }

      return parsed
        .filter((idea): idea is string => typeof idea === 'string')
        .map((idea) => idea.trim())
        .filter((idea) => idea.length > 0);
    } catch {
      return [existingIdeasRaw.trim()].filter((idea) => idea.length > 0);
    }
  }

  /**
   * Загрузить активные идеи в виде форматированного списка.
   * Возвращает null если идей нет.
   */
  private async loadActiveIdeas(sessionId: string): Promise<string | null> {
    const ideas = await this.prisma.idea.findMany({
      where: {
        sessionId,
        status: { in: [IDEA_STATUS.PROPOSED, IDEA_STATUS.ACTIVE] },
      },
      select: { title: true, status: true, summary: true },
      orderBy: { createdAt: 'asc' },
    });

    if (ideas.length === 0) return null;

    return ideas
      .map(
        (idea, i) =>
          `${i + 1}. [${idea.status}] ${idea.title}: ${idea.summary.slice(0, IDEA_SUMMARY_MAX_LENGTH)}`,
      )
      .join('\n');
  }

  /**
   * Получить саммари из кэша или создать новое через LLM.
   *
   * Кэш действителен пока охватывает все раунды до (currentRoundNumber - 1).
   * При повторном вызове с тем же currentRoundNumber возвращает кэшированное значение.
   */
  private async getOrCreateSummary(
    session: SessionWithAgents,
    currentRoundNumber: number,
  ): Promise<string | null> {
    const targetRound = currentRoundNumber - 1;
    const cached = this.summaryCache.get(session.id);

    if (cached && cached.roundNumber >= targetRound) {
      this.logger.debug(`[${session.id}] Саммари из кэша (до раунда ${cached.roundNumber})`);
      return cached.summary;
    }

    const oldMessages = await this.loadSessionMessages(session.id, {
      roundNumberLt: currentRoundNumber,
    });

    if (oldMessages.length === 0) return null;

    const formattedMessages = this.formatMessagesForSummary(oldMessages);
    const summary = await this.summarizePreviousRounds(formattedMessages, session);

    this.summaryCache.set(session.id, { roundNumber: targetRound, summary });
    return summary;
  }

  /**
   * Форматировать сообщения для суммаризации.
   * Не зависит от перспективы конкретного агента: все сообщения как user с именем.
   */
  private formatMessagesForSummary(messages: MessageWithAgent[]): ChatMessage[] {
    return messages.map((msg) => {
      const name = msg.agent?.name ?? (msg.role === MESSAGE_ROLE.USER ? 'Пользователь' : 'Система');
      return { role: 'user' as const, content: `[${name}]: ${msg.content}` };
    });
  }

  /** Загрузить сообщения сессии с фильтрацией по номеру раунда */
  private async loadSessionMessages(
    sessionId: string,
    filter?: { roundNumberLt?: number; roundNumberGte?: number },
  ): Promise<MessageWithAgent[]> {
    const where: Prisma.MessageWhereInput = { sessionId };

    if (filter?.roundNumberLt !== undefined || filter?.roundNumberGte !== undefined) {
      where.round = {
        number: {
          ...(filter.roundNumberLt !== undefined && { lt: filter.roundNumberLt }),
          ...(filter.roundNumberGte !== undefined && { gte: filter.roundNumberGte }),
        },
      };
    }

    return this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        agent: {
          select: { id: true, name: true, role: true },
        },
      },
    }) as Promise<MessageWithAgent[]>;
  }

  /** Замаппить сообщения из БД в формат ChatMessage */
  private mapMessages(messages: MessageWithAgent[], currentAgent: Agent): ChatMessage[] {
    return messages.map((msg) => {
      if (msg.role === MESSAGE_ROLE.SYSTEM || msg.role === MESSAGE_ROLE.DIRECTOR_DECISION) {
        return { role: 'system' as const, content: msg.content };
      }

      if (msg.role === MESSAGE_ROLE.USER) {
        return { role: 'user' as const, content: msg.content };
      }

      // AGENT сообщение
      if (msg.agentId === currentAgent.id) {
        return { role: 'assistant' as const, content: msg.content };
      }

      const agentName = msg.agent?.name ?? 'Агент';
      return { role: 'user' as const, content: `[${agentName}]: ${msg.content}` };
    });
  }

  /** Запасная суммаризация без LLM — простое усечение последних 5 сообщений */
  private fallbackSummary(messages: ChatMessage[]): string {
    return messages
      .slice(-5)
      .map((m) => m.content.slice(0, 200))
      .join('\n...\n');
  }
}
