'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { usePrompts } from '@/hooks/use-prompts';
import { useI18n } from '@/i18n/context';
import type { PromptTemplateDto } from '@/types';

const CUSTOM_VALUE = '__custom__';

interface PromptEditorProps {
  role: string;
  modelId: string;
  value: string;
  onChange: (v: string) => void;
}

/** Редактор системного промпта с выбором шаблона и авто-выбором по модели */
export function PromptEditor({ role, modelId, value, onChange }: PromptEditorProps) {
  const { t } = useI18n();
  const { prompts, isLoading } = usePrompts(role);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(CUSTOM_VALUE);
  const [isEditing, setIsEditing] = useState(false);
  const prevModelIdRef = useRef<string>(modelId);

  /** Найти наиболее подходящий дефолтный промпт для модели */
  const findDefaultPrompt = (
    templateList: PromptTemplateDto[],
    targetModelId: string,
  ): PromptTemplateDto | undefined => {
    // Приоритет 1: дефолтный промпт именно для этой модели
    const exact = templateList.find((p) => p.isDefault && p.modelId === targetModelId);
    if (exact) return exact;
    // Приоритет 2: дефолтный промпт без привязки к модели
    return templateList.find((p) => p.isDefault && p.modelId === null);
  };

  // Авто-выбор промпта при смене модели
  useEffect(() => {
    if (prevModelIdRef.current === modelId) return;
    prevModelIdRef.current = modelId;

    if (prompts.length === 0) return;

    const defaultPrompt = findDefaultPrompt(prompts, modelId);
    if (defaultPrompt) {
      setSelectedTemplateId(defaultPrompt.id);
      onChange(defaultPrompt.content);
    }
  }, [modelId, prompts, onChange]);

  // Авто-выбор при первой загрузке промптов (если value пустой)
  useEffect(() => {
    if (!value && prompts.length > 0) {
      const defaultPrompt = findDefaultPrompt(prompts, modelId);
      if (defaultPrompt) {
        setSelectedTemplateId(defaultPrompt.id);
        onChange(defaultPrompt.content);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts]);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === CUSTOM_VALUE) {
      setIsEditing(true);
      return;
    }
    const template = prompts.find((p) => p.id === templateId);
    if (template) {
      onChange(template.content);
      setIsEditing(false);
    }
  };

  const handleTextChange = (v: string) => {
    setSelectedTemplateId(CUSTOM_VALUE);
    onChange(v);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs text-muted-foreground">{t.sessionForm.agentPrompt}</Label>
      <Select
        value={selectedTemplateId}
        onValueChange={handleTemplateChange}
        disabled={isLoading}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t.sessionForm.agentPrompt} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={CUSTOM_VALUE}>{t.sessionForm.promptTemplateCustom}</SelectItem>
          {prompts.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
              {p.isDefault && (
                <span className="ml-1 text-xs text-muted-foreground">
                  ({t.sessionForm.promptTemplateDefault})
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditing((prev) => !prev)}>
          {isEditing ? t.sessionForm.hidePromptEditor : t.common.edit}
        </Button>
      </div>
      {isEditing && (
        <Textarea
          value={value}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={t.sessionForm.agentPrompt}
          rows={4}
          className="text-xs font-mono resize-y"
        />
      )}
    </div>
  );
}
