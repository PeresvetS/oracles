'use client';

import { useI18n } from '@/i18n/context';
import { useModels } from '@/hooks/use-models';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

/**
 * Таблица доступных моделей из реестра.
 * Показывает провайдера, family, цены и статус доступности (API-ключ).
 */
export function ModelList() {
  const { t } = useI18n();
  const { models, isLoading } = useModels();

  const formatContext = (tokens: number): string => {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
    return String(tokens);
  };

  const formatPrice = (price: number): string => {
    if (price === 0) return '—';
    return `$${(price * 1000).toFixed(4)}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!models.length) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <p>{t.admin.modelsEmpty}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium">{t.admin.modelHeaderName}</th>
            <th className="px-4 py-3 text-left font-medium">{t.admin.modelHeaderFamily}</th>
            <th className="px-4 py-3 text-left font-medium">{t.admin.modelHeaderProvider}</th>
            <th className="px-4 py-3 text-right font-medium">{t.admin.modelContext}</th>
            <th className="px-4 py-3 text-right font-medium">{t.admin.modelPriceIn}</th>
            <th className="px-4 py-3 text-right font-medium">{t.admin.modelPriceOut}</th>
            <th className="px-4 py-3 text-center font-medium">{t.admin.modelHeaderStatus}</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <div>
                  <p className="font-medium">{model.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{model.id}</p>
                </div>
              </td>
              <td className="px-4 py-3 capitalize text-muted-foreground">
                {model.family}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{model.provider}</td>
              <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                {formatContext(model.contextWindow)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                {formatPrice(model.costPer1kInput)}
              </td>
              <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                {formatPrice(model.costPer1kOutput)}
              </td>
              <td className="px-4 py-3 text-center">
                {model.available ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  >
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {t.admin.modelAvailable}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-muted-foreground/30 bg-muted/50 text-muted-foreground"
                  >
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                    {t.admin.modelUnavailable}
                  </Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
