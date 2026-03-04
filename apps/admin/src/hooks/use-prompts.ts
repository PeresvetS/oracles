'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PromptTemplateDto } from '@/types';

/** Список промпт-шаблонов для роли из GET /api/prompts?role=... */
export function usePrompts(role: string): { prompts: PromptTemplateDto[]; isLoading: boolean } {
  const { data, isLoading } = useQuery<PromptTemplateDto[]>({
    queryKey: ['prompts', role],
    queryFn: () => api.get<PromptTemplateDto[]>(`/api/prompts?role=${role}`),
    enabled: Boolean(role),
    staleTime: 2 * 60 * 1000, // 2 минуты
  });

  return { prompts: data ?? [], isLoading };
}
