import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import type { Idea } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { IDEA_STATUS, type IdeaStatus, type AnalystScore } from '@oracle/shared';
import { PrismaService } from '@prisma/prisma.service';
import {
  IDEA_LIMITS,
  VALID_STATUS_TRANSITIONS,
  DEFAULT_REJECTION_REASON,
} from '@core/ideas/constants/ideas.constants';

/** Данные для создания идеи */
interface CreateIdeaData {
  sessionId: string;
  title: string;
  summary: string;
  proposedByAgentId?: string;
  proposedInRound?: number;
  details?: Record<string, unknown>;
}

/** Данные для обновления статуса */
interface UpdateStatusMetadata {
  rejectedInRound?: number;
  rejectionReason?: string;
}

/** Результат финализации идей */
interface FinalizeResult {
  finalized: Idea[];
  rejected: Idea[];
}

/** Сырая идея, извлечённая из текстового ответа LLM */
interface ParsedIdeaCandidate {
  title: string;
  summary: string;
}

/** Минимальная длина заголовка идеи */
const IDEA_TITLE_MIN_LENGTH = 3;

/** Максимальная длина заголовка идеи */
const IDEA_TITLE_MAX_LENGTH = 200;

/** Максимальная длина summary идеи */
const IDEA_SUMMARY_MAX_LENGTH = 1_200;

/** Минимальная длина summary идеи */
const IDEA_SUMMARY_MIN_LENGTH = 10;

/** Имена массивов идей в JSON-ответах LLM */
const IDEA_ARRAY_KEYS = [
  'ideas',
  'finalIdeas',
  'finalists',
  'topIdeas',
  'recommendations',
] as const;

/** Поля с заголовком идеи в JSON-объектах */
const IDEA_TITLE_KEYS = ['title', 'name', 'idea', 'concept'] as const;

/** Поля с описанием идеи в JSON-объектах */
const IDEA_SUMMARY_KEYS = [
  'summary',
  'description',
  'thesis',
  'value',
  'mechanics',
  'implementation',
  'mvp_approach',
  'key_risk',
] as const;

/** Regex для поиска fenced code blocks c JSON */
const JSON_FENCE_REGEX = /```(?:json)?\s*([\s\S]*?)```/gi;

/**
 * Сервис управления идеями.
 *
 * Жизненный цикл идеи: PROPOSED → ACTIVE → FINAL / REJECTED.
 * Хранит скоры аналитиков в JSON-поле `scores` (Record<agentId, AnalystScore>).
 * Агрегирует avgIce и avgRice из scores при каждом addScore.
 */
