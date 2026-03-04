const KILO = 1_000;
const MEGA = 1_000_000;

/** Форматирование количества токенов для отображения */
export function formatTokens(count: number): string {
  if (count >= MEGA) {
    return `${(count / MEGA).toFixed(1)}M`;
  }
  if (count >= KILO) {
    return `${(count / KILO).toFixed(1)}K`;
  }
  return String(count);
}
