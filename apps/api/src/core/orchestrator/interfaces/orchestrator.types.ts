import type { Session, Agent } from '@prisma/client';
import type { ChatMessage, ToolCallResult, ToolDefinition } from '@oracle/shared';

/** Сессия с загруженными агентами */
export interface SessionWithAgents extends Session {
  agents: Agent[];
}

/** Параметры запуска агента */
export interface RunAgentParams {
  /** Агент, от имени которого выполняется запрос */
  agent: Agent;
  /** Цепочка сообщений для LLM */
  messages: ChatMessage[];
  /** ID сессии */
  sessionId: string;
  /** ID раунда */
  roundId: string;
  /** Определения доступных тулзов для LLM (опционально) */
  tools?: ToolDefinition[];
  /** Сессия с агентами (нужна для call_researcher: лимиты и researcher agent) */
  session?: SessionWithAgents;
}

/** Результат работы агента */
export interface AgentRunnerResult {
  /** Текст ответа агента */
  content: string;
  /** Входные токены (суммарно по всем LLM-вызовам в рамках tool loop) */
  tokensInput: number;
  /** Выходные токены (суммарно) */
  tokensOutput: number;
  /** Стоимость в USD (суммарно) */
  costUsd: number;
  /** Задержка финального ответа в миллисекундах */
  latencyMs: number;
  /** Вызовы инструментов за всё время работы агента */
  toolCalls: ToolCallResult[];
  /** ID созданного сообщения в БД */
  messageId: string;
}

/** Событие нового сообщения от агента */
export interface AgentMessageEvent {
  messageId: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  roundId: string;
  content: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
}

/** Событие начала выполнения тулзы */
export interface ToolStartEvent {
  /** UUID сообщения, внутри которого вызвана тулза */
  messageId: string;
  /** ID агента, вызывающего тулзу */
  agentId: string;
  /** Имя тулзы (web_search, call_researcher) */
  toolName: string;
  /** Запрос к тулзе */
  query: string;
}

/** Событие результата выполнения тулзы */
export interface ToolResultEvent {
  /** UUID сообщения, внутри которого вызвана тулза */
  messageId: string;
  /** ID агента */
  agentId: string;
  /** Имя тулзы */
  toolName: string;
  /** Полный результат тулзы */
  result: string;
}

/** Событие начала раунда */
export interface RoundStartedEvent {
  roundId: string;
  number: number;
  type: string;
}

/** Событие завершения раунда */
export interface RoundCompletedEvent {
  roundId: string;
  number: number;
}

/** Событие начала стриминга сообщения агента */
export interface MessageStartEvent {
  /** UUID сообщения (используется во всех последующих chunk/end событиях) */
  messageId: string;
  /** ID агента */
  agentId: string;
  /** Имя агента */
  agentName: string;
  /** Роль агента */
  agentRole: string;
  /** ID раунда */
  roundId: string;
}

/** Событие текстового чанка стриминга */
export interface MessageChunkEvent {
  /** UUID сообщения */
  messageId: string;
  /** Текстовый чанк */
  chunk: string;
}

/** Событие завершения стриминга сообщения */
export interface MessageEndEvent {
  /** UUID сообщения */
  messageId: string;
  /** Входные токены (суммарно по всему tool loop) */
  tokensInput: number;
  /** Выходные токены (суммарно) */
  tokensOutput: number;
  /** Стоимость в USD (суммарно) */
  costUsd: number;
  /** Суммарная задержка в миллисекундах */
  latencyMs: number;
}

/** Событие смены статуса сессии */
export interface SessionStatusEvent {
  status: string;
  currentRound: number;
  totalCostUsd: number;
}

/** Событие чанка thinking/reasoning от модели с extended thinking */
export interface ThinkingChunkEvent {
  /** UUID сообщения, к которому относится thinking */
  messageId: string;
  /** Текст блока reasoning */
  thinking: string;
}
