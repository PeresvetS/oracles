'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { UpdateSettingsPayload } from '@/types/index';

/** Конфигурация полей API-ключей */
interface ApiKeyField {
  /** Ключ в настройках */
  settingKey: keyof UpdateSettingsPayload;
  /** Функция получения метки */
  getLabel: (t: ReturnType<typeof useI18n>['t']) => string;
}

const API_KEY_FIELDS: ApiKeyField[] = [
  { settingKey: 'openrouter_api_key', getLabel: (t) => t.admin.openrouterKey },
  { settingKey: 'perplexity_api_key', getLabel: (t) => t.admin.perplexityKey },
  { settingKey: 'serper_api_key', getLabel: (t) => t.admin.serperKey },
  { settingKey: 'anthropic_api_key', getLabel: (t) => t.admin.anthropicKey },
  { settingKey: 'openai_api_key', getLabel: (t) => t.admin.openaiKey },
  { settingKey: 'google_api_key', getLabel: (t) => t.admin.googleKey },
];

const DEFAULT_SETTING_FIELDS: ApiKeyField[] = [
  { settingKey: 'default_max_rounds', getLabel: (t) => t.admin.defaultMaxRounds },
  { settingKey: 'default_analyst_count', getLabel: (t) => t.admin.defaultAnalystCount },
];

/**
 * Форма управления API-ключами и настройками по умолчанию.
 * Загружает маскированные значения из GET /api/settings.
 * Каждое поле сохраняется отдельно через PATCH /api/settings.
 */
export function ApiKeysForm() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => api.get<Record<string, string>>('/api/settings'),
  });

  // Локальные значения полей (редактируемые)
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  // Флаги состояния сохранения для каждого ключа
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set());

  // Инициализируем локальные значения из загруженных настроек
  useEffect(() => {
    if (settings) {
      setLocalValues((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(settings)) {
          if (!(key in next)) {
            next[key] = '';
          }
        }
        return next;
      });
    }
  }, [settings]);

  const handleSave = async (settingKey: string): Promise<void> => {
    const value = (localValues[settingKey] ?? '').trim();
    if (!value) return;

    setSavingKeys((prev) => new Set(prev).add(settingKey));
    try {
      await api.patch('/api/settings', { [settingKey]: value });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
        queryClient.invalidateQueries({ queryKey: ['models'] }),
      ]);
      // Сбрасываем локальное значение после успешного сохранения
      setLocalValues((prev) => ({ ...prev, [settingKey]: '' }));
      toast.success(t.admin.apiKeysSaved);
    } catch {
      toast.error(t.admin.apiKeysSaveError);
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(settingKey);
        return next;
      });
    }
  };

  const renderField = (field: ApiKeyField, isPassword = true) => {
    const key = field.settingKey;
    const label = field.getLabel(t);
    const maskedValue = settings?.[key] ?? '';
    const localValue = localValues[key] ?? '';
    const isSaving = savingKeys.has(key);
    const hasChange = localValue.trim().length > 0;

    return (
      <div key={key} className="space-y-1.5">
        <Label htmlFor={key}>{label}</Label>
        <div className="flex gap-2">
          <Input
            id={key}
            type={isPassword ? 'password' : 'text'}
            value={localValue}
            placeholder={maskedValue || t.admin.keyPlaceholder}
            onChange={(e) => setLocalValues((prev) => ({ ...prev, [key]: e.target.value }))}
            className="flex-1 font-mono text-sm"
            autoComplete="off"
          />
          <Button
            size="sm"
            variant={hasChange ? 'default' : 'outline'}
            disabled={!hasChange || isSaving}
            onClick={() => void handleSave(key)}
          >
            {isSaving ? '...' : t.admin.saveKey}
          </Button>
        </div>
        {maskedValue && (
          <p className="text-xs text-muted-foreground">
            {t.admin.currentMaskedValue}:{' '}
            <span className="font-mono">{maskedValue}</span>
          </p>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* API-ключи провайдеров */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.admin.apiKeysTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {API_KEY_FIELDS.map((field) => renderField(field, true))}
        </CardContent>
      </Card>

      {/* Настройки по умолчанию */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.admin.defaultSettings}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {DEFAULT_SETTING_FIELDS.map((field) => renderField(field, false))}
        </CardContent>
      </Card>
    </div>
  );
}
