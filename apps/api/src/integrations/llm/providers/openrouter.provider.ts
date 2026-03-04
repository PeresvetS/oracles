import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { LLM_DEFAULTS } from '@oracle/shared';
import type {
  LlmChatParams,
  LlmChatResponse,
  LlmStreamChunk,
  ChatMessage,
  ToolCall,
  ToolDefinition,
  ReasoningDetail,
  ReasoningEffort,
  UrlCitation,
} from '@oracle/shared';
import { MODEL_REGISTRY } from '@config/models.registry';
import { SettingsService } from '@settings/settings.service';
import type { LlmProvider } from '@integrations/llm/providers/llm-provider.interface';

/** Реферер для идентификации приложения в OpenRouter */
const OPENROUTER_REFERER = 'https://oracle.besales.app';

/** Название приложения в OpenRouter */
const OPENROUTER_TITLE = 'Oracle AI Board';

/** Делитель для расчёта стоимости (цена за 1K токенов) */
const TOKENS_PER_COST_UNIT = 1000;

/** Плагин OpenRouter (web search и другие) */
interface OpenRouterPlugin {
  id: string;
  engine?: 'native' | 'exa';
  max_results?: number;
}

/** Сырой формат аннотации от OpenRouter */
interface RawAnnotation {
  type: string;
  url_citation?: {
    url: string;
    title?: string;
    content?: string;
    start_index?: number;
    end_index?: number;
  };
}

/**
 * Расширение delta чанка стриминга для reasoning_details и annotations.
 * OpenAI SDK не типизирует эти поля — используем локальный тип.
 */
interface StreamDeltaWithReasoning {
  reasoning_details?: Array<{ type: string; text?: string; summary?: string }>;
  annotations?: RawAnnotation[];
}

/** Альтернативная структура streaming-чанка, где annotations могут прийти не в delta */
interface StreamChunkWithAnnotations {
  annotations?: RawAnnotation[];
  choices?: Array<{
    message?: {
      annotations?: RawAnnotation[];
    };
  }>;
}

/**
 * Расширение сообщения ассистента в ответе (non-streaming) для reasoning_details и annotations.
 * OpenAI SDK не типизирует эти поля — используем локальный тип.
 */
interface AssistantMessageWithReasoning {
  reasoning_details?: Array<{ type: string; text?: string; summary?: string }>;
  annotations?: RawAnnotation[];
}

/**
 * Провайдер OpenRouter.
 *
 * Маршрутизирует запросы к Claude, GPT, Gemini через единый OpenRouter API.
 * Использует OpenAI SDK (OpenRouter совместим с OpenAI API).
 *
 * Особенности:
 * - Lazy-инициализация клиента (создаётся при первом вызове)
 * - Пересоздание клиента при смене API-ключа
 * - Расчёт стоимости по MODEL_REGISTRY
 * - Стриминг через AsyncGenerator
 * - Поддержка extended thinking через reasoning: { effort } (OpenRouter non-standard extension)
 */
@Injectable()
export class OpenRouterProvider implements LlmProvider {
  private readonly logger = new Logger(OpenRouterProvider.name);
  readonly providerName = 'openrouter';

