'use client';

import { useMemo, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useI18n } from '@/i18n/context';
import { useSessionDetail, useSessionMessagesInitial } from '@/hooks/use-session';
import { useSessionSocket } from '@/hooks/use-session-socket';
import { useReport } from '@/hooks/use-report';
import { useSessionStore } from '@/store/session-store';
import { StatusBadge } from '@/components/ui/status-badge';
import { TokenCounter } from '@/components/ui/token-counter';
import { MessageBubble } from '@/components/chat/message-bubble';
import { RoundDivider } from '@/components/chat/round-divider';
import { AgentStatusBar } from '@/components/chat/agent-status-bar';
import { SessionControls } from '@/components/chat/session-controls';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ReportView } from '@/components/report/report-view';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { AppShell } from '@/components/ui/app-shell';
import { AGENT_ROLE, AGENT_COLORS, SESSION_STATUS } from '@/types/index';
import type { AgentDto, MessageWithAgent, RoundEvent, StreamingMessage, SessionStatus } from '@/types/index';

/** Порог приближения к нижней границе чата для авто-скролла (px) */
const AUTO_SCROLL_THRESHOLD_PX = 100;

/** Цвета аналитиков по порядку */
const ANALYST_COLORS = [
  AGENT_COLORS.ANALYST_1,
  AGENT_COLORS.ANALYST_2,
  AGENT_COLORS.ANALYST_3,
  AGENT_COLORS.ANALYST_4,
  AGENT_COLORS.ANALYST_5,
  AGENT_COLORS.ANALYST_6,
] as const;

/** Маппинг статуса соединения на CSS-класс для индикатора */
const CONNECTION_STATUS_CLASS: Record<string, string> = {
  connected: 'bg-emerald-500',
  disconnected: 'bg-gray-400',
  reconnecting: 'bg-yellow-400 animate-pulse',
};

/** Строит маппинг agentId → цвет на основе списка агентов */
function buildAgentColorMap(agents: AgentDto[]): Record<string, string> {
  const analysts = agents.filter((a) => a.role === AGENT_ROLE.ANALYST);
  const map: Record<string, string> = {};

  for (const agent of agents) {
    if (agent.role === AGENT_ROLE.DIRECTOR) {
      map[agent.id] = AGENT_COLORS.DIRECTOR;
    } else if (agent.role === AGENT_ROLE.RESEARCHER) {
      map[agent.id] = AGENT_COLORS.RESEARCHER;
    } else {
      const idx = analysts.indexOf(agent);
      map[agent.id] = ANALYST_COLORS[idx] ?? AGENT_COLORS.ANALYST_1;
    }
  }

  return map;
}

/** Конвертирует REST-сообщения в формат StreamingMessage для store */
function convertToStreamingMessages(messages: MessageWithAgent[]): StreamingMessage[] {
  return messages.map((m) => ({
    id: m.id,
    agentId: m.agentId ?? null,
    agentName: m.agent?.name ?? null,
    agentRole: m.agent?.role ?? null,
    modelId: m.agent?.modelId ?? null,
    roundId: m.roundId,
    content: m.content,
    createdAt: m.createdAt,
    isStreaming: false,
    tokensInput: m.tokensInput ?? undefined,
    tokensOutput: m.tokensOutput ?? undefined,
    costUsd: m.costUsd ?? undefined,
    latencyMs: m.latencyMs ?? undefined,
  }));
}

/** Извлекает уникальные раунды из REST-сообщений, отсортированные по номеру */
function extractRoundsFromMessages(
  messages: MessageWithAgent[],
  sessionId: string,
): RoundEvent[] {
  const roundMap = new Map<string, RoundEvent>();

  for (const msg of messages) {
    if (msg.round && !roundMap.has(msg.roundId)) {
      roundMap.set(msg.roundId, {
        sessionId,
        roundId: msg.roundId,
        roundNumber: msg.round.number,
        roundType: msg.round.type,
      });
    }
  }

  return Array.from(roundMap.values()).sort((a, b) => a.roundNumber - b.roundNumber);
}

