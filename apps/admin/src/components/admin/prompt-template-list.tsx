'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useI18n } from '@/i18n/context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PromptTemplateEditor } from '@/components/admin/prompt-template-editor';
import { AGENT_ROLE } from '@/types/index';
import type { PromptTemplateDto, AgentRole } from '@/types/index';

const ROLE_OPTIONS: { value: AgentRole | 'all' }[] = [
  { value: 'all' },
  { value: AGENT_ROLE.DIRECTOR },
  { value: AGENT_ROLE.ANALYST },
  { value: AGENT_ROLE.RESEARCHER },
];

/**
 * Список шаблонов промптов с фильтрацией по роли и модели.
 * Поддерживает создание, редактирование и удаление шаблонов.
 */
export function PromptTemplateList() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [roleFilter, setRoleFilter] = useState<AgentRole | 'all'>('all');
  const [modelFilter, setModelFilter] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplateDto | undefined>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const getRoleLabel = (role: AgentRole | 'all'): string => {
    switch (role) {
      case 'all':
        return t.admin.filterAll;
      case AGENT_ROLE.DIRECTOR:
        return t.admin.roleDirector;
      case AGENT_ROLE.ANALYST:
        return t.admin.roleAnalyst;
      case AGENT_ROLE.RESEARCHER:
        return t.admin.roleResearcher;
      default:
        return role;
    }
  };

  const queryParams = new URLSearchParams();
  if (roleFilter !== 'all') queryParams.set('role', roleFilter);
  if (modelFilter.trim()) queryParams.set('modelId', modelFilter.trim());

  const { data: templates, isLoading } = useQuery<PromptTemplateDto[]>({
    queryKey: ['prompts', roleFilter, modelFilter],
    queryFn: () =>
      api.get<PromptTemplateDto[]>(`/api/prompts?${queryParams.toString()}`),
  });

  const handleCreate = (): void => {
    setEditingTemplate(undefined);
    setEditorOpen(true);
  };

  const handleEdit = (template: PromptTemplateDto): void => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleEditorClose = (): void => {
    setEditorOpen(false);
    setEditingTemplate(undefined);
  };

  const handleDelete = async (id: string): Promise<void> => {
    setDeletingId(id);
    try {
      await api.delete(`/api/prompts/${id}`);
      await queryClient.invalidateQueries({ queryKey: ['prompts'] });
      toast.success(t.admin.promptDeleted);
    } catch {
      toast.error(t.common.error);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Панель фильтров и создания */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={roleFilter}
          onValueChange={(v) => setRoleFilter(v as AgentRole | 'all')}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t.admin.filterRole} />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {getRoleLabel(o.value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={modelFilter}
          onChange={(e) => setModelFilter(e.target.value)}
          placeholder={t.admin.filterModel}
          className="w-[220px] text-sm"
        />

        <div className="flex-1" />

        <Button onClick={handleCreate} size="sm">
          {t.admin.promptsCreate}
        </Button>
      </div>

      {/* Таблица */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : !templates?.length ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center text-muted-foreground">
          <p>{t.admin.promptsEmpty}</p>
          <Button onClick={handleCreate} variant="outline" size="sm">
            {t.admin.promptsCreate}
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">{t.admin.promptName}</th>
                <th className="px-4 py-3 text-left font-medium">{t.admin.promptRole}</th>
                <th className="px-4 py-3 text-left font-medium">{t.admin.promptModel}</th>
                <th className="px-4 py-3 text-left font-medium">{t.admin.defaultBadge}</th>
                <th className="px-4 py-3 text-right font-medium">{t.common.edit}</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr key={tpl.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{tpl.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{getRoleLabel(tpl.role)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {tpl.modelId ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    {tpl.isDefault && (
                      <Badge variant="secondary" className="text-xs">
                        {t.admin.defaultBadge}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(tpl)}
                      >
                        {t.common.edit}
                      </Button>

                      {/* Инлайн-подтверждение удаления */}
                      {confirmDeleteId === tpl.id ? (
                        <>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={deletingId === tpl.id}
                            onClick={() => void handleDelete(tpl.id)}
                          >
                            {deletingId === tpl.id ? '...' : t.common.confirm}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            {t.common.cancel}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setConfirmDeleteId(tpl.id)}
                        >
                          {t.common.delete}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PromptTemplateEditor
        open={editorOpen}
        onClose={handleEditorClose}
        template={editingTemplate}
      />
    </div>
  );
}
