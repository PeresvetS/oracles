import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { LLM_DEFAULTS } from '@oracle/shared';
import type { LlmChatParams, LlmChatResponse, LlmStreamChunk, ChatMessage } from '@oracle/shared';
import { MODEL_REGISTRY } from '@config/models.registry';
import { SettingsService } from '@settings/settings.service';
import type { LlmProvider } from '@integrations/llm/providers/llm-provider.interface';

/** Делитель для расчёта стоимости (цена за 1K токенов) */
const TOKENS_PER_COST_UNIT = 1000;

/** Заголовок блока источников, добавляемого к ответу */
const CITATIONS_HEADER = '\n\n---\n**Источники:**';

/** Интерфейс расширенного ответа Perplexity с citations */
interface PerplexityResponse {
  citations?: string[];
}

/**
 * Провайдер Perplexity Sonar.
 *
 * Используется для роли Ресерчера — глубокий поиск через встроенный web-search.
 * Perplexity API совместим с OpenAI, но со следующими ограничениями:
 *
 * - tools НЕ поддерживаются (поиск — встроенная возможность)
 * - Ответ может содержать citations (массив URL-источников)
 * - Поддерживается streaming (stream: true)
 * - Рекомендуемые модели: sonar-pro, sonar-reasoning-pro
 */
@Injectable()
export class PerplexityProvider implements LlmProvider {
  private readonly logger = new Logger(PerplexityProvider.name);
  readonly providerName = 'perplexity';

  private client: OpenAI | null = null;
  private lastApiKey: string | null = null;

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Синхронный вызов Perplexity Sonar.
   *
   * tools игнорируются — Perplexity использует встроенный web-search.
   * Citations (если есть) добавляются к content как нумерованный список.
   *
   * @throws Error если API-ключ не настроен или Perplexity вернул пустой ответ
   */
  async chat(params: LlmChatParams): Promise<LlmChatResponse> {
    const client = this.getClient();
    const startTime = Date.now();

    const response = await client.chat.completions.create({
      model: params.modelId,
      messages: this.mapMessages(params.messages),
      temperature: params.temperature ?? LLM_DEFAULTS.TEMPERATURE,
      max_tokens: params.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS,
    });

    const choice = response.choices[0];
    if (!choice) {
      throw new Error(`Perplexity вернул пустой ответ для модели ${params.modelId}`);
    }

    const usage = response.usage;
    const tokensInput = usage?.prompt_tokens ?? 0;
    const tokensOutput = usage?.completion_tokens ?? 0;
    const costUsd = this.calculateCost(params.modelId, tokensInput, tokensOutput);
    const latencyMs = Date.now() - startTime;

    // Perplexity может возвращать citations в расширенном поле
    const citations = (response as unknown as PerplexityResponse).citations;
    const content = this.appendCitations(choice.message.content ?? '', citations);

    this.logger.debug(
      `Perplexity chat: model=${params.modelId}, tokens=${tokensInput}+${tokensOutput}, cost=$${costUsd.toFixed(6)}, latency=${latencyMs}ms, citations=${citations?.length ?? 0}`,
    );

    return {
      content,
      tokensInput,
      tokensOutput,
      costUsd,
      latencyMs,
      model: response.model ?? params.modelId,
    };
  }

  /**
   * Стриминг ответа Perplexity.
   *
   * Tool calls не поддерживаются, yield-ит только text и done чанки.
   * Citations доступны только в не-стриминговом режиме (ограничение Perplexity API).
   *
   * @throws Error если API-ключ не настроен
   */
  async *chatStream(params: LlmChatParams): AsyncGenerator<LlmStreamChunk> {
    const client = this.getClient();
    const startTime = Date.now();

    const stream = await client.chat.completions.create({
      model: params.modelId,
      messages: this.mapMessages(params.messages),
      temperature: params.temperature ?? LLM_DEFAULTS.TEMPERATURE,
      max_tokens: params.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
    });

    let tokensInput = 0;
    let tokensOutput = 0;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;

      if (delta?.content) {
        yield { type: 'text', text: delta.content };
      }

      if (chunk.usage) {
        tokensInput = chunk.usage.prompt_tokens ?? 0;
        tokensOutput = chunk.usage.completion_tokens ?? 0;
      }
    }

    const costUsd = this.calculateCost(params.modelId, tokensInput, tokensOutput);
    const latencyMs = Date.now() - startTime;

    this.logger.debug(
      `Perplexity stream: model=${params.modelId}, tokens=${tokensInput}+${tokensOutput}, cost=$${costUsd.toFixed(6)}, latency=${latencyMs}ms`,
    );

    yield {
      type: 'done',
      usage: { tokensInput, tokensOutput, costUsd },
    };
  }

  /**
   * Рассчитать стоимость вызова по MODEL_REGISTRY.
   * Если модель не найдена — логирует предупреждение и возвращает 0.
   */
  calculateCost(modelId: string, tokensInput: number, tokensOutput: number): number {
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
   * Lazy-инициализация OpenAI клиента для Perplexity.
   * Пересоздаёт клиент если API-ключ изменился.
   *
   * @throws Error если API-ключ Perplexity не настроен
   */
  private getClient(): OpenAI {
    const apiKey = this.settingsService.get('perplexity_api_key');

    if (!apiKey) {
      throw new Error(
        'API-ключ Perplexity не настроен. Укажите его в настройках или переменной окружения PERPLEXITY_API_KEY.',
      );
    }

    if (this.client && this.lastApiKey === apiKey) {
      return this.client;
    }

    this.client = new OpenAI({
      baseURL: LLM_DEFAULTS.PERPLEXITY_BASE_URL,
      apiKey,
    });
    this.lastApiKey = apiKey;

    this.logger.log('OpenAI клиент для Perplexity создан/обновлён');
    return this.client;
  }

  /**
   * Маппинг ChatMessage[] → формат OpenAI API.
   * Perplexity не поддерживает tool_calls, поэтому они игнорируются.
   */
  private mapMessages(messages: ChatMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages
      .filter((msg) => msg.role !== 'tool')
      .map((msg): OpenAI.ChatCompletionMessageParam => {
        switch (msg.role) {
          case 'system':
            return { role: 'system', content: msg.content };
          case 'user':
            return { role: 'user', content: msg.content };
          case 'assistant':
            return { role: 'assistant', content: msg.content };
          default:
            return { role: 'user', content: msg.content };
        }
      });
  }

  /**
   * Добавить блок источников (citations) к content.
   * Если citations нет или массив пуст — возвращает content без изменений.
   */
  private appendCitations(content: string, citations?: string[]): string {
    if (!citations?.length) return content;

    const citationsList = citations.map((url, index) => `${index + 1}. ${url}`).join('\n');

    return `${content}${CITATIONS_HEADER}\n${citationsList}`;
  }
}
