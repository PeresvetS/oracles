import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { SessionGateway } from '@transport/gateway/session.gateway';
import { WS_EVENTS } from '@transport/gateway/gateway.constants';
import type { Socket as SocketType } from 'socket.io';

/** Мок Socket.io клиента для тестов */
interface MockClient {
  id: string;
  handshake: {
    auth: Record<string, string>;
    query: Record<string, string>;
    headers: Record<string, string>;
  };
  data: Record<string, unknown>;
  join: jest.Mock;
  leave: jest.Mock;
  disconnect: jest.Mock;
}

/** Создаёт мок Socket.io клиента */
function createMockClient(token: string): MockClient {
  return {
    id: 'socket-test-id',
    handshake: {
      auth: token ? { token } : {},
      query: {},
      headers: {},
    },
    data: {},
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  };
}

describe('SessionGateway', () => {
  let gateway: SessionGateway;
  let jwtService: { verifyAsync: jest.Mock };
  let mockRoom: { emit: jest.Mock };
  let mockServer: { to: jest.Mock };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    mockRoom = { emit: jest.fn() };
    mockServer = { to: jest.fn().mockReturnValue(mockRoom) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SessionGateway, { provide: JwtService, useValue: jwtService }],
    }).compile();

    gateway = module.get<SessionGateway>(SessionGateway);

    // Подменяем WebSocket сервер моком
    Object.defineProperty(gateway, 'server', {
      value: mockServer,
      writable: true,
    });
  });

  it('должен быть определён', () => {
    expect(gateway).toBeDefined();
  });

  // ────────────────────────────────────────────────────────
  // handleConnection
  // ────────────────────────────────────────────────────────

  describe('handleConnection', () => {
    it('должен принять соединение при валидном JWT', async () => {
      const mockClient = createMockClient('valid-token');
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-1', email: 'user@example.com' });

      await gateway.handleConnection(mockClient as unknown as SocketType);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token');
      expect(mockClient.disconnect).not.toHaveBeenCalled();
      expect(mockClient.data['userId']).toBe('user-1');
      expect(mockClient.data['email']).toBe('user@example.com');
    });

    it('должен отклонить соединение при невалидном JWT', async () => {
      const mockClient = createMockClient('invalid-token');
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await gateway.handleConnection(mockClient as unknown as SocketType);

      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('должен отклонить соединение без токена', async () => {
      const mockClient = createMockClient('');

      await gateway.handleConnection(mockClient as unknown as SocketType);

      // При пустом токене отключаем немедленно, без вызова verifyAsync
      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('должен принять токен из query параметров', async () => {
      const mockClient = createMockClient('');
      mockClient.handshake.query = { token: 'query-token' };
      jwtService.verifyAsync.mockResolvedValue({ sub: 'user-2', email: 'user2@example.com' });

      await gateway.handleConnection(mockClient as unknown as SocketType);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('query-token');
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────
  // handleDisconnect
  // ────────────────────────────────────────────────────────

  describe('handleDisconnect', () => {
    it('должен обработать отключение без ошибок', () => {
      const mockClient = createMockClient('token');
      mockClient.data = { email: 'user@example.com' };

      expect(() => gateway.handleDisconnect(mockClient as unknown as SocketType)).not.toThrow();
    });
  });

  // ────────────────────────────────────────────────────────
  // session:join / session:leave
  // ────────────────────────────────────────────────────────

  describe('handleJoinSession', () => {
    it('должен добавить клиента в комнату сессии', () => {
      const mockClient = createMockClient('token');

      gateway.handleJoinSession(mockClient as unknown as SocketType, { sessionId: 'session-1' });

      expect(mockClient.join).toHaveBeenCalledWith('session-1');
    });
  });

  describe('handleLeaveSession', () => {
    it('должен удалить клиента из комнаты сессии', () => {
      const mockClient = createMockClient('token');

      gateway.handleLeaveSession(mockClient as unknown as SocketType, { sessionId: 'session-1' });

      expect(mockClient.leave).toHaveBeenCalledWith('session-1');
    });
  });

  // ────────────────────────────────────────────────────────
  // ISessionEventEmitter: emit методы
  // ────────────────────────────────────────────────────────

  describe('emitMessageStart', () => {
    it('должен эмитить agent:message:start в правильную комнату', () => {
      gateway.emitMessageStart('session-1', {
        messageId: 'msg-1',
        agentId: 'agent-1',
        agentName: 'Аналитик',
        agentRole: 'ANALYST',
        roundId: 'round-1',
      });

      expect(mockServer.to).toHaveBeenCalledWith('session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.AGENT_MESSAGE_START,
        expect.objectContaining({
          sessionId: 'session-1',
          messageId: 'msg-1',
          agentId: 'agent-1',
        }),
      );
    });
  });

  describe('emitMessageChunk', () => {
    it('должен эмитить agent:message:chunk с текстом чанка', () => {
      gateway.emitMessageChunk('session-1', { messageId: 'msg-1', chunk: 'Привет мир' });

      expect(mockServer.to).toHaveBeenCalledWith('session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.AGENT_MESSAGE_CHUNK,
        expect.objectContaining({
          sessionId: 'session-1',
          messageId: 'msg-1',
          chunk: 'Привет мир',
        }),
      );
    });
  });

  describe('emitMessageEnd', () => {
    it('должен эмитить agent:message:end с метриками', () => {
      gateway.emitMessageEnd('session-1', {
        messageId: 'msg-1',
        tokensInput: 100,
        tokensOutput: 50,
        costUsd: 0.01,
        latencyMs: 1200,
      });

      expect(mockServer.to).toHaveBeenCalledWith('session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.AGENT_MESSAGE_END,
        expect.objectContaining({
          sessionId: 'session-1',
          messageId: 'msg-1',
          tokensInput: 100,
          tokensOutput: 50,
          costUsd: 0.01,
        }),
      );
    });
  });

  describe('emitThinkingChunk', () => {
    it('должен эмитить agent:thinking:chunk с данными reasoning', () => {
      gateway.emitThinkingChunk('session-1', {
        messageId: 'msg-1',
        thinking: 'Анализирую задачу...',
      });

      expect(mockServer.to).toHaveBeenCalledWith('session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.AGENT_THINKING_CHUNK,
        expect.objectContaining({
          sessionId: 'session-1',
          messageId: 'msg-1',
          thinking: 'Анализирую задачу...',
        }),
      );
    });
  });

  describe('emitRoundStarted', () => {
    it('должен эмитить round:start с данными раунда', () => {
      gateway.emitRoundStarted('session-1', {
        roundId: 'round-1',
        number: 2,
        type: 'DISCUSSION',
      });

      expect(mockServer.to).toHaveBeenCalledWith('session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.ROUND_START,
        expect.objectContaining({
          sessionId: 'session-1',
          roundId: 'round-1',
          roundNumber: 2,
          roundType: 'DISCUSSION',
        }),
      );
    });
  });

  describe('emitRoundCompleted', () => {
    it('должен эмитить round:end с roundId', () => {
      gateway.emitRoundCompleted('session-1', {
        roundId: 'round-1',
        number: 2,
      });

      expect(mockServer.to).toHaveBeenCalledWith('session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.ROUND_END,
        expect.objectContaining({
          sessionId: 'session-1',
          roundId: 'round-1',
          roundNumber: 2,
        }),
      );
    });
  });

  describe('emitSessionStatusChanged', () => {
    it('должен эмитить session:status с новым статусом', () => {
      gateway.emitSessionStatusChanged('session-1', {
        status: 'PAUSED',
        currentRound: 3,
        totalCostUsd: 1.23,
      });

      expect(mockServer.to).toHaveBeenCalledWith('session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.SESSION_STATUS,
        expect.objectContaining({
          sessionId: 'session-1',
          status: 'PAUSED',
          currentRound: 3,
          totalCostUsd: 1.23,
        }),
      );
    });
  });

  describe('emitSessionCompleted', () => {
    it('не должен эмитить отдельное WS-событие (используется session:status)', () => {
      gateway.emitSessionCompleted('session-1');

      expect(mockServer.to).not.toHaveBeenCalled();
      expect(mockRoom.emit).not.toHaveBeenCalled();
    });
  });

  describe('emitSessionError', () => {
    it('должен эмитить session:error с текстом ошибки', () => {
      gateway.emitSessionError('session-1', 'Произошла критическая ошибка');

      expect(mockServer.to).toHaveBeenCalledWith('session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.SESSION_ERROR,
        expect.objectContaining({
          sessionId: 'session-1',
          error: 'Произошла критическая ошибка',
        }),
      );
    });

    it('должен эмитить session:error с agentId при наличии', () => {
      gateway.emitSessionError('session-1', 'Ошибка агента', 'agent-42');

      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.SESSION_ERROR,
        expect.objectContaining({
          sessionId: 'session-1',
          error: 'Ошибка агента',
          agentId: 'agent-42',
        }),
      );
    });
  });

  describe('emitToolStart', () => {
    it('должен эмитить agent:tool:start с данными инструмента', () => {
      gateway.emitToolStart('session-1', {
        messageId: 'msg-1',
        agentId: 'agent-1',
        toolName: 'web_search',
        query: 'SaaS рынок',
      });

      expect(mockServer.to).toHaveBeenCalledWith('session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.AGENT_TOOL_START,
        expect.objectContaining({
          sessionId: 'session-1',
          messageId: 'msg-1',
          agentId: 'agent-1',
          tool: 'web_search',
          query: 'SaaS рынок',
        }),
      );
    });
  });

  describe('emitToolResult', () => {
    it('должен эмитить agent:tool:result с превью результата', () => {
      gateway.emitToolResult('session-1', {
        messageId: 'msg-1',
        agentId: 'agent-1',
        toolName: 'web_search',
        result: 'Найдено 5 конкурентов...',
      });

      expect(mockServer.to).toHaveBeenCalledWith('session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.AGENT_TOOL_RESULT,
        expect.objectContaining({
          sessionId: 'session-1',
          messageId: 'msg-1',
          agentId: 'agent-1',
          tool: 'web_search',
          result: 'Найдено 5 конкурентов...',
        }),
      );
    });
  });

  describe('emitIdeaUpdate', () => {
    it('должен эмитить idea:update с данными идеи', () => {
      const idea = { id: 'idea-1', title: 'Новая идея', status: 'ACTIVE' };
      gateway.emitIdeaUpdate('session-1', idea);

      expect(mockServer.to).toHaveBeenCalledWith('session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.IDEA_UPDATE,
        expect.objectContaining({
          sessionId: 'session-1',
          idea,
        }),
      );
    });
  });

  describe('emitReportReady', () => {
    it('должен эмитить report:ready с reportId', () => {
      gateway.emitReportReady('session-1', 'report-abc-123');

      expect(mockServer.to).toHaveBeenCalledWith('session-1');
      expect(mockRoom.emit).toHaveBeenCalledWith(
        WS_EVENTS.REPORT_READY,
        expect.objectContaining({
          sessionId: 'session-1',
          reportId: 'report-abc-123',
        }),
      );
    });
  });

  describe('emitAgentMessage (legacy no-op)', () => {
    it('не должен бросать ошибку (backward-compatible no-op)', () => {
      expect(() =>
        gateway.emitAgentMessage('session-1', {
          messageId: 'msg-1',
          agentId: 'agent-1',
          agentName: 'Аналитик',
          agentRole: 'ANALYST',
          roundId: 'round-1',
          content: 'test',
          tokensInput: 10,
          tokensOutput: 5,
          costUsd: 0.001,
        }),
      ).not.toThrow();
      // Сервер не должен ничего эмитить (no-op)
      expect(mockRoom.emit).not.toHaveBeenCalled();
    });
  });
});
