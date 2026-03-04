import { Injectable, Logger } from '@nestjs/common';
import type { AnalystScore, IceScore, RiceScore } from '@oracle/shared';
import { IDEA_LIMITS } from '@core/ideas/constants/ideas.constants';

/**
 * Сервис парсинга ICE/RICE скоринга из текста ответов аналитиков.
 *
 * Ожидаемый формат (SCORING_INSTRUCTION):
 * ### [Название идеи]
 * ICE: Impact=X, Confidence=Y, Ease=Z → Total=T
 * RICE: Reach=X, Impact=Y, Confidence=Z, Effort=W → Total=T
 * Обоснование: ...
 *
 * Если парсинг блока не удаётся — блок пропускается с предупреждением.
 * Total пересчитывается локально — LLM-значению не доверяем.
 */
@Injectable()
export class ScoringParserService {
  private readonly logger = new Logger(ScoringParserService.name);

  /** Regex для нахождения заголовка идеи */
  private readonly TITLE_REGEX = /###\s+(.+)/;

  /** Regex для парсинга ICE-строки */
  private readonly ICE_REGEX =
    /ICE:\s*Impact\s*=\s*(\d+(?:\.\d+)?)\s*,\s*Confidence\s*=\s*(\d+(?:\.\d+)?)\s*,\s*Ease\s*=\s*(\d+(?:\.\d+)?)/i;

  /** Regex для парсинга RICE-строки */
  private readonly RICE_REGEX =
    /RICE:\s*Reach\s*=\s*(\d+(?:\.\d+)?)\s*,\s*Impact\s*=\s*(\d+(?:\.\d+)?)\s*,\s*Confidence\s*=\s*(\d+(?:\.\d+)?)\s*,\s*Effort\s*=\s*(\d+(?:\.\d+)?)/i;

  /**
   * Распарсить ответ аналитика на SCORING_INSTRUCTION.
   *
   * @param content - Полный текст ответа аналитика
   * @returns Map<ideaTitle, AnalystScore>. Пустая Map если парсинг не удался.
   */
  parseAnalystScoring(content: string): Map<string, AnalystScore> {
    const result = new Map<string, AnalystScore>();

    if (!content?.trim()) {
      return result;
    }

    // Разбиваем по ### заголовкам
    const blocks = content.split(/(?=###\s)/);

    for (const block of blocks) {
      const trimmed = block.trim();
      if (!trimmed) continue;

      const titleMatch = this.TITLE_REGEX.exec(trimmed);
      if (!titleMatch) continue;

      const title = titleMatch[1].trim();
      if (!title) continue;

      const ice = this.parseIceScore(trimmed);
      const rice = this.parseRiceScore(trimmed);

      if (!ice || !rice) {
        this.logger.warn(
          `Не удалось распарсить скоры для идеи "${title}": ice=${!!ice}, rice=${!!rice}`,
        );
        continue;
      }

      result.set(title, { ice, rice });
    }

    return result;
  }

  /**
   * Нормализовать название идеи для сопоставления.
   *
   * Приводит к нижнему регистру, убирает кавычки, нормализует пробелы.
   *
   * @param title - Исходное название
   * @returns Нормализованное название
   */
  normalizeIdeaTitle(title: string): string {
    return title
      .trim()
      .toLowerCase()
      .replace(/[«»""'']/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Приватные методы
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Распарсить ICE-скор из блока текста.
   *
   * Total пересчитывается как среднее трёх компонентов.
   *
   * @param block - Текстовый блок с описанием идеи
   * @returns IceScore или null если не удалось распарсить
   */
  private parseIceScore(block: string): IceScore | null {
    const match = this.ICE_REGEX.exec(block);
    if (!match) return null;

    const impact = this.clamp(parseFloat(match[1]), IDEA_LIMITS.ICE_MIN, IDEA_LIMITS.ICE_MAX);
    const confidence = this.clamp(parseFloat(match[2]), IDEA_LIMITS.ICE_MIN, IDEA_LIMITS.ICE_MAX);
    const ease = this.clamp(parseFloat(match[3]), IDEA_LIMITS.ICE_MIN, IDEA_LIMITS.ICE_MAX);
    const total = Math.round(((impact + confidence + ease) / 3) * 100) / 100;

    return { impact, confidence, ease, total };
  }

  /**
   * Распарсить RICE-скор из блока текста.
   *
   * Total пересчитывается как (Reach * Impact * Confidence) / Effort.
   *
   * @param block - Текстовый блок с описанием идеи
   * @returns RiceScore или null если не удалось распарсить
   */
  private parseRiceScore(block: string): RiceScore | null {
    const match = this.RICE_REGEX.exec(block);
    if (!match) return null;

    const reach = this.clamp(
      parseFloat(match[1]),
      IDEA_LIMITS.RICE_COMPONENT_MIN,
      IDEA_LIMITS.RICE_COMPONENT_MAX,
    );
    const impact = this.clamp(
      parseFloat(match[2]),
      IDEA_LIMITS.RICE_COMPONENT_MIN,
      IDEA_LIMITS.RICE_COMPONENT_MAX,
    );
    const confidence = this.clamp(
      parseFloat(match[3]),
      IDEA_LIMITS.RICE_CONFIDENCE_MIN,
      IDEA_LIMITS.RICE_CONFIDENCE_MAX,
    );
    const effort = this.clamp(
      parseFloat(match[4]),
      IDEA_LIMITS.RICE_COMPONENT_MIN,
      IDEA_LIMITS.RICE_COMPONENT_MAX,
    );

    const total = Math.round(((reach * impact * confidence) / effort) * 100) / 100;

    return { reach, impact, confidence, effort, total };
  }

  /**
   * Ограничить числовое значение диапазоном [min, max].
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
