'use client';

import { useAuth } from '@/hooks/use-auth';
import { useI18n } from '@/i18n/context';
import { AppShell } from '@/components/ui/app-shell';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { PromptTemplateList } from '@/components/admin/prompt-template-list';

/** Страница управления шаблонами промптов */
export default function PromptsPage() {
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();

  if (!isAuthenticated) return null;

  return (
    <AppShell>
      <ErrorBoundary>
        <div className="container mx-auto px-4 py-8">
          <h1 className="mb-6 text-2xl font-bold">{t.admin.promptsTitle}</h1>
          <PromptTemplateList />
        </div>
      </ErrorBoundary>
    </AppShell>
  );
}
