import type { MessageRole } from "../enums/message-role.enum";

/** Вызов инструмента агентом */
export interface ToolCallDto {
  tool: string;
  query: string;
  result: string;
}

/** Сообщение (DTO для клиента) */
export interface MessageDto {
  id: string;
  sessionId: string;
  roundId: string;
  agentId: string | null;
  role: MessageRole;
  content: string;
  modelUsed: string | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  costUsd: number | null;
  latencyMs: number | null;
  toolCalls: ToolCallDto[] | null;
  createdAt: string;
}
