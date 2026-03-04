import { Test, TestingModule } from '@nestjs/testing';
import { OrchestratorService } from '@core/orchestrator/orchestrator.service';
import { PrismaService } from '@prisma/prisma.service';
import { AgentRunnerService } from '@core/orchestrator/agent-runner.service';
import { RoundManagerService } from '@core/orchestrator/round-manager.service';
import { ScoringParserService } from '@core/orchestrator/scoring-parser.service';
import { IdeasService } from '@core/ideas/ideas.service';
import { ReportsService } from '@core/reports/reports.service';
import { SESSION_EVENT_EMITTER } from '@core/orchestrator/interfaces/session-event-emitter.interface';
import { SESSION_STATUS, AGENT_ROLE } from '@oracle/shared';
import type { SessionWithAgents } from '@core/orchestrator/interfaces/orchestrator.types';

describe('OrchestratorService', () => {
  let service: OrchestratorService;
  let prismaService: {
    session: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    round: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    message: {
      create: jest.Mock;
    };
  };
  let agentRunner: {
    runAgent: jest.Mock;
    buildToolDefinitions: jest.Mock;
  };
  let roundManager: {
    createRound: jest.Mock;
    completeRound: jest.Mock;
    buildAgentContext: jest.Mock;
    clearSummaryCache: jest.Mock;
  };
  let eventEmitter: {
    emitMessageStart: jest.Mock;
    emitMessageChunk: jest.Mock;
    emitMessageEnd: jest.Mock;
    emitRoundStarted: jest.Mock;
    emitRoundCompleted: jest.Mock;
    emitSessionStatusChanged: jest.Mock;
    emitSessionCompleted: jest.Mock;
    emitSessionError: jest.Mock;
    emitToolStart: jest.Mock;
    emitToolResult: jest.Mock;
    emitIdeaUpdate: jest.Mock;
    emitReportReady: jest.Mock;
  };
  let ideasService: {
    parseIdeasFromText: jest.Mock;
    createFromAgentResponse: jest.Mock;
    findActiveForScoring: jest.Mock;
    addScore: jest.Mock;
    finalizeTopIdeas: jest.Mock;
  };
  let reportsService: {
    create: jest.Mock;
  };
  let scoringParser: {
    parseAnalystScoring: jest.Mock;
    normalizeIdeaTitle: jest.Mock;
  };

  const mockDirector = {
    id: 'director-1',
    sessionId: 'session-1',
    role: AGENT_ROLE.DIRECTOR,
    name: 'Директор',
    provider: 'openrouter',
    modelId: 'anthropic/claude-sonnet-4-6',
    systemPrompt: 'Ты директор',
    webSearchEnabled: true,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    totalCostUsd: 0,
    createdAt: new Date(),
  };

  const mockAnalyst1 = {
    id: 'analyst-1',
    sessionId: 'session-1',
    role: AGENT_ROLE.ANALYST,
    name: 'Аналитик 1',
    provider: 'openrouter',
    modelId: 'openai/gpt-5.3-chat',
    systemPrompt: 'Ты аналитик 1',
    webSearchEnabled: true,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    totalCostUsd: 0,
    createdAt: new Date(),
  };

  const mockAnalyst2 = {
    id: 'analyst-2',
    sessionId: 'session-1',
    role: AGENT_ROLE.ANALYST,
    name: 'Аналитик 2',
    provider: 'openrouter',
    modelId: 'google/gemini-3.1-pro',
    systemPrompt: 'Ты аналитик 2',
    webSearchEnabled: true,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    totalCostUsd: 0,
    createdAt: new Date(),
  };

  const mockResearcher = {
    id: 'researcher-1',
    sessionId: 'session-1',
    role: AGENT_ROLE.RESEARCHER,
    name: 'Ресерчер',
    provider: 'perplexity',
    modelId: 'sonar-pro',
    systemPrompt: 'Ты ресерчер',
    webSearchEnabled: false,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    totalCostUsd: 0,
    createdAt: new Date(),
  };

  const createMockSession = (overrides?: Partial<SessionWithAgents>): SessionWithAgents =>
    ({
      id: 'session-1',
      userId: 'user-1',
      title: 'Тестовая сессия',
      mode: 'GENERATE',
      status: SESSION_STATUS.RUNNING,
      inputPrompt: 'Генерация идей для SaaS',
      existingIdeas: null,
      filters: {},
      maxRounds: 3,
      currentRound: 0,
      maxResearchCalls: 5,
      researchCallsUsed: 0,
      totalTokensInput: 0,
      totalTokensOutput: 0,
      totalCostUsd: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      startedAt: null,
      agents: [mockDirector, mockAnalyst1, mockAnalyst2, mockResearcher],
      ...overrides,
    }) as SessionWithAgents;

  const mockAgentResult = {
    content: 'Ответ агента',
    tokensInput: 100,
    tokensOutput: 50,
    costUsd: 0.01,
    latencyMs: 1000,
    toolCalls: [],
    messageId: 'msg-1',
  };

  let roundCounter: number;

  beforeEach(async () => {
    roundCounter = 0;

    prismaService = {
      session: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      round: {
        findFirst: jest.fn().mockResolvedValue({ id: 'round-1', number: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      message: {
        create: jest.fn().mockResolvedValue({ id: 'msg-user-1' }),
      },
    };

    agentRunner = {
      runAgent: jest.fn().mockResolvedValue(mockAgentResult),
      buildToolDefinitions: jest.fn().mockReturnValue([]),
    };

    roundManager = {
      createRound: jest.fn().mockImplementation(() => {
        roundCounter++;
        return Promise.resolve({
          id: `round-${roundCounter}`,
          number: roundCounter,
          type: 'INITIAL',
          status: 'IN_PROGRESS',
        });
      }),
      completeRound: jest.fn().mockResolvedValue({}),
      buildAgentContext: jest.fn().mockResolvedValue([{ role: 'system', content: 'Контекст' }]),
      clearSummaryCache: jest.fn(),
    };

    eventEmitter = {
      emitMessageStart: jest.fn(),
      emitMessageChunk: jest.fn(),
      emitMessageEnd: jest.fn(),
      emitRoundStarted: jest.fn(),
      emitRoundCompleted: jest.fn(),
      emitSessionStatusChanged: jest.fn(),
      emitSessionCompleted: jest.fn(),
      emitSessionError: jest.fn(),
      emitToolStart: jest.fn(),
      emitToolResult: jest.fn(),
      emitIdeaUpdate: jest.fn(),
      emitReportReady: jest.fn(),
    };

    ideasService = {
      parseIdeasFromText: jest.fn().mockReturnValue([]),
      createFromAgentResponse: jest.fn().mockResolvedValue([]),
      findActiveForScoring: jest.fn().mockResolvedValue([]),
      addScore: jest.fn().mockResolvedValue({}),
      finalizeTopIdeas: jest.fn().mockResolvedValue({ finalized: [], rejected: [] }),
    };

    reportsService = {
      create: jest.fn().mockResolvedValue({ id: 'report-1', sessionId: 'session-1' }),
    };

    scoringParser = {
      parseAnalystScoring: jest.fn().mockReturnValue(new Map()),
      normalizeIdeaTitle: jest.fn().mockImplementation((t: string) => t.toLowerCase().trim()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrchestratorService,
        { provide: PrismaService, useValue: prismaService },
        { provide: AgentRunnerService, useValue: agentRunner },
        { provide: RoundManagerService, useValue: roundManager },
        { provide: IdeasService, useValue: ideasService },
        { provide: ReportsService, useValue: reportsService },
        { provide: ScoringParserService, useValue: scoringParser },
        { provide: SESSION_EVENT_EMITTER, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<OrchestratorService>(OrchestratorService);
  });

  it('должен быть определён', () => {
    expect(service).toBeDefined();
  });

  describe('startSession', () => {
    it('должен пройти полный цикл: INITIAL → DISCUSSION → SCORING → FINAL → COMPLETED', async () => {
      const session = createMockSession({ maxRounds: 2 });
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.startSession('session-1');

      // INITIAL + 1 DISCUSSION + SCORING + FINAL = 4 раунда
      expect(roundManager.createRound).toHaveBeenCalledTimes(4);
      expect(roundManager.completeRound).toHaveBeenCalledTimes(4);
      expect(agentRunner.runAgent).toHaveBeenCalledTimes(10);
      expect(roundManager.clearSummaryCache).toHaveBeenCalledWith('session-1');
      expect(eventEmitter.emitSessionCompleted).toHaveBeenCalledWith('session-1');
      expect(prismaService.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SESSION_STATUS.COMPLETED,
          }),
        }),
      );
    });

    it('должен бросить ошибку при невалидном статусе', async () => {
      const session = createMockSession({ status: SESSION_STATUS.CONFIGURING as 'CONFIGURING' });
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.startSession('session-1');

      expect(eventEmitter.emitSessionError).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('CONFIGURING'),
      );
    });

    it('должен бросить ошибку без Директора', async () => {
      const session = createMockSession({
        agents: [mockAnalyst1, mockAnalyst2, mockResearcher],
      });
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.startSession('session-1');

      expect(eventEmitter.emitSessionError).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('Директор'),
      );
    });

    it('должен финализироваться по ключевым словам директора', async () => {
      const session = createMockSession({ maxRounds: 10 });
      prismaService.session.findUnique.mockResolvedValue(session);

      // Директор в DISCUSSION отвечает с сигналом финализации
      agentRunner.runAgent.mockImplementation(({ agent }: { agent: { role: string } }) => {
        if (agent.role === AGENT_ROLE.DIRECTOR) {
          return Promise.resolve({
            ...mockAgentResult,
            content: 'Анализ завершён. ПЕРЕХОДИМ К СКОРИНГУ идей.',
          });
        }
        return Promise.resolve(mockAgentResult);
      });

      await service.startSession('session-1');

      // INITIAL(1) + DISCUSSION с финализацией(1) + SCORING(1) + FINAL(1) = 4
      expect(roundManager.createRound).toHaveBeenCalledTimes(4);
      expect(eventEmitter.emitSessionCompleted).toHaveBeenCalled();
    });

    it('должен прерваться при лимите maxRounds', async () => {
      const session = createMockSession({ maxRounds: 2 });
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.startSession('session-1');

      // INITIAL(1) + 1 DISCUSSION + SCORING(1) + FINAL(1) = 4
      expect(roundManager.createRound).toHaveBeenCalledTimes(4);
    });

    it('должен обработать ошибку одного аналитика через Promise.allSettled', async () => {
      const session = createMockSession();
      prismaService.session.findUnique.mockResolvedValue(session);

      let callCount = 0;
      agentRunner.runAgent.mockImplementation(() => {
        callCount++;
        // 3-й вызов (второй аналитик в INITIAL) — ошибка
        if (callCount === 3) {
          return Promise.reject(new Error('LLM timeout'));
        }
        return Promise.resolve(mockAgentResult);
      });

      await service.startSession('session-1');

      // Сессия должна завершиться несмотря на ошибку одного аналитика
      expect(eventEmitter.emitSessionCompleted).toHaveBeenCalled();
    });

    it('должен парсить и сохранять идеи из ответов аналитиков', async () => {
      const session = createMockSession({ maxRounds: 1 });
      prismaService.session.findUnique.mockResolvedValue(session);
      ideasService.parseIdeasFromText.mockReturnValue([
        { title: 'Идея A', summary: 'Краткое описание идеи A' },
      ]);

      await service.startSession('session-1');

      expect(ideasService.parseIdeasFromText).toHaveBeenCalled();
      expect(ideasService.createFromAgentResponse).toHaveBeenCalledWith(
        'session-1',
        expect.any(String),
        1,
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Идея A',
          }),
        ]),
      );
    });

    it('должен вызвать Директора повторно в рамках INITIAL раунда', async () => {
      const session = createMockSession({ maxRounds: 1 });
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.startSession('session-1');

      expect(agentRunner.runAgent).toHaveBeenNthCalledWith(
        4,
        expect.objectContaining({
          agent: mockDirector,
          roundId: 'round-1',
        }),
      );
    });

    it('должен установить status=ERROR при критической ошибке', async () => {
      prismaService.session.findUnique.mockRejectedValue(new Error('DB connection lost'));

      await service.startSession('session-1');

      expect(eventEmitter.emitSessionError).toHaveBeenCalledWith(
        'session-1',
        expect.stringContaining('DB connection lost'),
      );
      expect(prismaService.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: SESSION_STATUS.ERROR },
        }),
      );
      expect(roundManager.clearSummaryCache).toHaveBeenCalledWith('session-1');
    });

    it('должен пометить раунд как RESEARCH при вызове call_researcher у Директора', async () => {
      const session = createMockSession({ maxRounds: 2 });
      prismaService.session.findUnique.mockResolvedValue(session);

      let directorDiscussionCall = 0;
      agentRunner.runAgent.mockImplementation(({ agent }: { agent: { role: string } }) => {
        if (agent.role === AGENT_ROLE.DIRECTOR) {
          directorDiscussionCall += 1;
          if (directorDiscussionCall === 3) {
            return Promise.resolve({
              ...mockAgentResult,
              content: 'Нужен ресерч',
              toolCalls: [{ tool: 'call_researcher', query: 'рынок', result: 'данные' }],
            });
          }
        }

        return Promise.resolve(mockAgentResult);
      });

      await service.startSession('session-1');

      expect(prismaService.round.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { type: 'RESEARCH' },
        }),
      );
      expect(agentRunner.runAgent).toHaveBeenCalledTimes(8);
    });

    it('должен прервать discussion loop при PAUSED', async () => {
      const session = createMockSession({ maxRounds: 10 });
      prismaService.session.findUnique
        .mockResolvedValueOnce(session) // loadSession
        .mockResolvedValueOnce({ status: SESSION_STATUS.PAUSED }); // reloadSession в INITIAL

      await service.startSession('session-1');

      expect(roundManager.createRound).toHaveBeenCalledTimes(1);
      expect(roundManager.completeRound).toHaveBeenCalledTimes(0);
      expect(eventEmitter.emitSessionCompleted).not.toHaveBeenCalled();
      expect(prismaService.session.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SESSION_STATUS.COMPLETED }),
        }),
      );
    });

    it('должен передавать tools и session в runAgent', async () => {
      const session = createMockSession({ maxRounds: 1 });
      prismaService.session.findUnique.mockResolvedValue(session);
      agentRunner.buildToolDefinitions.mockReturnValue([
        { type: 'function', function: { name: 'web_search', description: '', parameters: {} } },
      ]);

      await service.startSession('session-1');

      // Проверить что runAgent вызывается с session
      expect(agentRunner.runAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          session: expect.objectContaining({ id: 'session-1' }),
        }),
      );
    });

    it('должен вызвать finalizeTopIdeas после FINAL раунда', async () => {
      const session = createMockSession({ maxRounds: 1 });
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.startSession('session-1');

      expect(ideasService.finalizeTopIdeas).toHaveBeenCalledWith('session-1', expect.any(Number));
    });

    it('должен создать отчёт после FINAL раунда', async () => {
      const session = createMockSession({ maxRounds: 1 });
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.startSession('session-1');

      expect(reportsService.create).toHaveBeenCalledWith('session-1');
    });

    it('должен эмитить emitReportReady после создания отчёта', async () => {
      const session = createMockSession({ maxRounds: 1 });
      prismaService.session.findUnique.mockResolvedValue(session);
      reportsService.create.mockResolvedValueOnce({ id: 'report-42', sessionId: 'session-1' });

      await service.startSession('session-1');

      expect(eventEmitter.emitReportReady).toHaveBeenCalledWith('session-1', 'report-42');
    });

    it('должен вызвать findActiveForScoring в SCORING раунде', async () => {
      const session = createMockSession({ maxRounds: 1 });
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.startSession('session-1');

      expect(ideasService.findActiveForScoring).toHaveBeenCalledWith('session-1');
    });
  });

  describe('pauseSession', () => {
    it('должен эмитить событие PAUSED', async () => {
      prismaService.session.findUnique.mockResolvedValue({
        currentRound: 2,
        totalCostUsd: 0.5,
      });

      await service.pauseSession('session-1');

      expect(eventEmitter.emitSessionStatusChanged).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          status: SESSION_STATUS.PAUSED,
          currentRound: 2,
          totalCostUsd: 0.5,
        }),
      );
    });
  });

  describe('resumeSession', () => {
    it('должен загрузить сессию и продолжить discussion loop', async () => {
      const session = createMockSession({ maxRounds: 2, currentRound: 1 });
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.resumeSession('session-1');

      // Эмитим RUNNING
      expect(eventEmitter.emitSessionStatusChanged).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ status: SESSION_STATUS.RUNNING }),
      );
      // Продолжает до конца
      expect(eventEmitter.emitSessionCompleted).toHaveBeenCalled();
    });

    it('должен обработать message перед resuming если передан', async () => {
      const session = createMockSession({ maxRounds: 2, currentRound: 1 });
      // loadSession для resumeSession + handleUserMessage + второй loadSession
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.resumeSession('session-1', 'Уточняющий вопрос');

      // message.create вызван для сохранения пользовательского сообщения
      expect(prismaService.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: 'Уточняющий вопрос',
          }),
        }),
      );
    });

    it('должен вызвать failSession при критической ошибке', async () => {
      prismaService.session.findUnique.mockRejectedValue(new Error('DB error'));

      await service.resumeSession('session-1');

      expect(prismaService.session.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: SESSION_STATUS.ERROR },
        }),
      );
    });
  });

  describe('handleUserMessage', () => {
    it('должен создать USER_INITIATED раунд', async () => {
      const session = createMockSession();
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.handleUserMessage('session-1', 'Тестовое сообщение');

      expect(roundManager.createRound).toHaveBeenCalledWith('session-1', 'USER_INITIATED');
    });

    it('должен сохранить пользовательское сообщение в БД', async () => {
      const session = createMockSession();
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.handleUserMessage('session-1', 'Тестовое сообщение');

      expect(prismaService.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            content: 'Тестовое сообщение',
            sessionId: 'session-1',
          }),
        }),
      );
    });

    it('должен запустить Директора, Аналитиков и синтез Директора', async () => {
      const session = createMockSession();
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.handleUserMessage('session-1', 'Тестовое сообщение');

      // Директор (1) + Аналитик1 + Аналитик2 (2) + Синтез Директора (1) = 4 вызова runAgent
      // (Ресерчер — только через tool call)
      expect(agentRunner.runAgent).toHaveBeenCalledTimes(4);
    });

    it('должен завершить раунд после обработки', async () => {
      const session = createMockSession();
      prismaService.session.findUnique.mockResolvedValue(session);

      await service.handleUserMessage('session-1', 'Сообщение');

      expect(roundManager.completeRound).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emitRoundCompleted).toHaveBeenCalledTimes(1);
    });

    it('должен вызвать emitSessionError (не failSession) при ошибке', async () => {
      prismaService.session.findUnique.mockRejectedValue(new Error('Ошибка'));

      await service.handleUserMessage('session-1', 'Сообщение');

      expect(eventEmitter.emitSessionError).toHaveBeenCalledWith('session-1', expect.any(String));
      // failSession НЕ вызван (статус сессии не меняется на ERROR)
      expect(prismaService.session.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: SESSION_STATUS.ERROR },
        }),
      );
    });
  });

  describe('containsFinalizationSignal', () => {
    // Метод приватный — доступ через (service as any) для тестирования внутренней логики
    it('должен обнаружить ключевые слова', () => {
      const svc = service as any;
      expect(svc.containsFinalizationSignal('Я ФИНАЛИЗИРУЮ результаты')).toBe(true);
      expect(svc.containsFinalizationSignal('переходим к скорингу')).toBe(true);
      expect(svc.containsFinalizationSignal('ФОРМИРУЮ ИТОГОВЫЙ ОТЧЁТ')).toBe(true);
    });

    it('должен вернуть false без ключевых слов', () => {
      const svc = service as any;
      expect(svc.containsFinalizationSignal('Продолжаем обсуждение')).toBe(false);
      expect(svc.containsFinalizationSignal('Нужно больше данных')).toBe(false);
    });
  });
});
