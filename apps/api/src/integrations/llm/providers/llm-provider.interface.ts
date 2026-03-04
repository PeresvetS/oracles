import type { LlmChatParams, LlmChatResponse, LlmStreamChunk } from '@oracle/shared';

/**
 * Интерфейс LLM-провайдера.
 *
 * Каждый провайдер (OpenRouter, Perplexity, будущие) реализует этот контракт.
 * LlmGatewayService маршрутизирует запросы к нужному провайдеру по имени.
 */
export interface LlmProvider {
  /** Уникальное имя провайдера (e.g. "openrouter", "perplexity") */
  readonly providerName: string;

  /** Синхронный вызов LLM без стриминга */
  chat(params: LlmChatParams): Promise<LlmChatResponse>;

  /** Стриминг ответа LLM через AsyncGenerator */
  chatStream(params: LlmChatParams): AsyncGenerator<LlmStreamChunk>;
}
