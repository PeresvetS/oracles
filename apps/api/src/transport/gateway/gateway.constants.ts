/**
 * Константы WebSocket-событий для SessionGateway.
 * Соответствуют спецификации specs/03-BACKEND.md.
 */
export const WS_EVENTS = {
  // Server → Client: стриминг сообщений агентов
  /** Начало генерации сообщения агентом */
  AGENT_MESSAGE_START: 'agent:message:start',
  /** Текстовый чанк стриминга */
  AGENT_MESSAGE_CHUNK: 'agent:message:chunk',
  /** Завершение стриминга с метриками */
  AGENT_MESSAGE_END: 'agent:message:end',
  /** Чанк thinking/reasoning (только для моделей с extended thinking) */
  AGENT_THINKING_CHUNK: 'agent:thinking:chunk',

  // Server → Client: события тулзов
  /** Агент начинает вызов инструмента */
  AGENT_TOOL_START: 'agent:tool:start',
  /** Результат вызова инструмента */
  AGENT_TOOL_RESULT: 'agent:tool:result',

  // Server → Client: управление раундами
  /** Раунд начат */
  ROUND_START: 'round:start',
  /** Раунд завершён */
  ROUND_END: 'round:end',

  // Server → Client: статус сессии
  /** Изменение статуса сессии */
  SESSION_STATUS: 'session:status',
  /** Обновление идеи */
  IDEA_UPDATE: 'idea:update',
  /** Отчёт готов */
  REPORT_READY: 'report:ready',
  /** Ошибка сессии */
  SESSION_ERROR: 'session:error',

  // Client → Server: управление подпиской
  /** Подключиться к комнате сессии */
  SESSION_JOIN: 'session:join',
  /** Отключиться от комнаты сессии */
  SESSION_LEAVE: 'session:leave',
} as const;

/** Namespace WebSocket-gateway */
export const WS_NAMESPACE = '/session';

/** CORS origin по умолчанию (fallback для локальной разработки) */
export const WS_CORS_ORIGIN_FALLBACK = 'http://localhost:3000';
