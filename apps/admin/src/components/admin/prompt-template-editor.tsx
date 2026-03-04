'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AGENT_ROLE } from '@/types/index';
import type { PromptTemplateDto, CreatePromptPayload, UpdatePromptPayload, AgentRole } from '@/types/index';

interface PromptTemplateEditorProps {
  open: boolean;
  onClose: () => void;
  /** Если передан — режим редактирования, иначе — создания */
  template?: PromptTemplateDto;
}

const AVAILABLE_ROLES: { value: AgentRole }[] = [
  { value: AGENT_ROLE.DIRECTOR },
  { value: AGENT_ROLE.ANALYST },
  { value: AGENT_ROLE.RESEARCHER },
];

/**
 * Диалог создания / редактирования шаблона промпта.
 */
export function PromptTemplateEditor({ open, onClose, template }: PromptTemplateEditorProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [role, setRole] = useState<AgentRole>(AGENT_ROLE.ANALYST);
  const [modelId, setModelId] = useState('');
  const [content, setContent] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const getRoleLabel = (roleValue: AgentRole): string => {
    switch (roleValue) {
      case AGENT_ROLE.DIRECTOR:
        return t.admin.roleDirector;
      case AGENT_ROLE.ANALYST:
        return t.admin.roleAnalyst;
      case AGENT_ROLE.RESEARCHER:
        return t.admin.roleResearcher;
      default:
        return roleValue;
    }
  };

  // Заполняем форму при открытии для редактирования
  useEffect(() => {
    if (open) {
      if (template) {
        setName(template.name);
        setRole(template.role);
        setModelId(template.modelId ?? '');
        setContent(template.content);
        setIsDefault(template.isDefault);
      } else {
        setName('');
        setRole(AGENT_ROLE.ANALYST);
        setModelId('');
        setContent('');
        setIsDefault(false);
      }
    }
  }, [open, template]);

  const isValid = name.trim().length > 0 && content.trim().length > 0;

  const handleSubmit = async (): Promise<void> => {
    if (!isValid) return;

    setIsSaving(true);
    try {
      if (template) {
        const payload: UpdatePromptPayload = {
          name: name.trim(),
          modelId: modelId.trim() || undefined,
          content: content.trim(),
          isDefault,
        };
        await api.patch<PromptTemplateDto>(`/api/prompts/${template.id}`, payload);
      } else {
        const payload: CreatePromptPayload = {
          name: name.trim(),
          role,
          modelId: modelId.trim() || undefined,
          content: content.trim(),
          isDefault,
        };
        await api.post<PromptTemplateDto>('/api/prompts', payload);
      }

      await queryClient.invalidateQueries({ queryKey: ['prompts'] });
      toast.success(template ? t.admin.promptSaveSuccess : t.admin.promptCreateSuccess);
      onClose();
    } catch {
      toast.error(t.admin.promptSaveError);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {template ? t.admin.promptEditTitle : t.admin.promptCreateTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Название */}
          <div className="space-y-1.5">
            <Label htmlFor="prompt-name">{t.admin.promptName}</Label>
            <Input
              id="prompt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.admin.promptName}
            />
          </div>

          {/* Роль (только при создании) */}
          {!template && (
            <div className="space-y-1.5">
              <Label>{t.admin.promptRole}</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as AgentRole)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {getRoleLabel(r.value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Модель */}
          <div className="space-y-1.5">
            <Label htmlFor="prompt-model">{t.admin.promptModel}</Label>
            <Input
              id="prompt-model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={t.admin.promptModelPlaceholder}
              className="font-mono text-sm"
            />
          </div>

          {/* Содержимое */}
          <div className="space-y-1.5">
            <Label htmlFor="prompt-content">{t.admin.promptContent}</Label>
            <Textarea
              id="prompt-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t.admin.promptContent}
              rows={10}
              className="resize-y font-mono text-sm"
            />
          </div>

          {/* По умолчанию */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="prompt-default"
              checked={isDefault}
              onCheckedChange={(v) => setIsDefault(v === true)}
            />
            <Label htmlFor="prompt-default" className="cursor-pointer text-sm">
              {t.admin.promptIsDefault}
            </Label>
          </div>
        </div>

        {/* Действия */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            {t.common.cancel}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!isValid || isSaving}>
            {isSaving ? '...' : t.common.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
