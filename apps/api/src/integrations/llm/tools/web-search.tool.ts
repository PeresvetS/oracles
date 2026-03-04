import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '@settings/settings.service';

/** URL Serper API для веб-поиска */
const SERPER_API_URL = 'https://google.serper.dev/search';

/** Максимальное количество результатов поиска */
const MAX_SEARCH_RESULTS = 5;

/** Таймаут запроса к Serper API (мс) */
const SEARCH_TIMEOUT_MS = 10_000;

/** Сообщение при отсутствии API-ключа */
const NO_API_KEY_MESSAGE = 'Web search unavailable: API key not configured';

/** Сообщение при ошибке поиска */
const SEARCH_ERROR_MESSAGE = 'Веб-поиск временно недоступен. Используйте информацию из контекста.';

/** Типизация ответа Serper API */
interface SerperResponse {
  organic?: SerperOrganicResult[];
}

interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
}

/**
 * Тулза для веб-поиска через Serper API (Google Search).
 *
 * Используется агентами (Директор, Аналитики) для актуального поиска
 * информации по рынку, конкурентам, технологиям.
 *
 * Graceful degradation: при отсутствии API-ключа или ошибке API
 * возвращает текстовое сообщение (не бросает исключение).
 */
@Injectable()
export class WebSearchTool {
  private readonly logger = new Logger(WebSearchTool.name);

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Выполнить веб-поиск по запросу.
   *
   * @returns Форматированные результаты или сообщение о недоступности
   */
  async search(query: string): Promise<string> {
    const apiKey = this.settingsService.get('serper_api_key');

    if (!apiKey) {
      this.logger.warn('Serper API-ключ не настроен');
      return NO_API_KEY_MESSAGE;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
      try {
        const response = await fetch(SERPER_API_URL, {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: query,
            num: MAX_SEARCH_RESULTS,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          this.logger.error(`Serper API ошибка: ${response.status} ${response.statusText}`);
          return SEARCH_ERROR_MESSAGE;
        }

        const data = (await response.json()) as unknown;
        return this.formatResults(data as SerperResponse, query);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      this.logger.error(`Ошибка веб-поиска: ${message}`);
      return SEARCH_ERROR_MESSAGE;
    }
  }

  /**
   * Форматировать результаты поиска в читаемый текст.
   */
  private formatResults(data: SerperResponse, query: string): string {
    const results = data.organic;

    if (!results?.length) {
      return `По запросу "${query}" результаты не найдены.`;
    }

    const formatted = results
      .slice(0, MAX_SEARCH_RESULTS)
      .map((result, index) => {
        const title = result.title ?? 'Без заголовка';
        const url = result.link ?? '';
        const snippet = result.snippet ?? '';
        return `${index + 1}. ${title}\n   ${url}\n   ${snippet}`;
      })
      .join('\n\n');

    return `Результаты поиска по запросу "${query}":\n\n${formatted}`;
  }
}
