/** Уровень детализации reasoning (thinking) по unified OpenRouter API */
export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

/** Цитата из веб-поиска (формат OpenRouter annotations) */
export interface UrlCitation {
  url: string;
  title: string;
  /** Фрагмент текста страницы (если OpenRouter вернул) */
  content?: string;
  startIndex?: number;
  endIndex?: number;
}

/** Один блок reasoning (thinking) в ответе модели */
export interface ReasoningDetail {
  /** Тип блока: "thinking" — мысли модели, "summary" — краткое резюме */
  type: "thinking" | "summary";
  /** Текст блока */
  text: string;
}

/** Сообщение в цепочке LLM */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  /** Блоки reasoning из предыдущего ответа ассистента (нужны для multi-turn с thinking) */
  reasoning_details?: ReasoningDetail[];
}

/** Вызов тулзы (формат OpenAI) */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    /** JSON-строка с аргументами */
    arguments: string;
  };
}

/** Определение тулзы для передачи в LLM */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    /** JSON Schema параметров */
    parameters: Record<string, unknown>;
  };
}

/** Результат выполнения тулзы */
export interface ToolCallResult {
  tool: string;
  query: string;
  result: string;
}

/** Параметры вызова LLM */
export interface LlmChatParams {
  /** Провайдер: "openrouter" | "perplexity" | … */
  provider: string;
  /** ID модели: "anthropic/claude-sonnet-4-6" | "sonar-pro" | … */
  modelId: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  /** По умолчанию: LLM_DEFAULTS.TEMPERATURE */
  temperature?: number;
  /** По умолчанию: LLM_DEFAULTS.MAX_TOKENS */
  maxTokens?: number;
  /** По умолчанию: true */
  stream?: boolean;
  /**
   * Уровень reasoning (thinking) для моделей с extended thinking.
   * Если не указан — определяется автоматически из MODEL_REGISTRY по modelId.
   * Если модель не поддерживает thinking — игнорируется.
   */
  reasoningEffort?: ReasoningEffort;
  /**
   * Включить OpenRouter web search plugin (plugins: [{ id: "web" }]).
   * Не требует Serper API — OpenRouter использует нативный поиск (Claude/GPT/xAI)
   * или Exa (~$0.02/запрос) для остальных моделей.
   */
  webSearchEnabled?: boolean;
}

/** Ответ LLM (без стриминга) */
export interface LlmChatResponse {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  latencyMs: number;
  toolCalls?: ToolCall[];
  /** Фактически использованная модель (может отличаться от запрошенной) */
  model: string;
  /** Блоки reasoning из ответа (только для моделей с extended thinking) */
  reasoning_details?: ReasoningDetail[];
  /** URL-цитаты из веб-поиска (OpenRouter web plugin annotations) */
  annotations?: UrlCitation[];
}

/** Чанк стриминга */
export interface LlmStreamChunk {
  type: "text" | "tool_call" | "usage" | "done" | "reasoning" | "annotations";
  text?: string;
  toolCall?: ToolCall;
  usage?: {
    tokensInput: number;
    tokensOutput: number;
    costUsd: number;
  };
  /** Текст блока reasoning (только при type="reasoning") */
  reasoning?: string;
  /** URL-цитаты из веб-поиска (только при type="annotations") */
  annotations?: UrlCitation[];
}
