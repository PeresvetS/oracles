/**
 * Константы для rate limiting (ThrottlerModule).
 * TTL и лимит запросов на пользователя.
 */
export const THROTTLE_DEFAULTS = {
  /** Окно времени в миллисекундах (1 минута) */
  TTL_MS: 60_000,
  /** Максимальное количество запросов за TTL_MS */
  LIMIT: 100,
} as const;
