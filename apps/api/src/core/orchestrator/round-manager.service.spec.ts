import { Test, TestingModule } from '@nestjs/testing';
import { RoundManagerService } from '@core/orchestrator/round-manager.service';
import { PrismaService } from '@prisma/prisma.service';
import { LlmGatewayService } from '@integrations/llm/llm-gateway.service';
import { PromptsService } from '@core/prompts/prompts.service';
import { ROUND_STATUS, ROUND_TYPE, MESSAGE_ROLE, AGENT_DEFAULTS } from '@oracle/shared';
import type { SessionWithAgents } from '@core/orchestrator/interfaces/orchestrator.types';

describe('RoundManagerService', () => {
  let service: RoundManagerService;
  let prismaService: {
    round: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    message: {
      findMany: jest.Mock;
    };
    idea: {
      findMany: jest.Mock;
    };
  };
  let llmGateway: {
    chat: jest.Mock;
  };
  let promptsService: {
    processPrompt: jest.Mock;
  };

  const mockSession: SessionWithAgents = {
    id: 'session-1',
    userId: 'user-1',
    title: 'Тестовая сессия',
    mode: 'GENERATE',
    status: 'RUNNING',
    inputPrompt: 'Генерация идей',
    existingIdeas: null,
    filters: {},
    maxRounds: 5,
    currentRound: 1,
    maxResearchCalls: 5,
    researchCallsUsed: 0,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    totalCostUsd: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    agents: [
      {
        id: 'director-1',
        sessionId: 'session-1',
        role: 'DIRECTOR',
        name: 'Директор',
        provider: 'openrouter',
        modelId: 'anthropic/claude-sonnet-4-6',
        systemPrompt: 'Ты директор',
        webSearchEnabled: true,
        totalTokensInput: 0,
        totalTokensOutput: 0,
        totalCostUsd: 0,
        createdAt: new Date(),
      },
      {
        id: 'analyst-1',
        sessionId: 'session-1',
        role: 'ANALYST',
        name: 'Аналитик 1',
        provider: 'openrouter',
        modelId: 'openai/gpt-5.3-chat',
        systemPrompt: 'Ты аналитик',
        webSearchEnabled: true,
        totalTokensInput: 0,
        totalTokensOutput: 0,
        totalCostUsd: 0,
        createdAt: new Date(),
      },
    ],
  } as SessionWithAgents;

  const mockDirector = mockSession.agents[0];
  const mockAnalyst = mockSession.agents[1];

  const mockLlmResponse = {
    content: 'Краткое саммари предыдущих обсуждений',
    tokensInput: 100,
    tokensOutput: 50,
    costUsd: 0.001,
    latencyMs: 500,
    model: 'anthropic/claude-sonnet-4-6',
  };

  beforeEach(async () => {
    prismaService = {
      round: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      message: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      idea: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    llmGateway = {
      chat: jest.fn().mockResolvedValue(mockLlmResponse),
    };

    promptsService = {
      processPrompt: jest.fn().mockImplementation((prompt: string) => prompt),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoundManagerService,
        { provide: PrismaService, useValue: prismaService },
        { provide: LlmGatewayService, useValue: llmGateway },
        { provide: PromptsService, useValue: promptsService },
      ],
    }).compile();

    service = module.get<RoundManagerService>(RoundManagerService);
  });

  it('должен быть определён', () => {
    expect(service).toBeDefined();
  });

  describe('createRound', () => {
    it('должен создать первый раунд с number=1', async () => {
      prismaService.round.findFirst.mockResolvedValue(null);
      prismaService.round.create.mockResolvedValue({
        id: 'round-1',
        sessionId: 'session-1',
        number: 1,
        type: ROUND_TYPE.INITIAL,
        status: ROUND_STATUS.IN_PROGRESS,
        startedAt: new Date(),
        completedAt: null,
        userMessage: null,
      });

      const result = await service.createRound('session-1', ROUND_TYPE.INITIAL);

      expect(result.number).toBe(1);
      expect(prismaService.round.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sessionId: 'session-1',
          type: ROUND_TYPE.INITIAL,
          number: 1,
          status: ROUND_STATUS.IN_PROGRESS,
        }),
      });
    });

    it('должен автоинкрементировать номер раунда', async () => {
      prismaService.round.findFirst.mockResolvedValue({ number: 3 });
      prismaService.round.create.mockResolvedValue({
        id: 'round-4',
        number: 4,
        type: ROUND_TYPE.DISCUSSION,
        status: ROUND_STATUS.IN_PROGRESS,
      });

      const result = await service.createRound('session-1', ROUND_TYPE.DISCUSSION);

      expect(result.number).toBe(4);
    });
  });

  describe('completeRound', () => {
    it('должен установить статус COMPLETED и completedAt', async () => {
      const now = new Date();
      prismaService.round.update.mockResolvedValue({
        id: 'round-1',
        status: ROUND_STATUS.COMPLETED,
        completedAt: now,
      });

      const result = await service.completeRound('round-1');

      expect(result.status).toBe(ROUND_STATUS.COMPLETED);
      expect(prismaService.round.update).toHaveBeenCalledWith({
        where: { id: 'round-1' },
        data: {
          status: ROUND_STATUS.COMPLETED,
          completedAt: expect.any(Date),
        },
      });
    });
  });

  describe('buildAgentContext', () => {
    it('должен включать системный промпт и контекст сессии первыми двумя сообщениями', async () => {
      const result = await service.buildAgentContext(mockDirector, mockSession, 1);

      // Первое — обработанный системный промпт
      expect(result[0]).toEqual({ role: 'system', content: 'Ты директор' });
      expect(promptsService.processPrompt).toHaveBeenCalledWith(
        'Ты директор',
        expect.objectContaining({
          inputPrompt: 'Генерация идей',
        }),
      );
      // Второе — контекст сессии
      expect(result[1].role).toBe('system');
      expect(result[1].content).toContain('Генерация идей');
      expect(result[1].content).toContain('Генерация идей');
    });

    it('в режиме VALIDATE должен включать existingIdeas и запрет генерации нового пула', async () => {
      const validateSession = {
        ...mockSession,
        mode: 'VALIDATE',
        existingIdeas: JSON.stringify([
          'Идея A: AI-помощник для саппорта',
          'Идея B: Мониторинг цен конкурентов',
        ]),
      } as SessionWithAgents;

      const result = await service.buildAgentContext(mockAnalyst, validateSession, 1);
      const sessionContext = result[1];

      expect(sessionContext.role).toBe('system');
      expect(sessionContext.content).toContain('Валидация существующих идей');
      expect(sessionContext.content).toContain(
        'КРИТИЧЕСКОЕ ПРАВИЛО: в режиме VALIDATE не генерируй новый список идей с нуля.',
      );
      expect(sessionContext.content).toContain('existingIdeas для валидации');
      expect(sessionContext.content).toContain('Идея A: AI-помощник для саппорта');
      expect(sessionContext.content).toContain('Идея B: Мониторинг цен конкурентов');
    });

    it('должен вернуть полный контекст для round < CONTEXT_SUMMARIZE_FROM_ROUND', async () => {
      const messages = [
        {
          id: 'msg-1',
          role: MESSAGE_ROLE.AGENT,
          content: 'Привет от директора',
          agentId: 'director-1',
          agent: { id: 'director-1', name: 'Директор', role: 'DIRECTOR' },
        },
        {
          id: 'msg-2',
          role: MESSAGE_ROLE.AGENT,
          content: 'Ответ аналитика',
          agentId: 'analyst-1',
          agent: { id: 'analyst-1', name: 'Аналитик 1', role: 'ANALYST' },
        },
      ];
      prismaService.message.findMany.mockResolvedValue(messages);

      const result = await service.buildAgentContext(mockDirector, mockSession, 2);

      // [0] system prompt, [1] session context, [2] director msg → assistant, [3] analyst → user
      expect(result.length).toBe(4);
      expect(result[0].role).toBe('system'); // system prompt
      expect(result[1].role).toBe('system'); // session context
      // Директор смотрит на своё сообщение → assistant
      expect(result[2].role).toBe('assistant');
      expect(result[2].content).toBe('Привет от директора');
      // Аналитик для директора → user с именем
      expect(result[3].role).toBe('user');
      expect(result[3].content).toContain('[Аналитик 1]');
    });

    it('должен суммаризировать для round >= CONTEXT_SUMMARIZE_FROM_ROUND', async () => {
      const oldMessages = [
        {
          id: 'msg-old',
          role: MESSAGE_ROLE.AGENT,
          content: 'Старое сообщение',
          agentId: 'director-1',
          agent: { id: 'director-1', name: 'Директор', role: 'DIRECTOR' },
        },
      ];
      const recentMessages = [
        {
          id: 'msg-recent',
          role: MESSAGE_ROLE.AGENT,
          content: 'Недавнее сообщение',
          agentId: 'analyst-1',
          agent: { id: 'analyst-1', name: 'Аналитик 1', role: 'ANALYST' },
        },
      ];

      // Порядок вызовов: roundNumberLt (старые), затем roundNumberGte (текущий раунд)
      prismaService.message.findMany
        .mockResolvedValueOnce(oldMessages)
        .mockResolvedValueOnce(recentMessages);

      const result = await service.buildAgentContext(
        mockDirector,
        mockSession,
        AGENT_DEFAULTS.CONTEXT_SUMMARIZE_FROM_ROUND,
      );

      // [0] system prompt, [1] session context, [2] summary, [3] recent message
      expect(result.length).toBe(4);
      expect(result[0].role).toBe('system'); // system prompt
      expect(result[1].role).toBe('system'); // session context
      expect(result[2].role).toBe('system'); // summary
      expect(result[2].content).toContain('Саммари');
      expect(result[2].content).toContain('Краткое саммари предыдущих обсуждений');
      expect(llmGateway.chat).toHaveBeenCalledTimes(1);
      expect(prismaService.message.findMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            round: { number: { lt: AGENT_DEFAULTS.CONTEXT_SUMMARIZE_FROM_ROUND } },
          }),
        }),
      );
      expect(prismaService.message.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            round: { number: { gte: AGENT_DEFAULTS.CONTEXT_SUMMARIZE_FROM_ROUND } },
          }),
        }),
      );
    });

    it('должен маппить роли: свой agent=assistant, чужой=user, USER=user, SYSTEM=system', async () => {
      const messages = [
        {
          id: 'msg-1',
          role: MESSAGE_ROLE.SYSTEM,
          content: 'Системное',
          agentId: null,
          agent: null,
        },
        {
          id: 'msg-2',
          role: MESSAGE_ROLE.USER,
          content: 'Пользовательское',
          agentId: null,
          agent: null,
        },
        {
          id: 'msg-3',
          role: MESSAGE_ROLE.AGENT,
          content: 'Ответ аналитика',
          agentId: 'analyst-1',
          agent: { id: 'analyst-1', name: 'Аналитик 1', role: 'ANALYST' },
        },
        {
          id: 'msg-4',
          role: MESSAGE_ROLE.AGENT,
          content: 'Ответ директора',
          agentId: 'director-1',
          agent: { id: 'director-1', name: 'Директор', role: 'DIRECTOR' },
        },
      ];
      prismaService.message.findMany.mockResolvedValue(messages);

      // Контекст для аналитика (round = 1 < 3, полная история)
      const result = await service.buildAgentContext(mockAnalyst, mockSession, 1);

      // [0] system prompt, [1] session context, [2] SYSTEM, [3] USER, [4] analyst own → assistant, [5] director → user
      expect(result[2]).toEqual({ role: 'system', content: 'Системное' });
      expect(result[3]).toEqual({ role: 'user', content: 'Пользовательское' });
      expect(result[4].role).toBe('assistant'); // аналитик смотрит на своё сообщение
      expect(result[5].role).toBe('user'); // директор — чужой
      expect(result[5].content).toContain('[Директор]');
    });

    it('должен включать список активных идей', async () => {
      prismaService.idea.findMany.mockResolvedValue([
        { title: 'Идея 1', status: 'PROPOSED', summary: 'Описание первой идеи' },
        { title: 'Идея 2', status: 'ACTIVE', summary: 'Описание второй идеи' },
      ]);

      const result = await service.buildAgentContext(mockDirector, mockSession, 1);

      const ideasMessage = result.find(
        (m) => m.role === 'system' && m.content.startsWith('Активные идеи:'),
      );
      expect(ideasMessage).toBeDefined();
      expect(ideasMessage?.content).toContain('[PROPOSED] Идея 1');
      expect(ideasMessage?.content).toContain('[ACTIVE] Идея 2');
    });

    it('не должен включать блок идей когда их нет', async () => {
      prismaService.idea.findMany.mockResolvedValue([]);

      const result = await service.buildAgentContext(mockDirector, mockSession, 1);

      const ideasMessage = result.find(
        (m) => m.role === 'system' && m.content.startsWith('Активные идеи:'),
      );
      expect(ideasMessage).toBeUndefined();
    });

    it('должен кэшировать саммари между вызовами одного раунда', async () => {
      const oldMessages = [
        {
          id: 'msg-old',
          role: MESSAGE_ROLE.AGENT,
          content: 'Старое',
          agentId: 'director-1',
          agent: { id: 'director-1', name: 'Директор', role: 'DIRECTOR' },
        },
      ];
      prismaService.message.findMany.mockResolvedValue(oldMessages);

      const roundNumber = AGENT_DEFAULTS.CONTEXT_SUMMARIZE_FROM_ROUND;

      // Первый вызов — создаёт саммари
      await service.buildAgentContext(mockDirector, mockSession, roundNumber);
      // Второй вызов — тот же раунд, должен взять из кэша
      await service.buildAgentContext(mockDirector, mockSession, roundNumber);

      // LLM должен быть вызван только один раз (второй раз берётся из кэша)
      expect(llmGateway.chat).toHaveBeenCalledTimes(1);
    });
  });

  describe('summarizePreviousRounds', () => {
    it('должен вызвать LLM с правильным промптом', async () => {
      const messages = [
        { role: 'user' as const, content: 'Вопрос' },
        { role: 'assistant' as const, content: 'Ответ' },
      ];

      const result = await service.summarizePreviousRounds(messages, mockSession);

      expect(result).toBe('Краткое саммари предыдущих обсуждений');
      expect(llmGateway.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: mockDirector.provider,
          modelId: mockDirector.modelId,
          temperature: 0.3,
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'system' }),
            expect.objectContaining({ role: 'user' }),
          ]),
        }),
      );
    });

    it('должен использовать fallback саммари если нет директора', async () => {
      const sessionWithoutDirector: SessionWithAgents = {
        ...mockSession,
        agents: [mockAnalyst],
      };
      const messages = [
        { role: 'user' as const, content: 'Сообщение 1' },
        { role: 'assistant' as const, content: 'Ответ 1' },
      ];

      const result = await service.summarizePreviousRounds(messages, sessionWithoutDirector);

      // Fallback: последние 5 сообщений усечённые до 200 символов
      expect(typeof result).toBe('string');
      expect(llmGateway.chat).not.toHaveBeenCalled();
    });
  });
});
