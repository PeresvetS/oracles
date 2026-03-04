'use client';

import { useI18n } from '@/i18n/context';
import { ScoringChart } from '@/components/report/scoring-chart';
import type { ReportIdea } from '@/types';

interface IdeaDetailCardProps {
  idea: ReportIdea;
}

interface UnitEconomics {
  cac?: string | number;
  ltv?: string | number;
  paybackPeriod?: string | number;
}

interface DetailSection {
  label: string;
  value: string | null | undefined;
}

const URL_PREFIXES = ['http://', 'https://'];

function Section({ label, value }: DetailSection) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function CompetitorsSection({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;

  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <div className="flex flex-col gap-1 text-sm">
        {lines.map((line, idx) => {
          const hasUrl = URL_PREFIXES.some((prefix) => line.includes(prefix));
          if (!hasUrl) {
            return <p key={idx}>{line}</p>;
          }

          const url = line.match(/https?:\/\/\S+/)?.[0] ?? '';
          return (
            <a
              key={idx}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              {line}
            </a>
          );
        })}
      </div>
    </div>
  );
}

/** Детальная карточка одной финальной идеи */
export function IdeaDetailCard({ idea }: IdeaDetailCardProps) {
  const { t } = useI18n();

  const details = idea.details as Record<string, unknown> | null;
  const unitEconomics = (details?.unitEconomics ?? null) as UnitEconomics | null;

  const analystScores = idea.scores as Record<
    string,
    { agentName?: string; modelId?: string; ice?: { total?: number }; rice?: { total?: number } }
  > | null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <h3 className="font-semibold">{idea.title}</h3>

      <Section label={t.report.description} value={idea.summary} />
      <Section
        label={t.report.implementation}
        value={details?.implementation as string | undefined}
      />
      <CompetitorsSection
        label={t.report.competitors}
        value={details?.competitors as string | undefined}
      />
      <Section label={t.report.risks} value={details?.risks as string | undefined} />
      <Section label={t.report.opportunities} value={details?.opportunities as string | undefined} />

      {/* Юнит-экономика */}
      {unitEconomics && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t.report.unitEconomics}
          </p>
          <div className="flex gap-4 text-sm">
            {unitEconomics.cac !== undefined && (
              <span>
                <span className="text-muted-foreground">{t.report.cac}:</span>{' '}
                {unitEconomics.cac}
              </span>
            )}
            {unitEconomics.ltv !== undefined && (
              <span>
                <span className="text-muted-foreground">{t.report.ltv}:</span>{' '}
                {unitEconomics.ltv}
              </span>
            )}
            {unitEconomics.paybackPeriod !== undefined && (
              <span>
                <span className="text-muted-foreground">{t.report.paybackPeriod}:</span>{' '}
                {unitEconomics.paybackPeriod}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Оценки аналитиков */}
      {analystScores && Object.keys(analystScores).length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t.report.analystScores}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left py-1 pr-3">{t.report.agentColumn}</th>
                  <th className="text-right py-1 px-2">{t.report.ice}</th>
                  <th className="text-right py-1 px-2">{t.report.rice}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(analystScores).map(([agentId, score]) => (
                  <tr key={agentId} className="border-b border-border/50">
                    <td className="py-1 pr-3 text-muted-foreground">
                      {score.agentName ?? agentId.slice(-6)}
                      {score.modelId ? ` (${score.modelId})` : ''}
                    </td>
                    <td className="text-right py-1 px-2">{score.ice?.total?.toFixed(1) ?? '—'}</td>
                    <td className="text-right py-1 px-2">
                      {score.rice?.total?.toFixed(1) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Chart только для этой идеи */}
      <ScoringChart ideas={[idea]} />
    </div>
  );
}
