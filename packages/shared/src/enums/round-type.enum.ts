/** Тип раунда */
export const ROUND_TYPE = {
  /** Первый раунд: аналитики генерируют идеи */
  INITIAL: "INITIAL",
  /** Раунды обсуждения */
  DISCUSSION: "DISCUSSION",
  /** Раунд с участием ресерчера */
  RESEARCH: "RESEARCH",
  /** Финальный скоринг */
  SCORING: "SCORING",
  /** Раунд от пользователя (не расходует лимит) */
  USER_INITIATED: "USER_INITIATED",
  /** Финализация директором */
  FINAL: "FINAL",
} as const;

export type RoundType = (typeof ROUND_TYPE)[keyof typeof ROUND_TYPE];
