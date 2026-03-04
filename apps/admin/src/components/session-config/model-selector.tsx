'use client';

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useModels } from '@/hooks/use-models';
import { useI18n } from '@/i18n/context';
import type { ModelInfo } from '@/types';

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string, provider: string) => void;
  disabled?: boolean;
}

/** Группирует модели по семейству */
function groupByFamily(models: ModelInfo[]): Map<string, ModelInfo[]> {
  const groups = new Map<string, ModelInfo[]>();
  for (const model of models) {
    const key = model.family;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(model);
  }
  return groups;
}

/** Выпадающий список выбора модели с группировкой по семейству */
export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const { t } = useI18n();
  const { models, isLoading } = useModels();

  const grouped = groupByFamily(models);

  const handleChange = (modelId: string) => {
    const model = models.find((m) => m.id === modelId);
    if (model) {
      onChange(model.id, model.provider);
    }
  };

  return (
    <Select value={value} onValueChange={handleChange} disabled={disabled || isLoading}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={t.sessionForm.agentModel} />
      </SelectTrigger>
      <SelectContent>
        {Array.from(grouped.entries()).map(([family, familyModels]) => (
          <SelectGroup key={family}>
            <SelectLabel className="capitalize">{family}</SelectLabel>
            {familyModels.map((model) => (
              <SelectItem
                key={model.id}
                value={model.id}
                disabled={!model.available}
                className={!model.available ? 'opacity-50' : ''}
                title={!model.available ? t.sessionForm.apiKeyNotConfigured : undefined}
              >
                <span>{model.name}</span>
                {!model.available && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({t.sessionForm.apiKeyNotConfigured})
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
