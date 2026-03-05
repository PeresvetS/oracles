'use client';

import { create } from 'zustand';
import type {
  StreamingMessage,
  RoundEvent,
  SessionStatus,
  ConnectionStatus,
  StatusUpdate,
} from '@/types/index';
import { SESSION_STATUS } from '@/types/index';

/** Состояние вызова инструмента */
interface ToolCallState {
  messageId: string;
  agentId: string;
  tool: string;
  query: string;
  result: string | null;
  isLoading: boolean;
}

interface SessionStoreState {
  /** Все сообщения: REST (isStreaming=false) + WebSocket (isStreaming=true) */
  messages: StreamingMessage[];
  /** Раунды сессии */
  rounds: RoundEvent[];
  /** Текущий статус сессии */
  sessionStatus: SessionStatus | null;
  /** Текущий номер раунда */
  currentRound: number;
  /** Суммарная стоимость токенов */
  totalCostUsd: number;
  /** Вызовы инструментов, сгруппированные по messageId */
  toolCalls: Record<string, ToolCallState[]>;
  /** ID агентов, которые сейчас стримят */
  streamingAgentIds: Set<string>;
  /** Статус WebSocket-соединения */
  connectionStatus: ConnectionStatus;
}

interface SessionStoreActions {
  /** Установить начальные сообщения из REST */
  setInitialMessages: (messages: StreamingMessage[]) => void;
  /** Установить начальные раунды из REST */
  setInitialRounds: (rounds: RoundEvent[]) => void;
  /** Установить снапшот сессии из REST */
  setSessionSnapshot: (snapshot: {
    status: SessionStatus;
    currentRound: number;
    totalCostUsd: number;
  }) => void;
  /** Добавить новое сообщение (agent:message:start). Защита от дубликатов по id */
  addMessage: (message: StreamingMessage) => void;
  /** Добавить чанк к сообщению (agent:message:chunk) */
  appendToMessage: (messageId: string, chunk: string) => void;
  /** Финализировать сообщение (agent:message:end) */
  finalizeMessage: (
    messageId: string,
    meta: { tokensInput: number; tokensOutput: number; costUsd: number; latencyMs: number },
  ) => void;
  /** Добавить раунд (round:start) */
  addRound: (round: RoundEvent) => void;
  /** Завершить раунд (round:end) */
  endRound: (roundId: string) => void;
  /** Обновить статус/метрики сессии из WS session:status */
  updateStatus: (update: StatusUpdate) => void;
  /** Сохранить начало вызова инструмента */
  addToolStart: (messageId: string, agentId: string, tool: string, query: string) => void;
  /** Сохранить результат вызова инструмента */
  addToolResult: (messageId: string, tool: string, result: string) => void;
  /** Обновить статус WebSocket-соединения */
  setConnectionStatus: (status: ConnectionStatus) => void;
  /** Сбросить состояние (при уходе со страницы) */
  reset: () => void;
}

function markToolCallsAsCompleted(
  toolCalls: Record<string, ToolCallState[]>,
): Record<string, ToolCallState[]> {
  const next: Record<string, ToolCallState[]> = {};

  for (const [messageId, calls] of Object.entries(toolCalls)) {
    next[messageId] = calls.map((call) =>
      call.isLoading
        ? {
            ...call,
            isLoading: false,
          }
        : call,
    );
  }

  return next;
}

const INITIAL_STATE: SessionStoreState = {
  messages: [],
  rounds: [],
  sessionStatus: null,
  currentRound: 0,
  totalCostUsd: 0,
  toolCalls: {},
  streamingAgentIds: new Set(),
  connectionStatus: 'disconnected',
};

export const useSessionStore = create<SessionStoreState & SessionStoreActions>()((set) => ({
  ...INITIAL_STATE,

  setInitialMessages: (messages) => set({ messages }),

  setInitialRounds: (rounds) => set({ rounds }),

  setSessionSnapshot: (snapshot) =>
    set({
      sessionStatus: snapshot.status,
      currentRound: snapshot.currentRound,
      totalCostUsd: snapshot.totalCostUsd,
    }),

  addMessage: (message) =>
    set((state) => {
      // Защита от дубликатов (гонка REST vs WS)
      if (state.messages.some((m) => m.id === message.id)) return state;

      const newStreamingIds = new Set(state.streamingAgentIds);
      if (message.isStreaming && message.agentId) {
        newStreamingIds.add(message.agentId);
      }

      return {
        messages: [...state.messages, message],
        streamingAgentIds: newStreamingIds,
      };
    }),

  appendToMessage: (messageId, chunk) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, content: m.content + chunk } : m,
      ),
    })),

  finalizeMessage: (messageId, meta) =>
    set((state) => {
      const finalized = state.messages.find((m) => m.id === messageId);
      const newStreamingIds = new Set(state.streamingAgentIds);

      if (finalized?.agentId) {
        newStreamingIds.delete(finalized.agentId);
      }

      return {
        messages: state.messages.map((m) =>
          m.id === messageId ? { ...m, isStreaming: false, ...meta } : m,
        ),
        streamingAgentIds: newStreamingIds,
        totalCostUsd: state.totalCostUsd + meta.costUsd,
      };
    }),

  addRound: (round) =>
    set((state) => {
      const existingIndex = state.rounds.findIndex((item) => item.roundId === round.roundId);
      const rounds =
        existingIndex >= 0
          ? state.rounds.map((item, index) => (index === existingIndex ? round : item))
          : [...state.rounds, round];

      return {
        rounds,
        currentRound: Math.max(state.currentRound, round.roundNumber),
      };
    }),

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  endRound: (_roundId: string) => {
    // round:end пока не несёт данных — placeholder для будущих расширений
  },

  updateStatus: (update) =>
    set((state) => {
      const nextRound =
        update.currentRound !== undefined
          ? Math.max(state.currentRound, update.currentRound)
          : state.currentRound;
      const nextStatus = update.status as SessionStatus;
      const isRunning = nextStatus === SESSION_STATUS.RUNNING;

      return {
        sessionStatus: nextStatus,
        currentRound: nextRound,
        totalCostUsd: update.totalCostUsd ?? state.totalCostUsd,
        streamingAgentIds: isRunning ? state.streamingAgentIds : new Set(),
        toolCalls: isRunning ? state.toolCalls : markToolCallsAsCompleted(state.toolCalls),
      };
    }),

  addToolStart: (messageId, agentId, tool, query) =>
    set((state) => ({
      toolCalls: {
        ...state.toolCalls,
        [messageId]: [
          ...(state.toolCalls[messageId] ?? []),
          {
            messageId,
            agentId,
            tool,
            query,
            result: null,
            isLoading: true,
          },
        ],
      },
    })),

  addToolResult: (messageId, tool, result) =>
    set((state) => {
      const toolCallsForMessage = state.toolCalls[messageId] ?? [];
      const nextCalls = [...toolCallsForMessage];
      const targetIndex = nextCalls.findIndex(
        (call) => call.tool === tool && call.isLoading,
      );

      if (targetIndex >= 0) {
        const target = nextCalls[targetIndex];
        nextCalls[targetIndex] = {
          ...target,
          result,
          isLoading: false,
        };
      } else {
        nextCalls.push({
          messageId,
          agentId: '',
          tool,
          query: '',
          result,
          isLoading: false,
        });
      }

      return {
        toolCalls: {
          ...state.toolCalls,
          [messageId]: nextCalls,
        },
      };
    }),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  reset: () =>
    set({
      ...INITIAL_STATE,
      streamingAgentIds: new Set(),
    }),
}));
