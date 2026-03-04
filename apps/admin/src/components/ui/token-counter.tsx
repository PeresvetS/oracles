import { formatCost } from '@/lib/utils';

interface TokenCounterProps {
  costUsd: number;
  className?: string;
}

/** Отображение стоимости в формате $X.XXXX */
export function TokenCounter({ costUsd, className }: TokenCounterProps) {
  return (
    <span className={`font-mono text-xs text-muted-foreground ${className ?? ''}`}>
      {formatCost(costUsd)}
    </span>
  );
}
