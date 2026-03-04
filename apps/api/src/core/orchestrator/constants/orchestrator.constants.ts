import { AGENT_DEFAULTS } from '@oracle/shared';
import type { ToolDefinition } from '@oracle/shared';

/** Сигналы финализации от Директора — если ответ содержит одну из фраз, обсуждение завершается */
export const FINALIZATION_SIGNALS = [
  'ФИНАЛИЗИРУЮ',
  'ФИНАЛЬНЫЙ ОТЧЁТ',
  'ПЕРЕХОДИМ К СКОРИНГУ',
  'ЗАВЕРШАЮ ОБСУЖДЕНИЕ',
  'ФОРМИРУЮ ИТОГОВЫЙ ОТЧЁТ',
] as const;

/** Системный промпт для суммаризации предыдущих раундов */
export const SUMMARIZATION_SYSTEM_PROMPT = [
  'Ты — ассистент для суммаризации дискуссий.',
  `Сожми всю дискуссию в краткое саммари (максимум ${AGENT_DEFAULTS.SUMMARY_MAX_WORDS} слов).`,
  'Сохрани ключевые идеи, аргументы за/против, решения.',
  'Формат: структурированный текст с пунктами.',
].join(' ');

/**
 * Имена тулзов.
 * WEB_SEARCH используется только для идентификации записей в БД/WS (annotations от OpenRouter plugin).
 */
export const TOOL_NAMES = {
  WEB_SEARCH: 'web_search',
  CALL_RESEARCHER: 'call_researcher',
} as const;

/** Определение тулзы вызова ресерчера для передачи в LLM (только Директор) */
export const CALL_RESEARCHER_TOOL_DEFINITION: ToolDefinition = {
  type: 'function',
  function: {
    name: TOOL_NAMES.CALL_RESEARCHER,
    description:
      'Вызвать ресерчера (Perplexity) для глубокого анализа рынка, конкурентов, данных. Дороже обычного поиска — используй только для ключевых вопросов. Лимит на сессию.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Вопрос для глубокого исследования',
        },
      },
      required: ['query'],
    },
  },
};

/** Сообщение об ошибке таймаута ответа агента */
export const AGENT_TIMEOUT_ERROR = 'Превышен таймаут ожидания ответа от LLM';

/** Сообщение при исчерпании лимита вызовов ресерчера */
export const RESEARCH_LIMIT_REACHED_MESSAGE =
  'Лимит вызовов ресерчера для данной сессии исчерпан. Используй имеющиеся данные.';

/** Инструкция для скоринга идей аналитиками */
export const SCORING_INSTRUCTION = [
  'Оцени КАЖДУЮ активную идею по двум методологиям:',
  '1. ICE (Impact 1-10, Confidence 1-10, Ease 1-10) — итого = среднее трёх.',
  '2. RICE (Reach 1-10, Impact 1-10, Confidence 0.0-1.0, Effort 1-10) — итого = (Reach * Impact * Confidence) / Effort.',
  '',
  'Формат ответа для КАЖДОЙ идеи:',
  '### [Название идеи]',
  'ICE: Impact=X, Confidence=Y, Ease=Z → Total=T',
  'RICE: Reach=X, Impact=Y, Confidence=Z, Effort=W → Total=T',
  'Обоснование: ...',
].join('\n');

/** Максимальная длина резюме одной идеи в списке активных идей */
export const IDEA_SUMMARY_MAX_LENGTH = 200;

/** Инструкция для финального раунда Директора */
export const FINAL_INSTRUCTION = [
  'Подведи итоги обсуждения:',
  '1. Выбери ТОП идеи на основе ICE/RICE скоринга.',
  '2. Для каждой ТОП идеи: краткое описание, почему выбрана, ключевые метрики.',
  '3. Перечисли отклонённые идеи с причинами отклонения.',
  '4. Общее резюме: сильные стороны, риски, рекомендации.',
  '5. Для каждой финальной идеи укажи Next Steps.',
].join('\n');
