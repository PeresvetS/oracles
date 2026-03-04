'use client';

import { useAuth } from '@/hooks/use-auth';
import { useI18n } from '@/i18n/context';
import { AppShell } from '@/components/ui/app-shell';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ApiKeysForm } from '@/components/admin/api-keys-form';

/** Страница управления API-ключами и настройками */
export default function AdminPage() {
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();

  if (!isAuthenticated) return null;

  return (
    <AppShell>
      <ErrorBoundary>
        <div className="container mx-auto max-w-2xl px-4 py-8">
          <h1 className="mb-6 text-2xl font-bold">{t.admin.apiKeysTitle}</h1>
          <ApiKeysForm />
        </div>
      </ErrorBoundary>
    </AppShell>
  );
}
