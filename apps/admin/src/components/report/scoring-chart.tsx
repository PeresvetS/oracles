'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useI18n } from '@/i18n/context';
import type { ReportIdea } from '@/types';

interface ScoringChartProps {
  ideas: ReportIdea[];
}

const MAX_LABEL_LENGTH = 20;

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Bar chart сравнения ICE avg и RICE avg по идеям */
export function ScoringChart({ ideas }: ScoringChartProps) {
  const { t } = useI18n();

  const singleIdea = ideas.length === 1 ? ideas[0] : null;
  const singleIdeaScores = (singleIdea?.scores ?? null) as
    | Record<string, { agentName?: string; ice?: { total?: number }; rice?: { total?: number } }>
    | null;

  const isAnalystComparison =
    singleIdea !== null && singleIdeaScores !== null && Object.keys(singleIdeaScores).length > 0;

  const data = isAnalystComparison
    ? Object.entries(singleIdeaScores ?? {}).map(([agentId, score]) => ({
        name: score.agentName ?? agentId.slice(-6),
        [t.report.ice]: Number(score.ice?.total?.toFixed(1) ?? 0),
        [t.report.rice]: Number(score.rice?.total?.toFixed(1) ?? 0),
      }))
    : ideas.map((idea) => ({
        name: truncate(idea.title, MAX_LABEL_LENGTH),
        [t.report.iceAvg]: Number(idea.avgIce?.toFixed(1) ?? 0),
        [t.report.riceAvg]: Number(idea.avgRice?.toFixed(1) ?? 0),
      }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
        />
        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
        <Tooltip
          contentStyle={{
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
        />
        <Legend />
        <Bar
          dataKey={isAnalystComparison ? t.report.ice : t.report.iceAvg}
          fill="hsl(221, 83%, 53%)"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey={isAnalystComparison ? t.report.rice : t.report.riceAvg}
          fill="hsl(142, 71%, 45%)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
