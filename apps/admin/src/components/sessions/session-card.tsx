'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { TokenCounter } from '@/components/ui/token-counter';
import { useI18n } from '@/i18n/context';
import { SESSION_MODE } from '@/types/index';
import type { SessionDto } from '@/types/index';

interface SessionCardProps {
  session: SessionDto;
}

/** Карточка сессии в списке: статус, режим, раунды, стоимость, дата */
export function SessionCard({ session }: SessionCardProps) {
  const { t, locale } = useI18n();

  const modeLabel =
    session.mode === SESSION_MODE.GENERATE
      ? t.sessionForm.modeGenerate
      : t.sessionForm.modeValidate;

  const localeCode = locale === 'ru' ? 'ru-RU' : 'en-US';
  const formattedDate = new Date(session.createdAt).toLocaleString(localeCode, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Link href={`/sessions/${session.id}`}>
      <Card className="cursor-pointer transition-colors hover:bg-muted/50">
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{session.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{modeLabel}</p>
          </div>
          <StatusBadge status={session.status} />
        </CardHeader>
        <CardContent className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            {t.sessions.roundsLabel} {session.currentRound}/{session.maxRounds}
          </span>
          <span className="flex items-center gap-1">
            {t.sessions.costLabel}: <TokenCounter costUsd={session.totalCostUsd} />
          </span>
          <span className="ml-auto">{formattedDate}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
