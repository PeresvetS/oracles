'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { SessionCard } from '@/components/sessions/session-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n/context';
import type { SessionsListResponse } from '@/types/index';

/** Список всех сессий с загрузкой через TanStack Query */
export function SessionList() {
  const { t } = useI18n();

  const { data, isLoading, error } = useQuery<SessionsListResponse>({
    queryKey: ['sessions'],
    queryFn: () => api.get<SessionsListResponse>('/api/sessions'),
  });

  useEffect(() => {
    if (error) {
      toast.error(t.errors.networkError);
    }
  }, [error, t.errors.networkError]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="py-12 text-center text-destructive">{t.common.error}</p>;
  }

  if (!data?.items?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <p className="text-lg font-medium text-foreground">{t.sessions.noSessions}</p>
        <p className="text-sm text-muted-foreground">{t.sessions.noSessionsHint}</p>
        <Link href="/sessions/new">
          <Button variant="outline">{t.sessions.createFirst}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.items.map((session) => (
        <SessionCard key={session.id} session={session} />
      ))}
    </div>
  );
}
