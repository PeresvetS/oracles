'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { SessionDetailDto, MessagesResponse } from '@/types/index';

/** Загружает полные данные сессии (с агентами, статусом, стоимостью) */
export function useSessionDetail(sessionId: string, enabled: boolean = true) {
  return useQuery<SessionDetailDto>({
    queryKey: ['session', sessionId],
    queryFn: () => api.get<SessionDetailDto>(`/api/sessions/${sessionId}`),
    enabled: enabled && !!sessionId,
  });
}

/**
 * Загружает сообщения сессии однократно (для инициализации store).
 * Без авторефетча — новые сообщения приходят через WebSocket.
 */
export function useSessionMessagesInitial(sessionId: string, enabled: boolean = true) {
  return useQuery<MessagesResponse>({
    queryKey: ['session-messages', sessionId],
    queryFn: () => api.get<MessagesResponse>(`/api/sessions/${sessionId}/messages`),
    enabled: enabled && !!sessionId,
    staleTime: Infinity,
  });
}
