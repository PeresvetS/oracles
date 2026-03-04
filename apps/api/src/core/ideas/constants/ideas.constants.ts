import { SESSION_LIMITS } from '@oracle/shared';

/** Ограничения компонентов ICE */
export const IDEA_LIMITS = {
  ICE_MIN: 1,
  ICE_MAX: 10,
  RICE_CONFIDENCE_MIN: 0,
  RICE_CONFIDENCE_MAX: 1,
  RICE_COMPONENT_MIN: 1,
  RICE_COMPONENT_MAX: 10,
  /** Количество финальных идей по умолчанию */
  DEFAULT_TOP_COUNT: SESSION_LIMITS.DEFAULT_MAX_IDEAS_FINAL,
  /** Максимальное количество финальных идей */
  MAX_TOP_COUNT: SESSION_LIMITS.MAX_IDEAS_FINAL,
} as const;

/** Допустимые переходы статусов идеи */
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  PROPOSED: ['ACTIVE', 'REJECTED'],
  ACTIVE: ['FINAL', 'REJECTED'],
};

/**
 * Причина отклонения идеи по умолчанию (при финализации ТОП).
 * Используется placeholders: {n}
 */
export const DEFAULT_REJECTION_REASON = 'Не вошла в ТОП-{n} по скорингу ICE/RICE';
