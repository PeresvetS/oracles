/** Настройки агентов по умолчанию */
export const AGENT_DEFAULTS = {
  TIMEOUT_MS: 120_000,
  MAX_TOOL_CALLS_PER_TURN: 5,
  RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY_MS: 1_000,
  CONTEXT_SUMMARIZE_FROM_ROUND: 3,
  SUMMARY_MAX_WORDS: 500,
} as const;

/** Цвета агентов для UI */
export const AGENT_COLORS = {
  DIRECTOR: "blue",
  ANALYST_1: "emerald",
  ANALYST_2: "orange",
  ANALYST_3: "yellow",
  ANALYST_4: "cyan",
  ANALYST_5: "pink",
  ANALYST_6: "red",
  RESEARCHER: "purple",
  USER: "green",
  SYSTEM: "gray",
} as const;
