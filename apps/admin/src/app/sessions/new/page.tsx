'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { useModels } from '@/hooks/use-models';
import { useI18n } from '@/i18n/context';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AgentConfigurator } from '@/components/session-config/agent-configurator';
import { AppShell } from '@/components/ui/app-shell';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { FiltersConfig } from '@/components/session-config/filters-config';
import {
  SESSION_MODE,
  SESSION_LIMITS,
  AGENT_ROLE,
} from '@/types';
import type {
  SessionMode,
  SessionDto,
  CreateSessionPayload,
  AgentFormState,
  FiltersFormState,
} from '@/types';

/** Дефолтные фильтры */
const DEFAULT_FILTERS: FiltersFormState = {
  complexity: 5,
  budget: '',
  timeToRevenue: '3_months',
  marketSize: 'medium',
  legalRisk: 'medium',
  requireCompetitors: true,
  operabilityCheck: true,
};

/** Создать начальный список агентов (без моделей — заполняется после загрузки) */
function buildInitialAgents(): AgentFormState[] {
  const agents: AgentFormState[] = [
    {
      _tempId: crypto.randomUUID(),
      role: AGENT_ROLE.DIRECTOR,
      name: '',
      modelId: '',
      provider: '',
      systemPrompt: '',
      webSearchEnabled: false,
    },
  ];

  for (let i = 0; i < SESSION_LIMITS.DEFAULT_ANALYSTS; i++) {
    agents.push({
      _tempId: crypto.randomUUID(),
      role: AGENT_ROLE.ANALYST,
      name: '',
      modelId: '',
      provider: '',
      systemPrompt: '',
      webSearchEnabled: true,
    });
  }

  agents.push({
    _tempId: crypto.randomUUID(),
    role: AGENT_ROLE.RESEARCHER,
    name: '',
    modelId: '',
    provider: '',
    systemPrompt: '',
    webSearchEnabled: false,
  });

  return agents;
}

/** Конвертировать AgentFormState в payload для API */
function toAgentPayload(agent: AgentFormState): CreateSessionPayload['agents'][0] {
  return {
    role: agent.role,
    name: agent.name || undefined,
    provider: agent.provider,
    modelId: agent.modelId,
    customSystemPrompt: agent.systemPrompt || undefined,
    webSearchEnabled: agent.webSearchEnabled,
  };
}

