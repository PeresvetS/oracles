'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ReportDto } from '@/types';

const REPORT_NOT_FOUND_PATTERN = /not found|не найден|404/i;

/** Финальный отчёт сессии из GET /api/sessions/:id/report */
export function useReport(
  sessionId: string,
  enabled: boolean,
): { report: ReportDto | null; hasReport: boolean; isLoading: boolean; error: Error | null } {
  const { data, isLoading, error } = useQuery<ReportDto | null>({
    queryKey: ['session-report', sessionId],
    queryFn: async () => {
      try {
        return await api.get<ReportDto>(`/api/sessions/${sessionId}/report`);
      } catch (error: unknown) {
        if (error instanceof Error && REPORT_NOT_FOUND_PATTERN.test(error.message)) {
          return null;
        }
        throw error;
      }
    },
    enabled: Boolean(sessionId) && enabled,
    staleTime: Infinity, // отчёт не меняется после создания
    retry: 0,
  });

  const report = data ?? null;
  return { report, hasReport: report !== null, isLoading, error: error as Error | null };
}