@Injectable()
export class IdeasService {
  private readonly logger = new Logger(IdeasService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Создать одну идею со статусом PROPOSED.
   *
   * @param data - Данные идеи
   * @returns Созданная идея
   */
  async create(data: CreateIdeaData): Promise<Idea> {
    return this.prisma.idea.create({
      data: {
        sessionId: data.sessionId,
        title: data.title,
        summary: data.summary,
        status: IDEA_STATUS.PROPOSED,
        proposedByAgentId: data.proposedByAgentId ?? null,
        proposedInRound: data.proposedInRound ?? null,
        ...(data.details && { details: data.details as Prisma.InputJsonValue }),
      },
    });
  }

  /**
   * Массовое создание идей из ответа агента.
   *
   * @param sessionId - ID сессии
   * @param agentId - ID агента-автора
   * @param roundNumber - Номер раунда
   * @param ideas - Список идей {title, summary}
   * @returns Созданные идеи
   */
  async createFromAgentResponse(
    sessionId: string,
    agentId: string,
    roundNumber: number,
    ideas: { title: string; summary: string }[],
  ): Promise<Idea[]> {
    if (ideas.length === 0) return [];

    const normalizedExistingTitles = await this.loadExistingTitleSet(sessionId);
    const uniqueIdeas = this.deduplicateIdeas(ideas, normalizedExistingTitles);

    if (uniqueIdeas.length === 0) {
      this.logger.debug(`[${sessionId}] Нет новых идей для сохранения после дедупликации`);
      return [];
    }

    const created = await this.prisma.$transaction(
      uniqueIdeas.map((idea) =>
        this.prisma.idea.create({
          data: {
            sessionId,
            title: idea.title,
            summary: idea.summary,
            status: IDEA_STATUS.PROPOSED,
            proposedByAgentId: agentId,
            proposedInRound: roundNumber,
          },
        }),
      ),
    );

    this.logger.debug(`[${sessionId}] Создано ${created.length} идей от агента ${agentId}`);
    return created;
  }

  /**
   * Парсинг идей из текста ответа аналитика.
   *
   * Поддерживаемые форматы:
   * 1) Markdown блоки: "### Название" + абзац summary ниже
   * 2) Нумерованные/маркированные строки: "1. Название — summary"
   *
   * @param content - Ответ аналитика
   * @returns Список распарсенных идей (дедуплицированных по title)
   */
  parseIdeasFromText(content: string): ParsedIdeaCandidate[] {
    if (!content.trim()) {
      return [];
    }

    const jsonIdeas = this.extractIdeasFromJson(content);
    if (jsonIdeas.length > 0) {
      return this.deduplicateIdeas(jsonIdeas);
    }

    const headingIdeas = this.extractIdeasFromHeadings(content);
    const fallbackIdeas =
      headingIdeas.length > 0 ? headingIdeas : this.extractIdeasFromList(content);

    return this.deduplicateIdeas(fallbackIdeas);
  }

  /**
   * Обновить статус идеи с валидацией допустимых переходов.
   *
   * @param ideaId - ID идеи
   * @param newStatus - Новый статус
   * @param metadata - Дополнительные данные (для REJECTED)
   * @returns Обновлённая идея
   * @throws NotFoundException если идея не найдена
   * @throws BadRequestException при недопустимом переходе статуса
   */
  async updateStatus(
    ideaId: string,
    newStatus: IdeaStatus,
    metadata?: UpdateStatusMetadata,
  ): Promise<Idea> {
    const idea = await this.prisma.idea.findUnique({ where: { id: ideaId } });
    if (!idea) {
      throw new NotFoundException(`Идея ${ideaId} не найдена`);
    }

    this.validateStatusTransition(idea.status as IdeaStatus, newStatus);

    return this.prisma.idea.update({
      where: { id: ideaId },
      data: {
        status: newStatus,
        ...(metadata?.rejectedInRound !== undefined && {
          rejectedInRound: metadata.rejectedInRound,
        }),
        ...(metadata?.rejectionReason && { rejectionReason: metadata.rejectionReason }),
      },
    });
  }

  /**
   * Добавить скоринг аналитика к идее.
   *
   * Merges в JSON-поле scores, пересчитывает avgIce и avgRice.
   *
   * @param ideaId - ID идеи
   * @param agentId - ID аналитика
   * @param score - Скоринг ICE + RICE
   * @returns Обновлённая идея
   * @throws NotFoundException если идея не найдена
   */
  async addScore(ideaId: string, agentId: string, score: AnalystScore): Promise<Idea> {
    const idea = await this.prisma.idea.findUnique({ where: { id: ideaId } });
    if (!idea) {
      throw new NotFoundException(`Идея ${ideaId} не найдена`);
    }

    const existingScores = (idea.scores as Record<string, AnalystScore> | null) ?? {};
    const updatedScores: Record<string, AnalystScore> = {
      ...existingScores,
      [agentId]: score,
    };

    const { avgIce, avgRice } = this.recalculateAverages(updatedScores);

    return this.prisma.idea.update({
      where: { id: ideaId },
      data: {
        scores: updatedScores as unknown as Prisma.InputJsonValue,
        avgIce,
        avgRice,
      },
    });
  }

  /**
   * Финализировать ТОП идеи по скорингу.
   *
   * Сортирует ACTIVE/PROPOSED идеи по avgIce DESC (tiebreaker avgRice DESC).
   * ТОП topCount → FINAL, остальные → REJECTED.
   *
   * @param sessionId - ID сессии
   * @param topCount - Количество финальных идей
   * @returns Списки финализированных и отклонённых идей
   */
  async finalizeTopIdeas(sessionId: string, topCount: number): Promise<FinalizeResult> {
    const activeIdeas = await this.prisma.idea.findMany({
      where: {
        sessionId,
        status: { in: [IDEA_STATUS.PROPOSED, IDEA_STATUS.ACTIVE] },
      },
    });

    if (activeIdeas.length === 0) {
      this.logger.warn(`[${sessionId}] Нет активных идей для финализации`);
      return { finalized: [], rejected: [] };
    }

    // Сортировка по avgIce DESC, tiebreaker avgRice DESC
    const sorted = [...activeIdeas].sort((a, b) => {
      const iceA = a.avgIce ?? -1;
      const iceB = b.avgIce ?? -1;
      if (iceB !== iceA) return iceB - iceA;
      const riceA = a.avgRice ?? -1;
      const riceB = b.avgRice ?? -1;
      return riceB - riceA;
    });

    const clampedTopCount = Math.min(topCount, IDEA_LIMITS.MAX_TOP_COUNT);
    const toFinalize = sorted.slice(0, clampedTopCount);
    const toReject = sorted.slice(clampedTopCount);

    const rejectionReason = DEFAULT_REJECTION_REASON.replace(
      '{n}',
      String(Math.min(topCount, activeIdeas.length)),
    );

    const [finalized, rejected] = await Promise.all([
      this.prisma.$transaction(
        toFinalize.map((idea) =>
          this.prisma.idea.update({
            where: { id: idea.id },
            data: { status: IDEA_STATUS.FINAL },
          }),
        ),
      ),
      this.prisma.$transaction(
        toReject.map((idea) =>
          this.prisma.idea.update({
            where: { id: idea.id },
            data: {
              status: IDEA_STATUS.REJECTED,
              rejectionReason,
            },
          }),
        ),
      ),
    ]);

    this.logger.log(
      `[${sessionId}] Финализировано ${finalized.length}, отклонено ${rejected.length} идей`,
    );

    return { finalized, rejected };
  }

  /**
   * Получить идеи сессии с опциональным фильтром по статусу.
   *
   * @param sessionId - ID сессии
   * @param status - Фильтр по статусу (опционально)
   * @returns Список идей
   */
  async findBySession(sessionId: string, status?: IdeaStatus, userId?: string): Promise<Idea[]> {
    await this.assertSessionAccess(sessionId, userId);

    return this.prisma.idea.findMany({
      where: {
        sessionId,
        ...(status && { status }),
      },
      orderBy: [{ avgIce: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Получить отклонённые идеи сессии.
   *
   * @param sessionId - ID сессии
   * @returns Список отклонённых идей
   */
  async findRejected(sessionId: string, userId?: string): Promise<Idea[]> {
    await this.assertSessionAccess(sessionId, userId);

    return this.prisma.idea.findMany({
      where: { sessionId, status: IDEA_STATUS.REJECTED },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Получить идеи для скоринга (PROPOSED + ACTIVE).
   *
   * @param sessionId - ID сессии
   * @returns Список идей подлежащих скорингу
   */
  async findActiveForScoring(sessionId: string): Promise<Idea[]> {
    return this.prisma.idea.findMany({
      where: {
        sessionId,
        status: { in: [IDEA_STATUS.PROPOSED, IDEA_STATUS.ACTIVE] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Приватные методы
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Пересчитать средние значения ICE и RICE из всех скоров.
   *
   * @param scores - Record<agentId, AnalystScore>
   * @returns { avgIce, avgRice }
   */
  private recalculateAverages(scores: Record<string, AnalystScore>): {
    avgIce: number;
    avgRice: number;
  } {
    const values = Object.values(scores);
    if (values.length === 0) {
      return { avgIce: 0, avgRice: 0 };
    }

    const avgIce = values.reduce((sum, s) => sum + s.ice.total, 0) / values.length;
    const avgRice = values.reduce((sum, s) => sum + s.rice.total, 0) / values.length;

    return {
      avgIce: Math.round(avgIce * 100) / 100,
      avgRice: Math.round(avgRice * 100) / 100,
    };
  }

  /**
   * Валидация перехода статуса идеи.
   *
   * @throws BadRequestException при недопустимом переходе
   */
  private validateStatusTransition(current: IdeaStatus, target: IdeaStatus): void {
    const allowed = VALID_STATUS_TRANSITIONS[current];
    if (!allowed || !allowed.includes(target)) {
      throw new BadRequestException(`Недопустимый переход статуса идеи: ${current} → ${target}`);
    }
  }

  private async assertSessionAccess(sessionId: string, userId?: string): Promise<void> {
    if (!userId) {
      return;
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Сессия не найдена');
    }
  }

  private normalizeIdeaTitle(title: string): string {
    return title
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[«»"']/g, '');
  }

  private normalizeIdeaSummary(summary: string): string {
    return summary.trim().replace(/\s+/g, ' ').slice(0, IDEA_SUMMARY_MAX_LENGTH);
  }

  private cleanIdeaTitle(raw: string): string {
    return raw
      .trim()
      .replace(/^[-*•\d.)\s]+/u, '')
      .replace(/[—–-]\s*$/, '')
      .slice(0, IDEA_TITLE_MAX_LENGTH);
  }

  private deduplicateIdeas(
    ideas: ParsedIdeaCandidate[],
    existingTitles: Set<string> = new Set<string>(),
  ): ParsedIdeaCandidate[] {
    const seen = new Set<string>();
    const result: ParsedIdeaCandidate[] = [];

    for (const idea of ideas) {
      const title = this.cleanIdeaTitle(idea.title);
      const summary = this.normalizeIdeaSummary(idea.summary);

      if (title.length < IDEA_TITLE_MIN_LENGTH || summary.length < IDEA_SUMMARY_MIN_LENGTH) {
        continue;
      }

      const normalizedTitle = this.normalizeIdeaTitle(title);
      if (seen.has(normalizedTitle) || existingTitles.has(normalizedTitle)) {
        continue;
      }

      seen.add(normalizedTitle);
      result.push({ title, summary });
    }

    return result;
  }

  private async loadExistingTitleSet(sessionId: string): Promise<Set<string>> {
    const existingIdeas = await this.prisma.idea.findMany({
      where: { sessionId },
      select: { title: true },
    });

    return new Set(existingIdeas.map((idea) => this.normalizeIdeaTitle(idea.title)));
  }

  private extractIdeasFromHeadings(content: string): ParsedIdeaCandidate[] {
    const headingRegex = /^###\s+(.+)$/gm;
    const matches = Array.from(content.matchAll(headingRegex));
    const ideas: ParsedIdeaCandidate[] = [];

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const next = matches[i + 1];
      const start = (current.index ?? 0) + current[0].length;
      const end = next?.index ?? content.length;

      const title = this.cleanIdeaTitle(current[1] ?? '');
      const summary = content
        .slice(start, end)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => !/^ICE:|^RICE:|^Обоснование:/i.test(line))
        .join(' ')
        .trim();

      if (title && summary) {
        ideas.push({ title, summary });
      }
    }

    return ideas;
  }

  private extractIdeasFromList(content: string): ParsedIdeaCandidate[] {
    const lineRegex =
      /^\s*(?:[-*•]|\d+[.)])\s+\*{0,2}([^:\n—–-]{3,200})\*{0,2}(?:\s*[:—–-]\s*(.+))?$/gim;
    const ideas: ParsedIdeaCandidate[] = [];

    for (const match of content.matchAll(lineRegex)) {
      const title = this.cleanIdeaTitle(match[1] ?? '');
      const summary = (match[2] ?? '').trim();

      if (title && summary) {
        ideas.push({ title, summary });
      }
    }

    return ideas;
  }

  private extractIdeasFromJson(content: string): ParsedIdeaCandidate[] {
    const payloads = this.extractJsonPayloads(content);
    if (payloads.length === 0) {
      return [];
    }

    const parsedIdeas: ParsedIdeaCandidate[] = [];

    for (const payload of payloads) {
      for (const candidate of this.resolveIdeaCandidates(payload)) {
        if (!this.isRecord(candidate)) {
          continue;
        }

        const title = this.pickFirstString(candidate, IDEA_TITLE_KEYS);
        const summary =
          this.pickFirstString(candidate, IDEA_SUMMARY_KEYS) ?? this.buildSummary(candidate);

        if (title && summary) {
          parsedIdeas.push({ title, summary });
        }
      }
    }

    return parsedIdeas;
  }

  private extractJsonPayloads(content: string): unknown[] {
    const payloads: unknown[] = [];

    for (const match of content.matchAll(JSON_FENCE_REGEX)) {
      const body = (match[1] ?? '').trim();
      if (!body) continue;
      const parsed = this.tryParseJson(body);
      if (parsed !== null) {
        payloads.push(parsed);
      }
    }

    if (payloads.length > 0) {
      return payloads;
    }

    const trimmed = content.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      const parsed = this.tryParseJson(trimmed);
      if (parsed !== null) {
        payloads.push(parsed);
      }
    }

    return payloads;
  }

  private resolveIdeaCandidates(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (!this.isRecord(payload)) {
      return [];
    }

    for (const key of IDEA_ARRAY_KEYS) {
      const value = payload[key];
      if (Array.isArray(value)) {
        return value;
      }
    }

    return [payload];
  }

  private buildSummary(record: Record<string, unknown>): string | null {
    const parts: string[] = [];

    for (const key of IDEA_SUMMARY_KEYS) {
      const value = record[key];
      if (typeof value !== 'string') {
        continue;
      }

      const trimmed = value.trim();
      if (!trimmed) {
        continue;
      }

      if (!parts.includes(trimmed)) {
        parts.push(trimmed);
      }

      if (parts.length >= 2) {
        break;
      }
    }

    if (parts.length === 0) {
      return null;
    }

    return parts.join(' ');
  }

  private pickFirstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
    for (const key of keys) {
      const value = record[key];
      if (typeof value !== 'string') {
        continue;
      }

      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    return null;
  }

  private tryParseJson(input: string): unknown | null {
    try {
      return JSON.parse(input);
    } catch {
      return null;
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
