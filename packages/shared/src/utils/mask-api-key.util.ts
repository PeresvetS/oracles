import { AUTH } from "../constants/auth.constants";

/**
 * Маскирование API-ключа.
 * Показывает только последние `visibleChars` символов, остальное заменяет на `****`.
 */
export function maskApiKey(
  key: string,
  visibleChars: number = AUTH.API_KEY_MASK_LENGTH,
): string {
  if (key.length <= visibleChars) {
    return "****";
  }
  return `****${key.slice(-visibleChars)}`;
}
