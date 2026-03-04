/** Статус раунда */
export const ROUND_STATUS = {
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type RoundStatus = (typeof ROUND_STATUS)[keyof typeof ROUND_STATUS];
