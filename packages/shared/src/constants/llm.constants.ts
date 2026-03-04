/** Настройки LLM по умолчанию */
export const LLM_DEFAULTS = {
  TEMPERATURE: 0.7,
  MAX_TOKENS: 4096,
  OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
  PERPLEXITY_BASE_URL: "https://api.perplexity.ai",
} as const;
