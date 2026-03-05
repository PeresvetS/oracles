'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/auth-store';
import { useSessionStore } from '@/store/session-store';
import { getSessionSocket } from '@/lib/socket';
import type { RoundEvent } from '@/types/index';

/** Имена WebSocket-событий (зеркало backend gateway.constants.ts) */
const WS_EVENTS = {
  AGENT_MESSAGE_START: 'agent:message:start',
  AGENT_MESSAGE_CHUNK: 'agent:message:chunk',
  AGENT_MESSAGE_END: 'agent:message:end',
  AGENT_TOOL_START: 'agent:tool:start',
  AGENT_TOOL_RESULT: 'agent:tool:result',
  ROUND_START: 'round:start',
  ROUND_END: 'round:end',
  SESSION_STATUS: 'session:status',
  SESSION_ERROR: 'session:error',
  IDEA_UPDATE: 'idea:update',
  REPORT_READY: 'report:ready',
  SESSION_JOIN: 'session:join',
  SESSION_LEAVE: 'session:leave',
} as const;

type WsMessageStartPayload = {
  sessionId: string;
  messageId: string;
  agentId: string;
  agentName: string;
  agentRole: string;
  roundId: string;
};

type WsMessageChunkPayload = {
  sessionId: string;
  messageId: string;
  chunk: string;
};

type WsMessageEndPayload = {
  sessionId: string;
  messageId: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  latencyMs: number;
};

type WsToolStartPayload = {
  sessionId: string;
  messageId: string;
  agentId: string;
  tool: string;
  query: string;
};

type WsToolResultPayload = {
  sessionId: string;
  messageId: string;
  agentId: string;
  tool: string;
  result: string;
};

type WsRoundStartPayload = {
  sessionId: string;
  roundId: string;
  roundNumber: number;
  roundType: string;
};

type WsRoundEndPayload = {
  sessionId: string;
  roundId: string;
  roundNumber?: number;
};

type WsSessionStatusPayload = {
  sessionId: string;
  status: string;
  currentRound?: number;
  totalCostUsd?: number;
};

type WsSessionErrorPayload = {
  sessionId: string;
  error: string;
};

type WsReportReadyPayload = {
  sessionId: string;
  reportId: string;
};

type WsIdeaUpdatePayload = {
  sessionId: string;
  idea: unknown;
};

/**
 * Хук подключения к WebSocket-комнате сессии.
 *
 * - Подключается к /session namespace с JWT
 * - Отправляет session:join при монтировании и после реконнекта
 * - Слушает все серверные события и диспатчит в useSessionStore
 * - session:error → toast.error()
 * - report:ready → инвалидирует кэш React Query
 * - При unmount: session:leave + reset store
 */
