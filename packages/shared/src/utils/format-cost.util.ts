const COST_FRACTION_DIGITS = 2;

/** Форматирование стоимости в USD */
export function formatCost(usd: number): string {
  return `$${usd.toFixed(COST_FRACTION_DIGITS)}`;
}
