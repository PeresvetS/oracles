import { Injectable, Logger } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
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
import type { ISessionEventEmitter } from '@core/orchestrator/interfaces/session-event-emitter.interface';
import {
  WS_EVENTS,
  WS_NAMESPACE,
  WS_CORS_ORIGIN_FALLBACK,
} from '@transport/gateway/gateway.constants';

/** Payload JWT-токена */
interface JwtPayload {
  sub: string;
  email: string;
}

/** Данные аутентифицированного клиента */
interface AuthenticatedClientData {
  userId: string;
  email: string;
}

/**
 * WebSocket Gateway для real-time стриминга сессий.
 *
 * Реализует ISessionEventEmitter — используется OrchestratorModule
 * вместо LoggerSessionEventEmitter через DI-токен SESSION_EVENT_EMITTER.
 *
 * Namespace: /session
 * Auth: JWT через handshake.auth.token или handshake.query.token
 * Rooms: sessionId — клиент подписывается через session:join
 *
 * События Server → Client:
 * - agent:message:start / agent:message:chunk / agent:message:end — стриминг сообщений
 * - agent:tool:start / agent:tool:result — события тулзов
 * - round:start / round:end — жизненный цикл раундов
 * - session:status — смена статуса сессии
 * - session:error — ошибка сессии
 * - report:ready — отчёт готов
 * - idea:update — обновление идеи
 *
 * События Client → Server:
 * - session:join — подписаться на сессию
 * - session:leave — отписаться от сессии
 */
