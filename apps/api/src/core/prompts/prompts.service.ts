import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PromptTemplate, AgentRole, Prisma } from '@prisma/client';
import type { SessionFilters } from '@oracle/shared';
import { PrismaService } from '@prisma/prisma.service';
import { CreatePromptDto } from '@core/prompts/dto/create-prompt.dto';
import { UpdatePromptDto } from '@core/prompts/dto/update-prompt.dto';

/** Фильтры для поиска шаблонов промптов */
export interface PromptFilters {
  role?: AgentRole;
  modelId?: string;
}

/** Контекст сессии для подстановок в промпте */
export interface PromptSessionContext {
  inputPrompt: string;
  existingIdeas: string | null;
  filters: SessionFilters;
}

/**
 * Сервис управления шаблонами промптов.
 *
 * Отвечает за CRUD, поиск дефолтных промптов по приоритету,
 * и подстановку переменных ({{SESSION_FILTERS}}, {{INPUT_PROMPT}}, {{EXISTING_IDEAS}}).
 */
@Injectable()
export class PromptsService {
  private readonly logger = new Logger(PromptsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Список промптов с фильтрацией по роли и/или модели */
  async findAll(filters: PromptFilters): Promise<PromptTemplate[]> {
    const where: Prisma.PromptTemplateWhereInput = {};

    if (filters.role) {
      where.role = filters.role;
    }
    if (filters.modelId !== undefined) {
      where.modelId = filters.modelId;
    }

    return this.prisma.promptTemplate.findMany({
      where,
      orderBy: [{ role: 'asc' }, { isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Найти дефолтный промпт по приоритету:
   * 1. isDefault=true для конкретной role + modelId
   * 2. isDefault=true для role + modelId=null (универсальный fallback)
   */
  async findDefault(role: AgentRole, modelId: string): Promise<PromptTemplate | null> {
    const specific = await this.prisma.promptTemplate.findFirst({
      where: { role, modelId, isDefault: true },
    });

    if (specific) return specific;

    const fallback = await this.prisma.promptTemplate.findFirst({
      where: { role, modelId: null, isDefault: true },
    });

    return fallback;
  }

  /** Создать новый шаблон промпта */
  async create(dto: CreatePromptDto): Promise<PromptTemplate> {
    if (dto.isDefault) {
      await this.resetDefaultFlag(dto.role, dto.modelId ?? null);
    }

    return this.prisma.promptTemplate.create({
      data: {
        role: dto.role,
        modelId: dto.modelId ?? null,
        name: dto.name,
        content: dto.content,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  /** Обновить шаблон промпта */
  async update(id: string, dto: UpdatePromptDto): Promise<PromptTemplate> {
    const existing = await this.findByIdOrThrow(id);

    if (dto.isDefault) {
      await this.resetDefaultFlag(existing.role, existing.modelId);
    }

    return this.prisma.promptTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
  }

  /** Удалить шаблон промпта */
  async delete(id: string): Promise<void> {
    await this.findByIdOrThrow(id);
    await this.prisma.promptTemplate.delete({ where: { id } });
  }

  /**
   * Подстановка переменных в системный промпт.
   * Заменяет {{SESSION_FILTERS}}, {{INPUT_PROMPT}}, {{EXISTING_IDEAS}}.
   */
  processPrompt(systemPrompt: string, context: PromptSessionContext): string {
    return systemPrompt
      .replace('{{SESSION_FILTERS}}', this.buildFiltersBlock(context.filters))
      .replace('{{INPUT_PROMPT}}', context.inputPrompt)
      .replace('{{EXISTING_IDEAS}}', context.existingIdeas ?? 'Нет существующих идей');
  }

  /** Построение человекочитаемого блока фильтров */
  buildFiltersBlock(filters: SessionFilters): string {
    const lines: string[] = ['Фильтры этой сессии:'];

    if (filters.maxComplexity !== undefined) {
      lines.push(`- Максимальная сложность реализации: ${filters.maxComplexity}/10`);
    }
    if (filters.maxBudget !== undefined) {
      lines.push(`- Максимальный бюджет на запуск: $${filters.maxBudget.toLocaleString()}`);
    }
    if (filters.timeToRevenue !== undefined) {
      lines.push(
        `- Целевое время до первых денег: ${this.formatTimeToRevenue(filters.timeToRevenue)}`,
      );
    }
    if (filters.minMarketSize !== undefined) {
      lines.push(`- Минимальный размер рынка: ${filters.minMarketSize}`);
    }
    if (filters.requireCompetitors !== undefined) {
      lines.push(
        `- Конкуренты: ${filters.requireCompetitors ? 'обязательно (нет конкурентов = плохой знак)' : 'не обязательно'}`,
      );
    }
    if (filters.legalRiskTolerance !== undefined) {
      lines.push(
        `- Допустимый юридический риск: ${this.formatRiskTolerance(filters.legalRiskTolerance)}`,
      );
    }
    if (filters.operabilityCheck !== undefined) {
      lines.push(`- Проверка адекватности: ${filters.operabilityCheck ? 'включена' : 'выключена'}`);
    }

    if (lines.length === 1) {
      lines.push('- Без дополнительных ограничений');
    }

    return lines.join('\n');
  }

  private async findByIdOrThrow(id: string): Promise<PromptTemplate> {
    const prompt = await this.prisma.promptTemplate.findUnique({ where: { id } });
    if (!prompt) {
      throw new NotFoundException('Шаблон промпта не найден');
    }
    return prompt;
  }

  /** Сбросить isDefault у всех шаблонов для role + modelId перед установкой нового дефолтного */
  private async resetDefaultFlag(role: AgentRole, modelId: string | null): Promise<void> {
    await this.prisma.promptTemplate.updateMany({
      where: { role, modelId, isDefault: true },
      data: { isDefault: false },
    });
  }

  private formatTimeToRevenue(value: string): string {
    const map: Record<string, string> = {
      '1_month': '1 месяц',
      '3_months': '1-3 месяца',
      '6_months': '3-6 месяцев',
    };
    return map[value] ?? value;
  }

  private formatRiskTolerance(value: string): string {
    const map: Record<string, string> = {
      low: 'низкий',
      medium: 'средний',
      high: 'высокий',
    };
    return map[value] ?? value;
  }
}
