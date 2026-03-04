import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export { formatCost, formatTokens } from '@oracle/shared';

/** Объединение Tailwind классов с поддержкой конфликтов */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
