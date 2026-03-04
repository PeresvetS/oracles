import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { SessionsService } from '@core/sessions/sessions.service';
import { PrismaService } from '@prisma/prisma.service';
import { AgentsService } from '@core/agents/agents.service';
import { OrchestratorService } from '@core/orchestrator/orchestrator.service';
import { SESSION_STATUS, SESSION_MODE, SESSION_LIMITS } from '@oracle/shared';

describe('SessionsService', () => {
  let service: SessionsService;
  let prismaService: {
    session: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    message: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let agentsService: { createForSession: jest.Mock };
  let orchestratorService: {
    startSession: jest.Mock;
    pauseSession: jest.Mock;
    resumeSession: jest.Mock;
    handleUserMessage: jest.Mock;
  };

  const mockSession = {
    id: 'session-1',
    userId: 'user-1',
    title: 'Тестовая сессия',
    mode: SESSION_MODE.GENERATE,
    status: SESSION_STATUS.CONFIGURING,
    inputPrompt: 'Генерация идей для SaaS',
    existingIdeas: null,
    filters: {},
    maxRounds: 5,
    currentRound: 0,
    maxResearchCalls: 5,
    researchCallsUsed: 0,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    totalCostUsd: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAgents = [
    { id: 'a1', role: 'DIRECTOR', name: 'Директор' },
    { id: 'a2', role: 'ANALYST', name: 'Аналитик 1' },
    { id: 'a3', role: 'ANALYST', name: 'Аналитик 2' },
    { id: 'a4', role: 'RESEARCHER', name: 'Ресерчер' },
  ];

  beforeEach(async () => {
    prismaService = {
      session: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      message: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    agentsService = {
      createForSession: jest.fn(),
    };

    orchestratorService = {
      startSession: jest.fn().mockResolvedValue(undefined),
      pauseSession: jest.fn().mockResolvedValue(undefined),
      resumeSession: jest.fn().mockResolvedValue(undefined),
      handleUserMessage: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: AgentsService, useValue: agentsService },
        { provide: OrchestratorService, useValue: orchestratorService },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  it('должен быть определён', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      mode: SESSION_MODE.GENERATE,
      inputPrompt: 'Генерация идей для B2B SaaS',
      agents: [] as never[],
    };

    it('должен создать сессию с агентами', async () => {
      prismaService.session.create.mockResolvedValue(mockSession);
      agentsService.createForSession.mockResolvedValue(mockAgents);

      const result = await service.create('user-1', createDto);

      expect(result.id).toBe('session-1');
      expect(result.agents).toEqual(mockAgents);
      expect(result._count).toEqual({
        rounds: 0,
        messages: 0,
        ideas: 0,
      });
      expect(prismaService.session.create).toHaveBeenCalledTimes(1);
      expect(agentsService.createForSession).toHaveBeenCalledWith('session-1', createDto.agents);
    });

    it('должен автогенерировать title из inputPrompt', async () => {
      prismaService.session.create.mockResolvedValue(mockSession);
      agentsService.createForSession.mockResolvedValue(mockAgents);

      await service.create('user-1', createDto);

      const createCall = prismaService.session.create.mock.calls[0][0];
      expect(createCall.data.title).toBe('Генерация: Генерация идей для B2B SaaS');
    });

    it('должен использовать переданный title', async () => {
      prismaService.session.create.mockResolvedValue(mockSession);
      agentsService.createForSession.mockResolvedValue(mockAgents);

      await service.create('user-1', {
        ...createDto,
        title: 'Мой кастомный title',
      });

      const createCall = prismaService.session.create.mock.calls[0][0];
      expect(createCall.data.title).toBe('Мой кастомный title');
    });

    it('должен использовать дефолтные maxRounds и maxResearchCalls', async () => {
      prismaService.session.create.mockResolvedValue(mockSession);
      agentsService.createForSession.mockResolvedValue(mockAgents);

      await service.create('user-1', createDto);

      const createCall = prismaService.session.create.mock.calls[0][0];
      expect(createCall.data.maxRounds).toBe(SESSION_LIMITS.DEFAULT_MAX_ROUNDS);
      expect(createCall.data.maxResearchCalls).toBe(SESSION_LIMITS.DEFAULT_MAX_RESEARCH_CALLS);
    });
  });

  describe('findAll', () => {
    it('должен вернуть пагинированный результат', async () => {
      const mockItems = [mockSession];
      prismaService.$transaction.mockResolvedValue([mockItems, 1]);

      const result = await service.findAll('user-1', {
        page: 1,
        limit: 20,
      });

      expect(result.items).toEqual(mockItems);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });

    it('должен фильтровать по статусу', async () => {
      prismaService.$transaction.mockResolvedValue([[], 0]);

      await service.findAll('user-1', {
        status: SESSION_STATUS.RUNNING,
      });

      // Проверяем что transaction был вызван (prisma.$transaction([findMany, count]))
      expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('должен ограничить limit до MAX_LIMIT', async () => {
      prismaService.$transaction.mockResolvedValue([[], 0]);

      await service.findAll('user-1', { limit: 500 });

      expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('должен использовать дефолтные page и limit', async () => {
      prismaService.$transaction.mockResolvedValue([[], 0]);

      const result = await service.findAll('user-1', {});

      expect(result.page).toBe(1);
    });
  });

  describe('findOne', () => {
    it('должен вернуть сессию с агентами и счётчиками', async () => {
      const sessionWithDetails = {
        ...mockSession,
        agents: mockAgents,
        _count: { rounds: 2, messages: 10, ideas: 3 },
      };
      prismaService.session.findUnique.mockResolvedValue(sessionWithDetails);

      const result = await service.findOne('user-1', 'session-1');

      expect(result.agents).toEqual(mockAgents);
      expect(result._count.rounds).toBe(2);
    });

    it('должен бросить NotFoundException если сессия не найдена', async () => {
      prismaService.session.findUnique.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('должен бросить NotFoundException для чужой сессии', async () => {
      prismaService.session.findUnique.mockResolvedValue({
        ...mockSession,
        userId: 'other-user',
      });

      await expect(service.findOne('user-1', 'session-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findMessages', () => {
    it('должен вернуть сообщения сессии с total', async () => {
      const mockMessages = [
        {
          id: 'message-1',
          sessionId: 'session-1',
          roundId: 'round-1',
          agentId: 'a1',
          role: 'AGENT',
          content: 'Тестовое сообщение',
          modelUsed: 'openai/gpt-5.3-chat',
          tokensInput: 10,
          tokensOutput: 20,
          costUsd: 0.15,
          latencyMs: 100,
          toolCalls: null,
          createdAt: new Date(),
          agent: {
            name: 'Директор',
            role: 'DIRECTOR',
            modelId: 'anthropic/claude-sonnet-4-6',
          },
          round: {
            number: 1,
            type: 'INITIAL',
          },
        },
      ];

      prismaService.session.findUnique.mockResolvedValue(mockSession);
      prismaService.$transaction.mockResolvedValue([mockMessages, 1]);

      const result = await service.findMessages('user-1', 'session-1');

      expect(result.items).toEqual(mockMessages);
      expect(result.total).toBe(1);
      expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('должен бросить NotFoundException если сессия не найдена', async () => {
      prismaService.session.findUnique.mockResolvedValue(null);

      await expect(service.findMessages('user-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('должен обновить title', async () => {
      prismaService.session.findUnique.mockResolvedValue(mockSession);
      prismaService.session.update.mockResolvedValue({
        ...mockSession,
        title: 'Новый title',
      });

      const result = await service.update('user-1', 'session-1', {
        title: 'Новый title',
      });

      expect(result.title).toBe('Новый title');
    });

    it('должен бросить NotFoundException', async () => {
      prismaService.session.findUnique.mockResolvedValue(null);

      await expect(service.update('user-1', 'nonexistent', { title: 'test' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete', () => {
    it('должен удалить сессию', async () => {
      prismaService.session.findUnique.mockResolvedValue(mockSession);
      prismaService.session.delete.mockResolvedValue(mockSession);

      await service.delete('user-1', 'session-1');

      expect(prismaService.session.delete).toHaveBeenCalledWith({
        where: { id: 'session-1' },
      });
    });

    it('должен бросить NotFoundException', async () => {
      prismaService.session.findUnique.mockResolvedValue(null);

      await expect(service.delete('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('start', () => {
    it('должен перевести CONFIGURING → RUNNING', async () => {
      prismaService.session.findUnique.mockResolvedValue(mockSession);
      prismaService.session.update.mockResolvedValue({
        ...mockSession,
        status: SESSION_STATUS.RUNNING,
      });

      const result = await service.start('user-1', 'session-1');

      expect(result.status).toBe(SESSION_STATUS.RUNNING);
      expect(prismaService.session.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { status: SESSION_STATUS.RUNNING },
      });
    });

    it('должен бросить ConflictException если статус !== CONFIGURING', async () => {
      prismaService.session.findUnique.mockResolvedValue({
        ...mockSession,
        status: SESSION_STATUS.RUNNING,
      });

      await expect(service.start('user-1', 'session-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('pause', () => {
    it('должен перевести RUNNING → PAUSED', async () => {
      prismaService.session.findUnique.mockResolvedValue({
        ...mockSession,
        status: SESSION_STATUS.RUNNING,
      });
      prismaService.session.update.mockResolvedValue({
        ...mockSession,
        status: SESSION_STATUS.PAUSED,
      });

      const result = await service.pause('user-1', 'session-1');

      expect(result.status).toBe(SESSION_STATUS.PAUSED);
    });

    it('должен бросить ConflictException если статус !== RUNNING', async () => {
      prismaService.session.findUnique.mockResolvedValue(mockSession);

      await expect(service.pause('user-1', 'session-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('resume', () => {
    it('должен перевести PAUSED → RUNNING', async () => {
      prismaService.session.findUnique.mockResolvedValue({
        ...mockSession,
        status: SESSION_STATUS.PAUSED,
      });
      prismaService.session.update.mockResolvedValue({
        ...mockSession,
        status: SESSION_STATUS.RUNNING,
      });

      const result = await service.resume('user-1', 'session-1');

      expect(result.status).toBe(SESSION_STATUS.RUNNING);
    });

    it('должен принять необязательное сообщение', async () => {
      prismaService.session.findUnique.mockResolvedValue({
        ...mockSession,
        status: SESSION_STATUS.PAUSED,
      });
      prismaService.session.update.mockResolvedValue({
        ...mockSession,
        status: SESSION_STATUS.RUNNING,
      });

      const result = await service.resume('user-1', 'session-1', 'Продолжайте анализ');

      expect(result.status).toBe(SESSION_STATUS.RUNNING);
    });

    it('должен бросить ConflictException если статус !== PAUSED', async () => {
      prismaService.session.findUnique.mockResolvedValue(mockSession);

      await expect(service.resume('user-1', 'session-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('sendMessage', () => {
    it('должен принять сообщение в статусе RUNNING', async () => {
      prismaService.session.findUnique.mockResolvedValue({
        ...mockSession,
        status: SESSION_STATUS.RUNNING,
      });

      await expect(
        service.sendMessage('user-1', 'session-1', 'Добавьте анализ рынка'),
      ).resolves.toBeUndefined();
    });

    it('должен бросить ConflictException если статус CONFIGURING', async () => {
      prismaService.session.findUnique.mockResolvedValue(mockSession);

      await expect(service.sendMessage('user-1', 'session-1', 'test')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('updateMaxRounds', () => {
    it('должен обновить maxRounds', async () => {
      prismaService.session.findUnique.mockResolvedValue({
        ...mockSession,
        currentRound: 2,
      });
      prismaService.session.update.mockResolvedValue({
        ...mockSession,
        maxRounds: 10,
      });

      const result = await service.updateMaxRounds('user-1', 'session-1', 10);

      expect(result.maxRounds).toBe(10);
    });

    it('должен отклонить maxRounds ниже currentRound', async () => {
      prismaService.session.findUnique.mockResolvedValue({
        ...mockSession,
        currentRound: 3,
      });

      await expect(service.updateMaxRounds('user-1', 'session-1', 2)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updateMaxRounds('user-1', 'session-1', 2)).rejects.toThrow(
        'не может быть меньше текущего раунда',
      );
    });

    it('должен отклонить maxRounds выше MAX_ROUNDS', async () => {
      prismaService.session.findUnique.mockResolvedValue(mockSession);

      await expect(
        service.updateMaxRounds('user-1', 'session-1', SESSION_LIMITS.MAX_ROUNDS + 1),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateMaxRounds('user-1', 'session-1', SESSION_LIMITS.MAX_ROUNDS + 1),
      ).rejects.toThrow(`не может превышать ${SESSION_LIMITS.MAX_ROUNDS}`);
    });

    it('должен бросить NotFoundException', async () => {
      prismaService.session.findUnique.mockResolvedValue(null);

      await expect(service.updateMaxRounds('user-1', 'nonexistent', 5)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
