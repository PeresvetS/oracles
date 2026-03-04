/** Статус идеи */
export const IDEA_STATUS = {
  PROPOSED: "PROPOSED",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  FINAL: "FINAL",
} as const;

export type IdeaStatus = (typeof IDEA_STATUS)[keyof typeof IDEA_STATUS];
