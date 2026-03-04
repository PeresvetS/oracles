'use client';

import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useI18n } from '@/i18n/context';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/ui/app-shell';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { SessionList } from '@/components/sessions/session-list';

/** Дашборд со списком сессий */
export default function SessionsPage() {
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();

  if (!isAuthenticated) {
    return null;
  }

  return (
    <AppShell>
      <ErrorBoundary>
        <div className="h-full overflow-y-auto">
          <div className="container mx-auto px-4 py-8">
            <div className="mb-8 flex items-center justify-between">
              <h1 className="text-2xl font-bold">{t.sessions.title}</h1>
              <Link href="/sessions/new">
                <Button>{t.sessions.newSession}</Button>
              </Link>
            </div>
            <SessionList />
          </div>
        </div>
      </ErrorBoundary>
    </AppShell>
  );
}
