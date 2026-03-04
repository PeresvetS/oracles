/** Режим сессии */
export const SESSION_MODE = {
  GENERATE: "GENERATE",
  VALIDATE: "VALIDATE",
} as const;

export type SessionMode = (typeof SESSION_MODE)[keyof typeof SESSION_MODE];
