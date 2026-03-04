/** Роль сообщения */
export const MESSAGE_ROLE = {
  AGENT: "AGENT",
  USER: "USER",
  SYSTEM: "SYSTEM",
  DIRECTOR_DECISION: "DIRECTOR_DECISION",
} as const;

export type MessageRole = (typeof MESSAGE_ROLE)[keyof typeof MESSAGE_ROLE];
