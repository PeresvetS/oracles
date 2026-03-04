'use client';

import { useI18n } from '@/i18n/context';
import { Badge } from '@/components/ui/badge';
import { ROUND_TYPE } from '@/types/index';

interface RoundDividerProps {
  roundNumber: number;
  roundType: string;
}

/** Маппинг типа раунда на вариант Badge */
const ROUND_TYPE_BADGE_VARIANT: Record<
  string,
  'info' | 'secondary' | 'warning' | 'purple' | 'success' | 'default'
> = {
  [ROUND_TYPE.INITIAL]: 'info',
  [ROUND_TYPE.DISCUSSION]: 'secondary',
  [ROUND_TYPE.RESEARCH]: 'warning',
  [ROUND_TYPE.SCORING]: 'purple',
  [ROUND_TYPE.USER_INITIATED]: 'success',
  [ROUND_TYPE.FINAL]: 'default',
};

/** Горизонтальный разделитель между раундами: линия + Badge с номером и типом */
export function RoundDivider({ roundNumber, roundType }: RoundDividerProps) {
  const { t } = useI18n();

  const roundTypeLabel: Record<string, string> = {
    [ROUND_TYPE.INITIAL]: t.session.roundInitial,
    [ROUND_TYPE.DISCUSSION]: t.session.roundDiscussion,
    [ROUND_TYPE.RESEARCH]: t.session.roundResearch,
    [ROUND_TYPE.SCORING]: t.session.roundScoring,
    [ROUND_TYPE.USER_INITIATED]: t.session.roundUserInitiated,
    [ROUND_TYPE.FINAL]: t.session.roundFinal,
  };

  const variant = ROUND_TYPE_BADGE_VARIANT[roundType] ?? 'secondary';
  const label = roundTypeLabel[roundType] ?? roundType;

  return (
    <div className="flex items-center gap-3 py-4">
      <div className="h-px flex-1 bg-border" />
      <Badge variant={variant}>
        {t.session.roundsIndicator} {roundNumber} — {label}
      </Badge>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
