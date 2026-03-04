'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ModelSelector } from '@/components/session-config/model-selector';
import { PromptEditor } from '@/components/session-config/prompt-editor';
import { useI18n } from '@/i18n/context';
import type { AgentFormState } from '@/types';
import { AGENT_ROLE } from '@/types';

interface AgentConfiguratorProps {
  agent: AgentFormState;
  onChange: (updated: AgentFormState) => void;
  onRemove?: () => void;
  canRemove: boolean;
}

const ROLE_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  [AGENT_ROLE.DIRECTOR]: 'default',
  [AGENT_ROLE.ANALYST]: 'secondary',
  [AGENT_ROLE.RESEARCHER]: 'outline',
};

/** Карточка конфигурации одного агента в форме создания сессии */
export function AgentConfigurator({ agent, onChange, onRemove, canRemove }: AgentConfiguratorProps) {
  const { t } = useI18n();

  const update = (partial: Partial<AgentFormState>) => {
    onChange({ ...agent, ...partial });
  };

  const roleLabel =
    agent.role === AGENT_ROLE.DIRECTOR
      ? t.sessionForm.directorSection
      : agent.role === AGENT_ROLE.RESEARCHER
        ? t.sessionForm.researcherSection
        : t.sessionForm.analystSection;

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      {/* Заголовок: роль + имя + удалить */}
      <div className="flex items-center gap-3">
        <Badge variant={ROLE_BADGE_VARIANT[agent.role] ?? 'outline'} className="shrink-0">
          {roleLabel}
        </Badge>
        <Input
          value={agent.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder={t.sessionForm.agentNamePlaceholder}
          className="flex-1 h-8 text-sm"
        />
        {canRemove && onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive hover:text-destructive h-8 px-2"
          >
            ✕
          </Button>
        )}
      </div>

      {/* Выбор модели */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">{t.sessionForm.agentModel}</Label>
        <ModelSelector
          value={agent.modelId}
          onChange={(modelId, provider) => update({ modelId, provider })}
        />
      </div>

      {/* Редактор промпта */}
      <PromptEditor
        role={agent.role}
        modelId={agent.modelId}
        value={agent.systemPrompt}
        onChange={(systemPrompt) => update({ systemPrompt })}
      />

      {/* Веб-поиск */}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`web-search-${agent._tempId}`}
          checked={agent.webSearchEnabled}
          onCheckedChange={(checked) => update({ webSearchEnabled: checked === true })}
        />
        <Label htmlFor={`web-search-${agent._tempId}`} className="text-sm cursor-pointer">
          {t.sessionForm.webSearchEnabled}
        </Label>
      </div>
    </div>
  );
}
