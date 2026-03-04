/** Роль агента */
export const AGENT_ROLE = {
  DIRECTOR: "DIRECTOR",
  ANALYST: "ANALYST",
  RESEARCHER: "RESEARCHER",
} as const;

export type AgentRole = (typeof AGENT_ROLE)[keyof typeof AGENT_ROLE];