  private client: OpenAI | null = null;
  private lastApiKey: string | null = null;

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Синхронный вызов LLM через OpenRouter.
   *
   * Для моделей с extended thinking автоматически добавляет reasoning: { effort }.
   *
   * @throws Error если API-ключ не настроен или OpenRouter вернул пустой ответ
   */
  async chat(params: LlmChatParams): Promise<LlmChatResponse> {
    const client = this.getClient();
    const startTime = Date.now();
    const reasoningEffort = this.resolveReasoningEffort(params);
    const plugins: OpenRouterPlugin[] | undefined = params.webSearchEnabled
      ? [{ id: 'web' }]
      : undefined;

    const requestParams = {
      model: params.modelId,
      messages: this.mapMessages(params.messages),
      temperature: params.temperature ?? LLM_DEFAULTS.TEMPERATURE,
      max_tokens: params.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS,
      ...(params.tools?.length ? { tools: this.mapTools(params.tools) } : {}),
      ...(plugins ? { plugins } : {}),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    };

    const response = await client.chat.completions.create(
      requestParams as OpenAI.ChatCompletionCreateParamsNonStreaming,
    );

    const choice = response.choices[0];
    if (!choice) {
      throw new Error(`OpenRouter вернул пустой ответ для модели ${params.modelId}`);
    }

    const usage = response.usage;
    const tokensInput = usage?.prompt_tokens ?? 0;
    const tokensOutput = usage?.completion_tokens ?? 0;
    const costUsd = this.calculateCost(params.modelId, tokensInput, tokensOutput);
    const latencyMs = Date.now() - startTime;

    const toolCalls = this.parseToolCalls(choice.message.tool_calls);

    // Извлечь reasoning_details и annotations (OpenRouter non-standard extensions)
    const msgWithExtensions = choice.message as unknown as AssistantMessageWithReasoning;
    const reasoningDetails = this.parseReasoningDetails(msgWithExtensions.reasoning_details);
    const annotations = this.parseAnnotations(msgWithExtensions.annotations);

    this.logger.debug(
      `OpenRouter chat: model=${params.modelId}, tokens=${tokensInput}+${tokensOutput}, cost=$${costUsd.toFixed(6)}, latency=${latencyMs}ms${reasoningDetails.length ? `, thinking=${reasoningDetails.length} blocks` : ''}${annotations.length ? `, annotations=${annotations.length}` : ''}`,
    );

    return {
      content: choice.message.content ?? '',
      tokensInput,
      tokensOutput,
      costUsd,
      latencyMs,
      model: (response as unknown as { model?: string }).model ?? params.modelId,
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      ...(reasoningDetails.length > 0 ? { reasoning_details: reasoningDetails } : {}),
      ...(annotations.length > 0 ? { annotations } : {}),
    };
  }

  /**
   * Стриминг ответа LLM через OpenRouter.
   *
   * Yield-ит чанки типов: text, reasoning, tool_call, done.
   * При type=done содержит итоговый usage с токенами и стоимостью.
   * При type=reasoning содержит текст блока thinking.
   *
   * @throws Error если API-ключ не настроен
   */
  async *chatStream(params: LlmChatParams): AsyncGenerator<LlmStreamChunk> {
    const client = this.getClient();
    const startTime = Date.now();
    const reasoningEffort = this.resolveReasoningEffort(params);
    const plugins: OpenRouterPlugin[] | undefined = params.webSearchEnabled
      ? [{ id: 'web' }]
      : undefined;

    const requestParams = {
      model: params.modelId,
      messages: this.mapMessages(params.messages),
      temperature: params.temperature ?? LLM_DEFAULTS.TEMPERATURE,
      max_tokens: params.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS,
      ...(params.tools?.length ? { tools: this.mapTools(params.tools) } : {}),
      ...(plugins ? { plugins } : {}),
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      stream: true as const,
      stream_options: { include_usage: true },
    };

    const stream = await client.chat.completions.create(
      requestParams as Parameters<typeof client.chat.completions.create>[0] & { stream: true },
    );

    /** Аккумулятор tool_calls по индексу */
    const toolCallsMap = new Map<number, { id: string; name: string; args: string }>();
    /** Аккумулятор annotations из всех чанков */
    const accumulatedAnnotations: UrlCitation[] = [];
    const annotationKeys = new Set<string>();
    let tokensInput = 0;
    let tokensOutput = 0;

    for await (const chunk of stream as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>) {
      const delta = chunk.choices?.[0]?.delta;

      // Текстовый чанк
      if (delta?.content) {
        yield { type: 'text', text: delta.content };
      }

      // Reasoning/thinking и annotations (OpenRouter non-standard extensions)
      const rawDelta = delta as unknown as StreamDeltaWithReasoning;
      if (rawDelta?.reasoning_details?.length) {
        for (const rd of rawDelta.reasoning_details) {
          const reasoningText = rd.text ?? rd.summary ?? '';
          if (reasoningText) {
            yield { type: 'reasoning', reasoning: reasoningText };
          }
        }
      }

      // Annotations из delta (web plugin citations)
      if (rawDelta?.annotations?.length) {
        this.addUniqueAnnotations(
          accumulatedAnnotations,
          this.parseAnnotations(rawDelta.annotations),
          annotationKeys,
        );
      }

      // Fallback: часть моделей отдаёт annotations в choice.message или top-level chunk.
      const chunkWithAnnotations = chunk as unknown as StreamChunkWithAnnotations;
      const messageAnnotations = chunkWithAnnotations.choices?.[0]?.message?.annotations;
      if (messageAnnotations?.length) {
        this.addUniqueAnnotations(
          accumulatedAnnotations,
          this.parseAnnotations(messageAnnotations),
          annotationKeys,
        );
      }

      if (chunkWithAnnotations.annotations?.length) {
        this.addUniqueAnnotations(
          accumulatedAnnotations,
          this.parseAnnotations(chunkWithAnnotations.annotations),
          annotationKeys,
        );
      }

      // Tool call чанки (аккумуляция)
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const existing = toolCallsMap.get(idx);

          if (existing) {
            existing.args += tc.function?.arguments ?? '';
          } else {
            toolCallsMap.set(idx, {
              id: tc.id ?? '',
              name: tc.function?.name ?? '',
              args: tc.function?.arguments ?? '',
            });
          }
        }
      }