export function useSessionSocket(sessionId: string): void {
  const token = useAuthStore((s) => s.token);
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const backfillRequestedRef = useRef<Set<string>>(new Set());

  const {
    addMessage,
    appendToMessage,
    finalizeMessage,
    addRound,
    endRound,
    updateStatus,
    addToolStart,
    addToolResult,
    setConnectionStatus,
    reset,
  } = useSessionStore.getState();

  useEffect(() => {
    if (!token || !sessionId) return;

    const socket = getSessionSocket(token);
    socketRef.current = socket;

    const joinRoom = (): void => {
      socket.emit(WS_EVENTS.SESSION_JOIN, { sessionId });
      // Backfill на случай, если часть событий пришла до join комнаты
      void queryClient.invalidateQueries({ queryKey: ['session-messages', sessionId] });
    };

    // --- Соединение ---
    socket.on('connect', () => {
      setConnectionStatus('connected');
      joinRoom();
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socket.io.on('reconnect_attempt', () => {
      setConnectionStatus('reconnecting');
    });

    socket.io.on('reconnect', () => {
      setConnectionStatus('connected');
      // Перезайти в комнату после реконнекта
      joinRoom();
      // Рефреш данных сессии при восстановлении соединения
      void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['session-messages', sessionId] });
    });

    // Если уже подключён (кэшированный сокет), сразу присоединяемся
    if (socket.connected) {
      setConnectionStatus('connected');
      joinRoom();
    }

    // --- Стриминг сообщений ---
    socket.on(WS_EVENTS.AGENT_MESSAGE_START, (data: WsMessageStartPayload) => {
      if (data.sessionId !== sessionId) return;
      backfillRequestedRef.current.delete(data.messageId);
      addMessage({
        id: data.messageId,
        agentId: data.agentId,
        agentName: data.agentName,
        agentRole: data.agentRole,
        roundId: data.roundId,
        content: '',
        isStreaming: true,
      });
    });

    socket.on(WS_EVENTS.AGENT_MESSAGE_CHUNK, (data: WsMessageChunkPayload) => {
      if (data.sessionId !== sessionId) return;
      const hasMessage = useSessionStore.getState().messages.some((m) => m.id === data.messageId);
      appendToMessage(data.messageId, data.chunk);
      if (!hasMessage && !backfillRequestedRef.current.has(data.messageId)) {
        backfillRequestedRef.current.add(data.messageId);
        void queryClient.invalidateQueries({ queryKey: ['session-messages', sessionId] });
      }
    });

    socket.on(WS_EVENTS.AGENT_MESSAGE_END, (data: WsMessageEndPayload) => {
      if (data.sessionId !== sessionId) return;
      const hasMessage = useSessionStore.getState().messages.some((m) => m.id === data.messageId);
      finalizeMessage(data.messageId, {
        tokensInput: data.tokensInput,
        tokensOutput: data.tokensOutput,
        costUsd: data.costUsd,
        latencyMs: data.latencyMs,
      });
      backfillRequestedRef.current.delete(data.messageId);
      if (!hasMessage) {
        void queryClient.invalidateQueries({ queryKey: ['session-messages', sessionId] });
      }
    });

    // --- Tool calls ---
    socket.on(WS_EVENTS.AGENT_TOOL_START, (data: WsToolStartPayload) => {
      if (data.sessionId !== sessionId) return;
      addToolStart(data.messageId, data.agentId, data.tool, data.query);
    });

    socket.on(WS_EVENTS.AGENT_TOOL_RESULT, (data: WsToolResultPayload) => {
      if (data.sessionId !== sessionId) return;
      addToolResult(data.messageId, data.tool, data.result);
    });

    // --- Раунды ---
    socket.on(WS_EVENTS.ROUND_START, (data: WsRoundStartPayload) => {
      if (data.sessionId !== sessionId) return;
      const round: RoundEvent = {
        sessionId: data.sessionId,
        roundId: data.roundId,
        roundNumber: data.roundNumber,
        roundType: data.roundType,
      };
      addRound(round);
    });

    socket.on(WS_EVENTS.ROUND_END, (data: WsRoundEndPayload) => {
      if (data.sessionId !== sessionId) return;
      endRound(data.roundId);
      // На границе раунда синхронизируем REST-снимок, чтобы не терять сообщения
      void queryClient.invalidateQueries({ queryKey: ['session-messages', sessionId] });
    });

    // --- Статус сессии ---
    socket.on(WS_EVENTS.SESSION_STATUS, (data: WsSessionStatusPayload) => {
      if (data.sessionId !== sessionId) return;
      updateStatus({
        sessionId: data.sessionId,
        status: data.status,
        currentRound: data.currentRound,
        totalCostUsd: data.totalCostUsd,
      });
      void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    });

    // --- Ошибки ---
    socket.on(WS_EVENTS.SESSION_ERROR, (data: WsSessionErrorPayload) => {
      if (data.sessionId !== sessionId) return;
      toast.error(data.error);
    });

    // --- Отчёт ---
    socket.on(WS_EVENTS.REPORT_READY, (data: WsReportReadyPayload) => {
      if (data.sessionId !== sessionId) return;
      void queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      void queryClient.invalidateQueries({ queryKey: ['session-report', sessionId] });
    });

    // --- Идеи ---
    socket.on(WS_EVENTS.IDEA_UPDATE, (data: WsIdeaUpdatePayload) => {
      if (data.sessionId !== sessionId) return;
      void queryClient.invalidateQueries({ queryKey: ['session-ideas', sessionId] });
    });

    // --- Cleanup ---
    return () => {
      socket.emit(WS_EVENTS.SESSION_LEAVE, { sessionId });
      socket.off('connect');
      socket.off('disconnect');
      socket.off(WS_EVENTS.AGENT_MESSAGE_START);
      socket.off(WS_EVENTS.AGENT_MESSAGE_CHUNK);
      socket.off(WS_EVENTS.AGENT_MESSAGE_END);
      socket.off(WS_EVENTS.AGENT_TOOL_START);
      socket.off(WS_EVENTS.AGENT_TOOL_RESULT);
      socket.off(WS_EVENTS.ROUND_START);
      socket.off(WS_EVENTS.ROUND_END);
      socket.off(WS_EVENTS.SESSION_STATUS);
      socket.off(WS_EVENTS.SESSION_ERROR);
      socket.off(WS_EVENTS.REPORT_READY);
      socket.off(WS_EVENTS.IDEA_UPDATE);
      reset();
    };
  }, [sessionId, token]); // eslint-disable-line react-hooks/exhaustive-deps
}