/** Полная форма создания новой сессии */
export default function NewSessionPage() {
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const { models } = useModels();

  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<SessionMode>(SESSION_MODE.GENERATE);
  const [inputPrompt, setInputPrompt] = useState('');
  const [existingIdeas, setExistingIdeas] = useState('');
  const [agents, setAgents] = useState<AgentFormState[]>(buildInitialAgents);
  const [filters, setFilters] = useState<FiltersFormState>(DEFAULT_FILTERS);
  const [maxRounds, setMaxRounds] = useState<number>(SESSION_LIMITS.DEFAULT_MAX_ROUNDS);
  const [maxResearchCalls, setMaxResearchCalls] = useState<number>(
    SESSION_LIMITS.DEFAULT_MAX_RESEARCH_CALLS,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Авто-назначение первой доступной модели агентам без модели
  useEffect(() => {
    if (models.length === 0) return;
    const available = models.filter((m) => m.available);
    if (available.length === 0) return;

    const defaultDefaultModel = available.find((m) => m.provider === 'openrouter') ?? available[0];
    const defaultResearchModel =
      available.find((m) => m.provider === 'perplexity') ?? defaultDefaultModel;
    setAgents((prev) =>
      prev.map((agent) => {
        if (agent.modelId) return agent;
        const defaultModel =
          agent.role === AGENT_ROLE.RESEARCHER ? defaultResearchModel : defaultDefaultModel;
        return { ...agent, modelId: defaultModel.id, provider: defaultModel.provider };
      }),
    );
  }, [models]);

  if (!isAuthenticated) return null;

  const analysts = agents.filter((a) => a.role === AGENT_ROLE.ANALYST);
  const hasDirector = agents.some((a) => a.role === AGENT_ROLE.DIRECTOR);
  const hasResearcher = agents.some((a) => a.role === AGENT_ROLE.RESEARCHER);
  const canAddAnalyst = analysts.length < SESSION_LIMITS.MAX_ANALYSTS;
  const canRemoveAnalyst = analysts.length > SESSION_LIMITS.MIN_ANALYSTS;

  const addAnalyst = () => {
    if (!canAddAnalyst) return;
    const available =
      models.find((m) => m.available && m.provider === 'openrouter') ??
      models.find((m) => m.available);
    setAgents((prev) => [
      ...prev,
      {
        _tempId: crypto.randomUUID(),
        role: AGENT_ROLE.ANALYST,
        name: '',
        modelId: available?.id ?? '',
        provider: available?.provider ?? '',
        systemPrompt: '',
        webSearchEnabled: true,
      },
    ]);
  };

  const removeAgent = (tempId: string) => {
    setAgents((prev) => prev.filter((a) => a._tempId !== tempId));
  };

  const updateAgent = (updated: AgentFormState) => {
    setAgents((prev) => prev.map((a) => (a._tempId === updated._tempId ? updated : a)));
  };

  const isFormValid =
    inputPrompt.trim().length > 0 &&
    hasDirector &&
    hasResearcher &&
    analysts.length >= SESSION_LIMITS.MIN_ANALYSTS &&
    agents.every((a) => a.modelId.length > 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      const normalizedMaxRounds = Math.min(
        Math.max(maxRounds, SESSION_LIMITS.MIN_ROUNDS),
        SESSION_LIMITS.MAX_ROUNDS,
      );
      const normalizedMaxResearchCalls = Math.min(
        Math.max(maxResearchCalls, 0),
        SESSION_LIMITS.MAX_RESEARCH_CALLS,
      );
      const existingIdeasList = mode === SESSION_MODE.VALIDATE
        ? existingIdeas.split('\n').map((s) => s.trim()).filter(Boolean)
        : undefined;

      const payload: CreateSessionPayload = {
        ...(title.trim() ? { title: title.trim() } : {}),
        mode,
        inputPrompt: inputPrompt.trim(),
        existingIdeas: existingIdeasList,
        agents: agents.map(toAgentPayload),
        filters: {
          maxComplexity: filters.complexity,
          ...(filters.budget !== '' && { maxBudget: Number(filters.budget) }),
          timeToRevenue: filters.timeToRevenue,
          minMarketSize: filters.marketSize,
          requireCompetitors: filters.requireCompetitors,
          legalRiskTolerance: filters.legalRisk,
          operabilityCheck: filters.operabilityCheck,
        },
        maxRounds: normalizedMaxRounds,
        maxResearchCalls: normalizedMaxResearchCalls,
      };

      const session = await api.post<SessionDto>('/api/sessions', payload);
      await api.post(`/api/sessions/${session.id}/start`);
      toast.success(t.sessionForm.createdSuccess);
      router.push(`/sessions/${session.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.errors.generic);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppShell>
      <ErrorBoundary>
      <div className="h-full overflow-y-auto">
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* ── Секция 1: Основное ── */}
          <Card>
            <CardHeader>
              <CardTitle>{t.sessionForm.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Название */}
              <div className="flex flex-col gap-1">
                <Label htmlFor="title">{t.sessionForm.nameLabel}</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.sessionForm.namePlaceholder}
                />
              </div>

              {/* Режим */}
              <div className="flex flex-col gap-2">
                <Label>{t.sessionForm.modeLabel}</Label>
                <div className="flex gap-3">
                  {([SESSION_MODE.GENERATE, SESSION_MODE.VALIDATE] as const).map((m) => {
                    const isSelected = mode === m;
                    const label =
                      m === SESSION_MODE.GENERATE
                        ? t.sessionForm.modeGenerate
                        : t.sessionForm.modeValidate;
                    const desc =
                      m === SESSION_MODE.GENERATE
                        ? t.sessionForm.modeGenerateDesc
                        : t.sessionForm.modeValidateDesc;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`flex-1 rounded-md border px-4 py-3 text-left transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-muted-foreground'
                        }`}
                      >
                        <p className="font-medium">{label}</p>
                        <p className="mt-0.5 text-xs opacity-80">{desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Секция 2: Вводные данные ── */}
          <Card>
            <CardContent className="pt-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="inputPrompt">{t.sessionForm.promptLabel}</Label>
                <Textarea
                  id="inputPrompt"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  placeholder={t.sessionForm.promptPlaceholder}
                  className="min-h-[120px]"
                  required
                />
              </div>

              {mode === SESSION_MODE.VALIDATE && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="existingIdeas">{t.sessionForm.existingIdeas}</Label>
                  <Textarea
                    id="existingIdeas"
                    value={existingIdeas}
                    onChange={(e) => setExistingIdeas(e.target.value)}
                    placeholder={t.sessionForm.existingIdeasPlaceholder}
                    className="min-h-[100px]"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Секция 3: Агенты ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.sessionForm.agents}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {agents.map((agent) => (
                <AgentConfigurator
                  key={agent._tempId}
                  agent={agent}
                  onChange={updateAgent}
                  onRemove={
                    agent.role === AGENT_ROLE.ANALYST
                      ? () => removeAgent(agent._tempId)
                      : undefined
                  }
                  canRemove={agent.role === AGENT_ROLE.ANALYST && canRemoveAnalyst}
                />
              ))}

              {canAddAnalyst && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addAnalyst}
                  className="self-start"
                >
                  {t.sessionForm.addAnalyst}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* ── Секция 4: Фильтры ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.sessionForm.filters}</CardTitle>
            </CardHeader>
            <CardContent>
              <FiltersConfig value={filters} onChange={setFilters} />
            </CardContent>
          </Card>

          {/* ── Секция 5: Лимиты ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t.sessionForm.limits}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1 flex-1">
                  <Label htmlFor="maxRounds">{t.sessionForm.maxRoundsLabel}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="maxRounds"
                      type="number"
                      min={SESSION_LIMITS.MIN_ROUNDS}
                      max={SESSION_LIMITS.MAX_ROUNDS}
                      value={maxRounds}
                      onChange={(e) => setMaxRounds(Number(e.target.value))}
                      className="w-24"
                    />
                    <span className="text-xs text-muted-foreground">
                      {t.sessionForm.maxRoundsHint}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <Label htmlFor="maxResearchCalls">{t.sessionForm.maxResearchCalls}</Label>
                  <Input
                    id="maxResearchCalls"
                    type="number"
                    min={0}
                    max={SESSION_LIMITS.MAX_RESEARCH_CALLS}
                    value={maxResearchCalls}
                    onChange={(e) => setMaxResearchCalls(Number(e.target.value))}
                    className="w-24"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Кнопка создания */}
          <Button type="submit" disabled={isSubmitting || !isFormValid} size="lg">
            {isSubmitting ? t.sessionForm.creating : t.sessionForm.createSession}
          </Button>
        </form>
      </div>
      </div>
      </ErrorBoundary>
    </AppShell>
  );
}