/** Хук авто-скролла: прокручивает вниз только когда пользователь уже у дна */
function useAutoScroll(messageCount: number): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = (): void => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      isNearBottomRef.current =
        scrollHeight - scrollTop - clientHeight < AUTO_SCROLL_THRESHOLD_PX;
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current && containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messageCount]);

  return containerRef;
}

/** Страница активной сессии: real-time чат через WebSocket + store */
export default function SessionPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [isInitialized, setIsInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'report'>('chat');
  const hasAutoOpenedReport = useRef(false);

  // --- REST данные (однократная загрузка) ---
  const { data: session, isLoading: sessionLoading } = useSessionDetail(id, isAuthenticated);
  const { data: messagesData, isLoading: messagesLoading } = useSessionMessagesInitial(
    id,
    isAuthenticated,
  );
  const { hasReport } = useReport(id, isAuthenticated);

  // --- Zustand store ---
  const messages = useSessionStore((s) => s.messages);
  const rounds = useSessionStore((s) => s.rounds);
  const storeStatus = useSessionStore((s) => s.sessionStatus);
  const storeCostUsd = useSessionStore((s) => s.totalCostUsd);
  const storeCurrentRound = useSessionStore((s) => s.currentRound);
  const connectionStatus = useSessionStore((s) => s.connectionStatus);
  const toolCalls = useSessionStore((s) => s.toolCalls);
  const {
    setInitialMessages,
    mergeMessagesFromSnapshot,
    setInitialRounds,
    mergeRoundsFromSnapshot,
    setSessionSnapshot,
  } = useSessionStore.getState();

  // --- WebSocket ---
  useSessionSocket(id);

  // --- Инициализация store из REST данных ---
  useEffect(() => {
    if (messagesData && session && !isInitialized) {
      const streamingMsgs = convertToStreamingMessages(messagesData.items);
      const extractedRounds = extractRoundsFromMessages(messagesData.items, session.id);
      setInitialMessages(streamingMsgs);
      setInitialRounds(extractedRounds);
      setSessionSnapshot({
        status: session.status,
        currentRound: session.currentRound,
        totalCostUsd: session.totalCostUsd,
      });
      setIsInitialized(true);
      return;
    }

    if (messagesData && session && isInitialized) {
      const streamingMsgs = convertToStreamingMessages(messagesData.items);
      const extractedRounds = extractRoundsFromMessages(messagesData.items, session.id);
      mergeMessagesFromSnapshot(streamingMsgs);
      mergeRoundsFromSnapshot(extractedRounds);
    }
  }, [
    messagesData,
    session,
    isInitialized,
    setInitialMessages,
    mergeMessagesFromSnapshot,
    setInitialRounds,
    mergeRoundsFromSnapshot,
    setSessionSnapshot,
  ]);

  // --- Производные данные ---
  const agentColorMap = useMemo(
    () => (session ? buildAgentColorMap(session.agents) : {}),
    [session],
  );

  const roundMap = useMemo(() => {
    const map = new Map<string, RoundEvent>();
    for (const r of rounds) map.set(r.roundId, r);
    return map;
  }, [rounds]);

  const orderedMessages = useMemo(() => {
    return messages
      .map((message, index) => ({
        message,
        index,
        roundNumber: roundMap.get(message.roundId)?.roundNumber ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => {
        if (a.roundNumber !== b.roundNumber) {
          return a.roundNumber - b.roundNumber;
        }

        return a.index - b.index;
      })
      .map((item) => item.message);
  }, [messages, roundMap]);

  // Актуальный статус: из WS или из REST
  const currentStatus: SessionStatus = storeStatus ?? session?.status ?? SESSION_STATUS.CONFIGURING;
  const currentRound = storeCurrentRound > 0 ? storeCurrentRound : (session?.currentRound ?? 0);
  const maxRounds = session?.maxRounds ?? 0;
  const totalCostUsd = storeCostUsd;
  const canOpenReport = currentStatus === SESSION_STATUS.COMPLETED || hasReport;

  useEffect(() => {
    if (canOpenReport && !hasAutoOpenedReport.current) {
      setActiveTab('report');
      hasAutoOpenedReport.current = true;
    }
  }, [canOpenReport]);

  useEffect(() => {
    if (!sessionLoading && !session) {
      toast.error(t.errors.sessionNotFound);
    }
  }, [sessionLoading, session, t.errors.sessionNotFound]);

  // --- Auto-scroll ---
  const scrollContainerRef = useAutoScroll(messages.length);

  const handleStatusChange = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['session', id] });
  };

  // --- Рендер ---
  if (!isAuthenticated) return null;

  if (sessionLoading) {
    return (
      <AppShell>
        <ErrorBoundary>
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">{t.common.loading}</p>
          </div>
        </ErrorBoundary>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell>
        <ErrorBoundary>
          <div className="flex h-full items-center justify-center">
            <p className="text-destructive">{t.errors.sessionNotFound}</p>
          </div>
        </ErrorBoundary>
      </AppShell>
    );
  }

  // Группировка сообщений по раундам для вставки RoundDivider
  const renderedMessages: React.ReactNode[] = [];
  let lastRoundId: string | null = null;

  for (const msg of orderedMessages) {
    if (msg.roundId !== lastRoundId) {
      const round = roundMap.get(msg.roundId);
      if (round) {
        renderedMessages.push(
          <RoundDivider
            key={`round-${round.roundId}`}
            roundNumber={round.roundNumber}
            roundType={round.roundType}
          />,
        );
      }
      lastRoundId = msg.roundId;
    }

    // Tool calls для данного сообщения
    const messageToolCalls = toolCalls[msg.id] ?? [];

    renderedMessages.push(
      <MessageBubble
        key={msg.id}
        message={msg}
        agentColor={msg.agentId ? agentColorMap[msg.agentId] : undefined}
        toolCalls={messageToolCalls.length > 0 ? messageToolCalls : undefined}
      />,
    );
  }

  const connectionDotClass =
    CONNECTION_STATUS_CLASS[connectionStatus] ?? 'bg-gray-400';

  return (
    <AppShell>
      <ErrorBoundary>
        <div className="flex h-full flex-col bg-background">
      {/* Хедер: название, статус, раунды, стоимость, индикатор соединения */}
      <header className="z-10 shrink-0 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate font-semibold">{session.title}</h1>
          <StatusBadge status={currentStatus} />
          <span className="text-sm text-muted-foreground">
            {t.session.roundsIndicator} {currentRound}/{maxRounds}
          </span>
          <TokenCounter costUsd={totalCostUsd} />
          <div
            className={`h-2 w-2 shrink-0 rounded-full ${connectionDotClass}`}
            title={t.session[connectionStatus]}
          />
        </div>
      </header>

      {/* Индикатор стримящих агентов */}
      <AgentStatusBar agents={session.agents} agentColorMap={agentColorMap} />

      {/* Табы: Чат / Отчёт */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'chat' | 'report')}
        className="flex flex-1 flex-col min-h-0"
      >
        <TabsList className="mx-4 mt-2 w-fit shrink-0">
          <TabsTrigger value="chat">{t.session.chatTab}</TabsTrigger>
          <TabsTrigger
            value="report"
            disabled={!canOpenReport}
          >
            {t.session.reportTab}
          </TabsTrigger>
        </TabsList>

        {/* Вкладка «Чат» */}
        <TabsContent value="chat" className="flex flex-1 flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
          <main
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-4 py-4"
          >
            {messagesLoading && messages.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">{t.common.loading}</p>
            ) : messages.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">{t.session.thinking}</p>
            ) : (
              <div className="flex flex-col gap-3">{renderedMessages}</div>
            )}
          </main>
          <SessionControls
            sessionId={id}
            status={currentStatus}
            currentRound={currentRound}
            maxRounds={maxRounds}
            onStatusChange={handleStatusChange}
          />
        </TabsContent>

        {/* Вкладка «Отчёт» */}
        <TabsContent value="report" className="flex-1 overflow-y-auto mt-0">
          <ReportView sessionId={id} sessionStatus={currentStatus} />
        </TabsContent>
      </Tabs>
        </div>
      </ErrorBoundary>
    </AppShell>
  );
}
