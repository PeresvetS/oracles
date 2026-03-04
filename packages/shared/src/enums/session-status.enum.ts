/** Статус сессии */
export const SESSION_STATUS = {
  CONFIGURING: "CONFIGURING",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  ERROR: "ERROR",
} as const;

export type SessionStatus =
  (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];