      // Usage (приходит в последнем чанке)
      if (chunk.usage) {
        tokensInput = chunk.usage.prompt_tokens ?? 0;
        tokensOutput = chunk.usage.completion_tokens ?? 0;
      }
    }

    // Yield собранные tool_calls
    for (const [, tc] of toolCallsMap) {
      yield {
        type: 'tool_call',
        toolCall: {
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.args },
        },
      };
    }

    // Yield собранные annotations (web plugin citations)
    if (accumulatedAnnotations.length > 0) {
      yield { type: 'annotations', annotations: accumulatedAnnotations };
    }

    // Финальный чанк с usage
    const costUsd = this.calculateCost(params.modelId, tokensInput, tokensOutput);
    const latencyMs = Date.now() - startTime;

    this.logger.debug(
      `OpenRouter stream: model=${params.modelId}, tokens=${tokensInput}+${tokensOutput}, cost=$${costUsd.toFixed(6)}, latency=${latencyMs}ms${accumulatedAnnotations.length ? `, annotations=${accumulatedAnnotations.length}` : ''}`,
    );

    yield {
      type: 'done',
      usage: { tokensInput, tokensOutput, costUsd },
    };
  }

  /**
   * Рассчитать стоимость вызова по MODEL_REGISTRY.
   * Если модель не найдена в реестре — логирует предупреждение и возвращает 0.
   */
  private calculateCost(modelId: string, tokensInput: number, tokensOutput: number): number {
    const model = MODEL_REGISTRY.find((m) => m.id === modelId);

    if (!model) {
      this.logger.warn(`Модель ${modelId} не найдена в MODEL_REGISTRY, стоимость = 0`);
      return 0;
    }

    return (
      (tokensInput / TOKENS_PER_COST_UNIT) * model.costPer1kInput +
      (tokensOutput / TOKENS_PER_COST_UNIT) * model.costPer1kOutput
    );
  }

  /**
   * Определить уровень reasoning effort для запроса.
   *
   * Приоритет:
   * 1. Явное значение из params.reasoningEffort
   * 2. Значение из MODEL_REGISTRY по modelId
   * 3. undefined (thinking не активируется)
   */
  private resolveReasoningEffort(params: LlmChatParams): ReasoningEffort | undefined {
    if (params.reasoningEffort) {
      return params.reasoningEffort;
    }

    const modelEntry = MODEL_REGISTRY.find((m) => m.id === params.modelId);
    return modelEntry?.reasoningEffort;
  }

  /**
   * Lazy-инициализация OpenAI клиента.
   * Пересоздаёт клиент если API-ключ изменился.
   *
   * @throws Error если API-ключ OpenRouter не настроен
   */
  private getClient(): OpenAI {
    const apiKey = this.settingsService.get('openrouter_api_key');

    if (!apiKey) {
      throw new Error(
        'API-ключ OpenRouter не настроен. Укажите его в настройках или переменной окружения OPENROUTER_API_KEY.',
      );
    }

    if (this.client && this.lastApiKey === apiKey) {
      return this.client;
    }

    this.client = new OpenAI({
      baseURL: LLM_DEFAULTS.OPENROUTER_BASE_URL,
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': OPENROUTER_REFERER,
        'X-Title': OPENROUTER_TITLE,
      },
    });
    this.lastApiKey = apiKey;

    this.logger.log('OpenAI клиент для OpenRouter создан/обновлён');
    return this.client;
  }

  /**
   * Маппинг ChatMessage[] → формат OpenAI API.
   * Обрабатывает роли system, user, assistant (с tool_calls и reasoning_details), tool.
   *
   * reasoning_details из предыдущего хода сохраняются для корректной multi-turn работы
   * с моделями extended thinking — OpenRouter требует передавать их обратно.
   */
  private mapMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg): OpenAI.ChatCompletionMessageParam => {
      switch (msg.role) {
        case 'system':
          return { role: 'system', content: msg.content };
        case 'user':
          return { role: 'user', content: msg.content };
        case 'assistant': {
          const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam & {
            reasoning_details?: ReasoningDetail[];
          } = {
            role: 'assistant',
            content: msg.content,
          };
          if (msg.tool_calls?.length) {
            assistantMsg.tool_calls = msg.tool_calls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.function.name, arguments: tc.function.arguments },
            }));
          }
          // Передаём reasoning_details обратно для multi-turn continuity
          if (msg.reasoning_details?.length) {
            assistantMsg.reasoning_details = msg.reasoning_details;
          }
          return assistantMsg as OpenAI.ChatCompletionAssistantMessageParam;
        }
        case 'tool':
          return {
            role: 'tool',
            content: msg.content,
            tool_call_id: msg.tool_call_id ?? '',
          };
        default:
          return { role: 'user', content: msg.content };
      }
    });
  }

  /** Маппинг ToolDefinition[] → формат OpenAI tools */
  private mapTools(tools: ToolDefinition[]): OpenAI.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
  }

  /** Парсинг tool_calls из ответа OpenAI */
  private parseToolCalls(rawToolCalls?: OpenAI.ChatCompletionMessageToolCall[]): ToolCall[] {
    if (!rawToolCalls?.length) return [];

    // В openai v6 ChatCompletionMessageToolCall — union FunctionToolCall | CustomToolCall.
    // Фильтруем только function tool calls через type guard.
    return rawToolCalls
      .filter(
        (tc): tc is OpenAI.ChatCompletionMessageFunctionToolCall =>
          'function' in tc &&
          typeof (tc as OpenAI.ChatCompletionMessageFunctionToolCall).function === 'object',
      )
      .map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
  }

  /**
   * Парсинг annotations из ответа OpenRouter (web plugin citations).
   * Нормализует сырые объекты в типизированный массив UrlCitation[].
   */
  private parseAnnotations(raw?: RawAnnotation[]): UrlCitation[] {
    if (!raw?.length) return [];

    return raw
      .filter((a) => a.type === 'url_citation' && a.url_citation?.url)
      .map((a): UrlCitation => {
        const citation = a.url_citation!;
        return {
          url: citation.url,
          title: citation.title ?? citation.url,
          ...(citation.content ? { content: citation.content } : {}),
          ...(citation.start_index !== undefined ? { startIndex: citation.start_index } : {}),
          ...(citation.end_index !== undefined ? { endIndex: citation.end_index } : {}),
        };
      });
  }

  /**
   * Парсинг reasoning_details из ответа OpenRouter.
   * Нормализует сырые объекты в типизированный массив ReasoningDetail[].
   */
  private parseReasoningDetails(
    raw?: Array<{ type: string; text?: string; summary?: string }>,
  ): ReasoningDetail[] {
    if (!raw?.length) return [];

    return raw
      .map((rd): ReasoningDetail | null => {
        const text = rd.text ?? rd.summary ?? '';
        if (!text) return null;

        const type = rd.type === 'summary' ? 'summary' : 'thinking';
        return { type, text };
      })
      .filter((rd): rd is ReasoningDetail => rd !== null);
  }

  /** Добавить цитаты в аккумулятор без дублей */
  private addUniqueAnnotations(
    target: UrlCitation[],
    incoming: UrlCitation[],
    seenKeys: Set<string>,
  ): void {
    for (const citation of incoming) {
      const key =
        `${citation.url}|${citation.title}|` +
        `${citation.startIndex ?? ''}|${citation.endIndex ?? ''}`;

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        target.push(citation);
      }
    }
  }
}
