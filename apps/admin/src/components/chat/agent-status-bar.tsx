'use client';

import { useI18n } from '@/i18n/context';
import { useSessionStore } from '@/store/session-store';
import type { AgentDto } from '@/types/index';

interface AgentStatusBarProps {
  agents: AgentDto[];
  agentColorMap: Record<string, string>;
}

/** Маппинг цвета агента на Tailwind text-класс */
const AGENT_COLOR_TEXT_CLASS: Record<string, string> = {
  blue: 'text-blue-400',
  emerald: 'text-emerald-400',
  orange: 'text-orange-400',
  yellow: 'text-yellow-400',
  cyan: 'text-cyan-400',
  pink: 'text-pink-400',
  red: 'text-red-400',
  purple: 'text-purple-400',
  green: 'text-green-400',
  gray: 'text-muted-foreground',
};

/** Индикатор «думает...» для агентов, стримящих в данный момент */
export function AgentStatusBar({ agents, agentColorMap }: AgentStatusBarProps) {
  const { t } = useI18n();
  const streamingAgentIds = useSessionStore((s) => s.streamingAgentIds);

  if (streamingAgentIds.size === 0) return null;

  const streamingAgents = agents.filter((a) => streamingAgentIds.has(a.id));

  return (
    <div className="flex flex-wrap gap-3 border-b border-border/50 bg-background/50 px-4 py-2">
      {streamingAgents.map((agent) => {
        const color = agentColorMap[agent.id] ?? 'gray';
        const textClass = AGENT_COLOR_TEXT_CLASS[color] ?? 'text-muted-foreground';
        return (
          <span key={agent.id} className={`flex items-center gap-1.5 text-xs ${textClass}`}>
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            {agent.name} {t.session.thinking}
          </span>
        );
      })}
    </div>
  );
}
