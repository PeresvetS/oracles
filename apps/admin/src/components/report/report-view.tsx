'use client';

import { useState } from 'react';
import { useReport } from '@/hooks/use-report';
import { useI18n } from '@/i18n/context';
import { IdeaTable } from '@/components/report/idea-table';
import { IdeaDetailCard } from '@/components/report/idea-detail-card';
import { RejectedIdeasList } from '@/components/report/rejected-ideas-list';
import { ScoringChart } from '@/components/report/scoring-chart';
import { ExportButtons } from '@/components/report/export-buttons';
import { SESSION_STATUS } from '@/types';
import type { SessionStatus, ReportIdea } from '@/types';

interface ReportViewProps {
  sessionId: string;
  sessionStatus: SessionStatus;
}

/** Вкладка «Отчёт»: таблица идей, детальная карточка, chart, отклонённые, экспорт */
export function ReportView({ sessionId, sessionStatus }: ReportViewProps) {
  const { t } = useI18n();
  const isCompleted = sessionStatus === SESSION_STATUS.COMPLETED;

  const { report, hasReport, isLoading, error } = useReport(sessionId, true);
  const [selectedIdea, setSelectedIdea] = useState<ReportIdea | null>(null);

  if (!isCompleted && !hasReport) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>{t.report.noReport}</p>
      </div>
    );
  }

  if (isLoading && !report) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>{t.report.loadingReport}</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        <p>{t.report.errorReport}</p>
      </div>
    );
  }

  const finalIdeas = report.content.finalIdeas ?? [];
  const rejectedIdeas = report.content.rejectedIdeas ?? [];

  if (finalIdeas.length === 0 && rejectedIdeas.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p>{t.report.noReportData}</p>
      </div>
    );
  }

  const displayIdea = selectedIdea ?? finalIdeas[0] ?? null;

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Кнопки экспорта */}
      <div className="flex justify-end">
        <ExportButtons sessionId={sessionId} />
      </div>

      {/* Общий ScoringChart */}
      {finalIdeas.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {t.report.ideas}
          </h3>
          <ScoringChart ideas={finalIdeas} />
        </div>
      )}

      {/* Таблица + Детали */}
      {finalIdeas.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <IdeaTable
            ideas={finalIdeas}
            onSelect={setSelectedIdea}
            selectedTitle={displayIdea?.title ?? null}
          />
          {displayIdea && <IdeaDetailCard idea={displayIdea} />}
        </div>
      )}

      {/* Отклонённые идеи */}
      {rejectedIdeas.length > 0 && <RejectedIdeasList ideas={rejectedIdeas} />}
    </div>
  );
}
