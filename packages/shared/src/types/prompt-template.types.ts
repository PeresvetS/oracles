import type { AgentRole } from "../enums/agent-role.enum";

/** Шаблон промпта (DTO для клиента) */
export interface PromptTemplateDto {
  id: string;
  role: AgentRole;
  modelId: string | null;
  name: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}
