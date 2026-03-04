import type { ReasoningEffort } from "./llm.types";

/** Информация о модели из MODEL_REGISTRY */
export interface ModelInfo {
  /** Например: "anthropic/claude-sonnet-4-6" */
  id: string;
  /** Например: "Claude Sonnet 4.5" */
  name: string;
  /** Например: "openrouter" | "perplexity" */
  provider: string;
  /** Например: "claude" | "gpt" | "gemini" | "sonar" */
  family: string;
  /** true если API-ключ провайдера задан */
  available: boolean;
  /** Стоимость за 1K входных токенов в USD */
  costPer1kInput: number;
  /** Стоимость за 1K выходных токенов в USD */
  costPer1kOutput: number;
  /** Размер контекстного окна в токенах */
  contextWindow: number;
  /** Список возможностей: ["chat", "web_search", "reasoning", "thinking"] */
  capabilities: string[];
  /**
   * Уровень reasoning effort по умолчанию для этой модели.
   * Задаётся только для моделей с extended thinking (gpt-5.2-thinking, gpt-5.3-codex и т.д.).
   * Передаётся в OpenRouter через поле reasoning: { effort }.
   */
  reasoningEffort?: ReasoningEffort;
}
