import type { AgentRole } from "../enums/agent-role.enum";

/** Агент (DTO для клиента) */
export interface AgentDto {
  id: string;
  sessionId: string;
  role: AgentRole;
  name: string;
  provider: string;
  modelId: string;
  systemPrompt: string;
  webSearchEnabled: boolean;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCostUsd: number;
  createdAt: string;
}
