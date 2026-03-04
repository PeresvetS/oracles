'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ModelInfo } from '@/types';

/** Список доступных моделей из GET /api/models */
export function useModels(): { models: ModelInfo[]; isLoading: boolean } {
  const { data, isLoading } = useQuery<ModelInfo[]>({
    queryKey: ['models'],
    queryFn: () => api.get<ModelInfo[]>('/api/models'),
    staleTime: 5 * 60 * 1000, // 5 минут — редко меняется
  });

  return { models: data ?? [], isLoading };
}
