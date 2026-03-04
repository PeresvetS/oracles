'use client';

import { useAuth } from '@/hooks/use-auth';
import { useI18n } from '@/i18n/context';
import { AppShell } from '@/components/ui/app-shell';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ModelList } from '@/components/admin/model-list';

/** Страница просмотра доступных моделей */
export default function ModelsPage() {
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();

  if (!isAuthenticated) return null;

  return (
    <AppShell>
      <ErrorBoundary>
        <div className="container mx-auto px-4 py-8">
          <h1 className="mb-6 text-2xl font-bold">{t.admin.modelsTitle}</h1>
          <ModelList />
        </div>
      </ErrorBoundary>
    </AppShell>
  );
}
