'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { I18nProvider } from '@/i18n/context';

interface ProvidersProps {
  children: React.ReactNode;
}

/** Клиентские провайдеры: тема, i18n, React Query, уведомления */
export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <I18nProvider defaultLocale="ru">
          {children}
          <Toaster richColors position="top-right" />
        </I18nProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
