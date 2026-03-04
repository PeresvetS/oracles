import type { ModelInfo } from '@oracle/shared';

/**
 * Реестр доступных LLM-моделей.
 *
 * Содержит все модели, поддерживаемые системой, с их стоимостью,
 * размером контекстного окна и возможностями.
 *
 * Поле `available` НЕ заполняется здесь — оно определяется в рантайме
 * через ModelsService на основании наличия API-ключа провайдера.
 *
 * Примечание: числовые литералы в ценах — допустимое исключение
 * из правила «нет магических чисел» (это данные, а не логика).
 */
export const MODEL_REGISTRY: Omit<ModelInfo, 'available'>[] = [
  // Claude family (через OpenRouter)
  {
    id: 'anthropic/claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'openrouter',
    family: 'claude',
    costPer1kInput: 0.003,
    costPer1kOutput: 0.015,
    contextWindow: 200_000,
    capabilities: ['chat', 'reasoning', 'web_search'],
  },
  {
    id: 'anthropic/claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'openrouter',
    family: 'claude',
    costPer1kInput: 0.015,
    costPer1kOutput: 0.075,
    contextWindow: 200_000,
    capabilities: ['chat', 'reasoning', 'web_search'],
  },

  // GPT family (через OpenRouter)
  {
    id: 'openai/gpt-5.2-thinking',
    name: 'GPT-5.2 Thinking',
    provider: 'openrouter',
    family: 'gpt',
    costPer1kInput: 0.005,
    costPer1kOutput: 0.015,
    contextWindow: 128_000,
    capabilities: ['chat', 'reasoning', 'thinking', 'web_search'],
    reasoningEffort: 'medium',
  },
  {
    id: 'openai/gpt-5.3-codex',
    name: 'GPT-5.3 Codex',
    provider: 'openrouter',
    family: 'gpt',
    costPer1kInput: 0.006,
    costPer1kOutput: 0.018,
    contextWindow: 128_000,
    capabilities: ['chat', 'code', 'reasoning', 'thinking', 'web_search'],
    reasoningEffort: 'medium',
  },
  {
    id: 'openai/gpt-5.3-chat',
    name: 'GPT-5.3 Chat',
    provider: 'openrouter',
    family: 'gpt',
    costPer1kInput: 0.004,
    costPer1kOutput: 0.012,
    contextWindow: 128_000,
    capabilities: ['chat', 'web_search'],
  },

  // Gemini family (через OpenRouter)
  {
    id: 'google/gemini-3.1-pro',
    name: 'Gemini 3.1 Pro',
    provider: 'openrouter',
    family: 'gemini',
    costPer1kInput: 0.00125,
    costPer1kOutput: 0.01,
    contextWindow: 1_000_000,
    capabilities: ['chat', 'reasoning', 'web_search'],
  },

  // Perplexity Sonar (прямой API)
  {
    id: 'sonar-reasoning-pro',
    name: 'Sonar Reasoning Pro',
    provider: 'perplexity',
    family: 'sonar',
    costPer1kInput: 0.001,
    costPer1kOutput: 0.005,
    contextWindow: 128_000,
    capabilities: ['chat', 'web_search', 'citations'],
  },
  {
    id: 'sonar-pro',
    name: 'Sonar Pro',
    provider: 'perplexity',
    family: 'sonar',
    costPer1kInput: 0.0003,
    costPer1kOutput: 0.0015,
    contextWindow: 200_000,
    capabilities: ['chat', 'web_search', 'citations'],
  },
];

/** Маппинг провайдера на ключ настройки API-ключа */
export const PROVIDER_API_KEY_MAP: Record<string, string> = {
  openrouter: 'openrouter_api_key',
  perplexity: 'perplexity_api_key',
  anthropic: 'anthropic_api_key',
  openai: 'openai_api_key',
  google: 'google_api_key',
};