@WebSocketGateway({
  namespace: WS_NAMESPACE,
  cors: {
    origin: process.env.ADMIN_URL ?? WS_CORS_ORIGIN_FALLBACK,
    credentials: true,
  },
})
@Injectable()
export class SessionGateway
  implements OnGatewayConnection, OnGatewayDisconnect, ISessionEventEmitter
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(SessionGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Обработка нового WebSocket-подключения.
   * Проверяет JWT из handshake.auth.token или handshake.query.token.
   * При невалидном токене — принудительно отключает клиента.
   */
  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth as Record<string, string>)?.token ??
      (client.handshake.query as Record<string, string>)?.token;

    if (!token) {
      this.logger.warn(`WS: подключение без токена, отключаем ${client.id}`);
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      (client.data as AuthenticatedClientData) = {
        userId: payload.sub,
        email: payload.email,
      };
      this.logger.log(`WS: клиент подключён ${client.id} (${payload.email})`);
    } catch {
      this.logger.warn(`WS: невалидный JWT от ${client.id}, отключаем`);
      client.disconnect();
    }
  }

  /**
   * Обработка отключения клиента.
   */
  handleDisconnect(client: Socket): void {
    const data = client.data as Partial<AuthenticatedClientData>;
    this.logger.log(`WS: клиент отключён ${client.id} (${data?.email ?? 'unknown'})`);
  }

  /**
   * Подписать клиента на события сессии.
   * После join клиент начинает получать все события для указанного sessionId.
   */
  @SubscribeMessage(WS_EVENTS.SESSION_JOIN)
  handleJoinSession(client: Socket, payload: { sessionId: string }): void {
    const { sessionId } = payload;
    void client.join(sessionId);
    this.logger.debug(`WS: клиент ${client.id} вошёл в комнату сессии ${sessionId}`);
  }

  /**
   * Отписать клиента от событий сессии.
   */
  @SubscribeMessage(WS_EVENTS.SESSION_LEAVE)
  handleLeaveSession(client: Socket, payload: { sessionId: string }): void {
    const { sessionId } = payload;
    void client.leave(sessionId);
    this.logger.debug(`WS: клиент ${client.id} покинул комнату сессии ${sessionId}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ISessionEventEmitter: стриминг сообщений
  // ──────────────────────────────────────────────────────────────────────────

  /** Уведомить о начале стриминга сообщения агента */
  emitMessageStart(sessionId: string, event: MessageStartEvent): void {
    this.server.to(sessionId).emit(WS_EVENTS.AGENT_MESSAGE_START, {
      sessionId,
      ...event,
    });
  }

  /** Отправить текстовый чанк стриминга */
  emitMessageChunk(sessionId: string, event: MessageChunkEvent): void {
    this.server.to(sessionId).emit(WS_EVENTS.AGENT_MESSAGE_CHUNK, {
      sessionId,
      ...event,
    });
  }

  /** Уведомить о завершении стриминга сообщения */
  emitMessageEnd(sessionId: string, event: MessageEndEvent): void {
    this.server.to(sessionId).emit(WS_EVENTS.AGENT_MESSAGE_END, {
      sessionId,
      ...event,
    });
  }

  /** Отправить чанк thinking/reasoning от модели с extended thinking */
  emitThinkingChunk(sessionId: string, event: ThinkingChunkEvent): void {
    this.server.to(sessionId).emit(WS_EVENTS.AGENT_THINKING_CHUNK, {
      sessionId,
      ...event,
    });
  }

  /**
   * Отправить завершённое сообщение агента.
   * @deprecated Заменено тройкой start/chunk/end. Оставлено для совместимости.
   */
  emitAgentMessage(_sessionId: string, _message: AgentMessageEvent): void {
    // no-op: стриминг заменяет этот метод
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ISessionEventEmitter: события раундов
  // ──────────────────────────────────────────────────────────────────────────

  /** Уведомить о начале раунда */
  emitRoundStarted(sessionId: string, round: RoundStartedEvent): void {
    this.server.to(sessionId).emit(WS_EVENTS.ROUND_START, {
      sessionId,
      roundId: round.roundId,
      roundNumber: round.number,
      roundType: round.type,
    });
  }

  /** Уведомить о завершении раунда */
  emitRoundCompleted(sessionId: string, round: RoundCompletedEvent): void {
    this.server.to(sessionId).emit(WS_EVENTS.ROUND_END, {
      sessionId,
      roundId: round.roundId,
      roundNumber: round.number,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ISessionEventEmitter: статус сессии
  // ──────────────────────────────────────────────────────────────────────────

  /** Уведомить о смене статуса сессии */
  emitSessionStatusChanged(sessionId: string, status: SessionStatusEvent): void {
    this.server.to(sessionId).emit(WS_EVENTS.SESSION_STATUS, {
      sessionId,
      status: status.status,
      currentRound: status.currentRound,
      totalCostUsd: status.totalCostUsd,
    });
  }

  /** Уведомить о завершении сессии */
  emitSessionCompleted(sessionId: string): void {
    this.logger.debug(`[${sessionId}] Session completed event received`);
  }

  /** Уведомить об ошибке сессии */
  emitSessionError(sessionId: string, error: string, agentId?: string): void {
    this.server.to(sessionId).emit(WS_EVENTS.SESSION_ERROR, {
      sessionId,
      error,
      ...(agentId ? { agentId } : {}),
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ISessionEventEmitter: события тулзов
  // ──────────────────────────────────────────────────────────────────────────

  /** Уведомить о начале выполнения тулзы */
  emitToolStart(sessionId: string, event: ToolStartEvent): void {
    this.server.to(sessionId).emit(WS_EVENTS.AGENT_TOOL_START, {
      sessionId,
      messageId: event.messageId,
      agentId: event.agentId,
      tool: event.toolName,
      query: event.query,
    });
  }

  /** Уведомить о результате выполнения тулзы */
  emitToolResult(sessionId: string, event: ToolResultEvent): void {
    this.server.to(sessionId).emit(WS_EVENTS.AGENT_TOOL_RESULT, {
      sessionId,
      messageId: event.messageId,
      agentId: event.agentId,
      tool: event.toolName,
      result: event.result,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Публичные методы для эмита специальных событий
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Уведомить клиентов об обновлении идеи.
   * Вызывается из IdeasService после смены статуса.
   */
  emitIdeaUpdate(sessionId: string, idea: unknown): void {
    this.server.to(sessionId).emit(WS_EVENTS.IDEA_UPDATE, {
      sessionId,
      idea,
    });
  }

  /**
   * Уведомить клиентов о готовности отчёта.
   * Вызывается из ReportsService после создания Report.
   */
  emitReportReady(sessionId: string, reportId: string): void {
    this.server.to(sessionId).emit(WS_EVENTS.REPORT_READY, {
      sessionId,
      reportId,
    });
  }
}
