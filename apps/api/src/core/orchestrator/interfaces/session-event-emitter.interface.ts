import { Logger } from '@nestjs/common';
import type {
  AgentMessageEvent,
  RoundCompletedEvent,
  RoundStartedEvent,
  SessionStatusEvent,
  ToolStartEvent,
  ToolResultEvent,
  MessageStartEvent,
  MessageChunkEvent,
  MessageEndEvent,
  ThinkingChunkEvent,
} from '@core/orchestrator/interfaces/orchestrator.types';

/** Интерфейс эмиттера событий сессии (WebSocket и т.д.) */
export interface ISessionEventEmitter {
  /** Уведомить о начале стриминга сообщения агента */
  emitMessageStart(sessionId: string, event: MessageStartEvent): void;
  /** Отправить текстовый чанк стриминга */
  emitMessageChunk(sessionId: string, event: MessageChunkEvent): void;
  /** Уведомить о завершении стриминга сообщения */
  emitMessageEnd(sessionId: string, event: MessageEndEvent): void;
  /** Отправить чанк thinking/reasoning от модели с extended thinking */
  emitThinkingChunk(sessionId: string, event: ThinkingChunkEvent): void;
  /** Отправить завершённое сообщение агента (legacy, заменено стримингом) */
  emitAgentMessage(sessionId: string, message: AgentMessageEvent): void;
  /** Уведомить о начале раунда */
  emitRoundStarted(sessionId: string, round: RoundStartedEvent): void;
  /** Уведомить о завершении раунда */
  emitRoundCompleted(sessionId: string, round: RoundCompletedEvent): void;
  /** Уведомить о смене статуса сессии */
  emitSessionStatusChanged(sessionId: string, status: SessionStatusEvent): void;
  /** Уведомить о завершении сессии */
  emitSessionCompleted(sessionId: string): void;
  /** Уведомить об ошибке сессии */
  emitSessionError(sessionId: string, error: string, agentId?: string): void;
  /** Уведомить о начале выполнения тулзы агентом */
  emitToolStart(sessionId: string, event: ToolStartEvent): void;
  /** Уведомить о результате выполнения тулзы */
  emitToolResult(sessionId: string, event: ToolResultEvent): void;
  /** Уведомить об обновлении идеи */
  emitIdeaUpdate(sessionId: string, idea: unknown): void;
  /** Уведомить о готовности финального отчёта */
  emitReportReady(sessionId: string, reportId: string): void;
}

/** DI-токен для ISessionEventEmitter */
export const SESSION_EVENT_EMITTER = Symbol('ISessionEventEmitter');

/**
 * Dev-заглушка для ISessionEventEmitter.
 * Логирует все события через NestJS Logger.
 * В production заменена на SessionGateway (WebSocket).
 */
export class LoggerSessionEventEmitter implements ISessionEventEmitter {
  private readonly logger = new Logger(LoggerSessionEventEmitter.name);

  emitMessageStart(sessionId: string, event: MessageStartEvent): void {
    this.logger.debug(
      `[${sessionId}] Стриминг начат: агент ${event.agentName}, messageId=${event.messageId}`,
    );
  }

  emitMessageChunk(sessionId: string, event: MessageChunkEvent): void {
    this.logger.verbose(
      `[${sessionId}] Чанк messageId=${event.messageId}: ${event.chunk.slice(0, 50)}`,
    );
  }

  emitMessageEnd(sessionId: string, event: MessageEndEvent): void {
    this.logger.debug(
      `[${sessionId}] Стриминг завершён: messageId=${event.messageId}, tokens=${event.tokensInput}+${event.tokensOutput}, cost=$${event.costUsd.toFixed(6)}`,
    );
  }

  emitThinkingChunk(sessionId: string, event: ThinkingChunkEvent): void {
    this.logger.verbose(
      `[${sessionId}] Thinking messageId=${event.messageId}: ${event.thinking.slice(0, 50)}`,
    );
  }

  emitAgentMessage(sessionId: string, message: AgentMessageEvent): void {
    this.logger.debug(
      `[${sessionId}] Сообщение от ${message.agentName} (${message.agentRole}): ${message.content.slice(0, 100)}...`,
    );
  }

  emitRoundStarted(sessionId: string, round: RoundStartedEvent): void {
    this.logger.log(`[${sessionId}] Раунд ${round.number} (${round.type}) начат`);
  }

  emitRoundCompleted(sessionId: string, round: RoundCompletedEvent): void {
    this.logger.log(`[${sessionId}] Раунд ${round.number} (${round.roundId}) завершён`);
  }

  emitSessionStatusChanged(sessionId: string, status: SessionStatusEvent): void {
    this.logger.log(
      `[${sessionId}] Статус сессии: ${status.status}, раунд=${status.currentRound}, cost=$${status.totalCostUsd.toFixed(6)}`,
    );
  }

  emitSessionCompleted(sessionId: string): void {
    this.logger.log(`[${sessionId}] Сессия завершена`);
  }

  emitSessionError(sessionId: string, error: string, agentId?: string): void {
    this.logger.error(
      `[${sessionId}] Ошибка сессии: ${error}${agentId ? `, agent=${agentId}` : ''}`,
    );
  }

  emitToolStart(sessionId: string, event: ToolStartEvent): void {
    this.logger.debug(
      `[${sessionId}] Агент ${event.agentId} вызывает ${event.toolName}: ${event.query.slice(0, 100)}`,
    );
  }

  emitToolResult(sessionId: string, event: ToolResultEvent): void {
    this.logger.debug(
      `[${sessionId}] Агент ${event.agentId} получил результат ${event.toolName}: ${event.result.slice(0, 100)}`,
    );
  }

  emitIdeaUpdate(sessionId: string, idea: unknown): void {
    this.logger.debug(`[${sessionId}] Идея обновлена: ${JSON.stringify(idea).slice(0, 100)}`);
  }

  emitReportReady(sessionId: string, reportId: string): void {
    this.logger.log(`[${sessionId}] Отчёт готов: ${reportId}`);
  }
}
