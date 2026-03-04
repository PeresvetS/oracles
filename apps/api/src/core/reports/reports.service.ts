import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Report } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AGENT_ROLE, IDEA_STATUS, type AnalystScore, type ReportContent } from '@oracle/shared';
import { PrismaService } from '@prisma/prisma.service';
import {
  CSV_SEPARATOR,
  CSV_UTF8_BOM,
  CSV_IDEA_HEADERS,
  CSV_REJECTED_SECTION_HEADER,
  CSV_REJECTED_HEADERS,
} from '@core/reports/constants/reports.constants';

/**
 * Сервис финальных отчётов сессии.
 *
 * Генерирует структурированный отчёт из FINAL и REJECTED идей.
 * Поддерживает экспорт в CSV (UTF-8 BOM, ;-разделитель) и JSON.
 * Операция create идемпотентна (upsert по sessionId).
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Создать или обновить отчёт сессии (upsert).
   *
   * Агрегирует FINAL/REJECTED идеи, стоимость, число раундов.
   *
   * @param sessionId - ID сессии
   * @returns Созданный/обновлённый отчёт
   * @throws NotFoundException если сессия не найдена
   */
  async create(sessionId: string): Promise<Report> {
    const content = await this.buildReportContent(sessionId);

    const report = await this.prisma.report.upsert({
      where: { sessionId },
      create: {
        sessionId,
        content: content as unknown as Prisma.InputJsonValue,
      },
      update: {
        content: content as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`[${sessionId}] Отчёт сохранён: ${content.finalIdeas.length} финальных идей`);
    return report;
  }

  /**
   * Получить отчёт по ID сессии.
   *
   * @param sessionId - ID сессии
   * @returns Отчёт
   * @throws NotFoundException если отчёт не найден
   */
  async findBySession(sessionId: string, userId?: string): Promise<Report> {
    await this.assertSessionAccess(sessionId, userId);

    const report = await this.prisma.report.findUnique({ where: { sessionId } });
    if (!report) {
      throw new NotFoundException(`Отчёт для сессии ${sessionId} не найден`);
    }
    return report;
  }

  /**
   * Экспорт отчёта в CSV.
   *
   * Формат: UTF-8 BOM + ;-разделитель, совместимо с Excel.
   *
   * @param sessionId - ID сессии
   * @returns Строка CSV
   * @throws NotFoundException если отчёт не найден
   */
  async exportCsv(sessionId: string, userId?: string): Promise<Buffer> {
    const report = await this.findBySession(sessionId, userId);
    const csvContent = this.buildCsvContent(report.content as unknown as ReportContent);
    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * Экспорт отчёта в JSON.
   *
   * @param sessionId - ID сессии
   * @returns Содержимое отчёта
   * @throws NotFoundException если отчёт не найден
   */
  async exportJson(sessionId: string, userId?: string): Promise<ReportContent> {
    const report = await this.findBySession(sessionId, userId);
    return report.content as unknown as ReportContent;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Приватные методы
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Собрать содержимое отчёта из данных сессии.
   */
  private async buildReportContent(sessionId: string): Promise<ReportContent> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        mode: true,
        inputPrompt: true,
        totalCostUsd: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Сессия ${sessionId} не найдена`);
    }

    const [finalIdeas, rejectedIdeas, totalRounds, analysts] = await Promise.all([
      this.prisma.idea.findMany({
        where: { sessionId, status: IDEA_STATUS.FINAL },
        orderBy: [{ avgIce: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.idea.findMany({
        where: { sessionId, status: IDEA_STATUS.REJECTED },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.round.count({
        where: { sessionId, completedAt: { not: null } },
      }),
      this.prisma.agent.findMany({
        where: {
          sessionId,
          role: AGENT_ROLE.ANALYST,
        },
        select: {
          id: true,
          name: true,
          modelId: true,
        },
      }),
    ]);

    const analystMap = new Map(analysts.map((analyst) => [analyst.id, analyst]));

    return {
      finalIdeas: finalIdeas.map((idea) => ({
        title: idea.title,
        summary: idea.summary,
        avgIce: idea.avgIce ?? 0,
        avgRice: idea.avgRice ?? 0,
        details: (idea.details as Record<string, unknown>) ?? {},
        scores: this.enrichScores(idea.scores as Record<string, AnalystScore> | null, analystMap),
      })),
      rejectedIdeas: rejectedIdeas.map((idea) => ({
        title: idea.title,
        summary: idea.summary,
        rejectionReason: idea.rejectionReason ?? '',
        rejectedInRound: idea.rejectedInRound ?? 0,
      })),
      summary: this.buildSummaryText(finalIdeas.length, rejectedIdeas.length, totalRounds),
      totalRounds,
      totalCostUsd: session.totalCostUsd ?? 0,
    };
  }

  /**
   * Сформировать текстовое резюме отчёта.
   */
  private buildSummaryText(finalCount: number, rejectedCount: number, totalRounds: number): string {
    return [
      `Итоги обсуждения:`,
      `• Раундов проведено: ${totalRounds}`,
      `• Финальных идей: ${finalCount}`,
      `• Отклонено идей: ${rejectedCount}`,
    ].join('\n');
  }

  /**
   * Сформировать CSV-строку из содержимого отчёта.
   *
   * Структура: BOM + заголовок + финальные идеи + секция отклонённых.
   */
  private buildCsvContent(content: ReportContent): string {
    const lines: string[] = [];

    // UTF-8 BOM для Excel
    lines.push(CSV_UTF8_BOM + CSV_IDEA_HEADERS.join(CSV_SEPARATOR));

    for (const idea of content.finalIdeas) {
      lines.push(
        [
          this.escapeCsv(idea.title),
          this.escapeCsv(idea.summary),
          String(idea.avgIce ?? 0),
          String(idea.avgRice ?? 0),
          String(Object.keys(idea.scores ?? {}).length),
        ].join(CSV_SEPARATOR),
      );
    }

    // Секция отклонённых идей
    if (content.rejectedIdeas.length > 0) {
      lines.push('');
      lines.push(CSV_REJECTED_SECTION_HEADER);
      lines.push(CSV_REJECTED_HEADERS.join(CSV_SEPARATOR));

      for (const idea of content.rejectedIdeas) {
        lines.push(
          [
            this.escapeCsv(idea.title),
            this.escapeCsv(idea.summary),
            this.escapeCsv(idea.rejectionReason ?? ''),
          ].join(CSV_SEPARATOR),
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * Экранировать значение для CSV.
   *
   * Оборачивает в кавычки если содержит разделитель, перенос строки или кавычку.
   */
  private escapeCsv(value: string): string {
    const str = String(value).replace(/"/g, '""');
    if (str.includes(CSV_SEPARATOR) || str.includes('\n') || str.includes('"')) {
      return `"${str}"`;
    }
    return str;
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

  private enrichScores(
    scores: Record<string, AnalystScore> | null,
    analystMap: Map<string, { id: string; name: string; modelId: string }>,
  ): Record<string, unknown> {
    if (!scores) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(scores).map(([agentId, score]) => {
        const analyst = analystMap.get(agentId);
        return [
          agentId,
          {
            ...score,
            ...(analyst && {
              agentName: analyst.name,
              modelId: analyst.modelId,
            }),
          },
        ];
      }),
    );
  }
}
