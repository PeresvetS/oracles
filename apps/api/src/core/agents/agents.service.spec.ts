import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AgentsService } from '@core/agents/agents.service';
import { PrismaService } from '@prisma/prisma.service';
import { PromptsService } from '@core/prompts/prompts.service';
import { CreateAgentDto } from '@core/agents/dto/create-agent.dto';
import { AGENT_ROLE } from '@oracle/shared';

/** Хелпер: минимальный валидный набор агентов */
function buildValidAgents(): CreateAgentDto[] {
  return [
    {
      role: AGENT_ROLE.DIRECTOR,
      provider: 'openrouter',
      modelId: 'anthropic/claude-opus-4-6',
    },
    {
      role: AGENT_ROLE.ANALYST,
      provider: 'openrouter',
      modelId: 'anthropic/claude-sonnet-4-6',
    },
    {
      role: AGENT_ROLE.ANALYST,
      provider: 'openrouter',
      modelId: 'openai/gpt-5.2',
    },
    {
      role: AGENT_ROLE.RESEARCHER,
      provider: 'perplexity',
      modelId: 'sonar-pro',
    },
  ];
}

describe('AgentsService', () => {
  let service: AgentsService;
  let prismaService: {
    agent: { create: jest.Mock; findMany: jest.Mock };
    promptTemplate: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let promptsService: { findDefault: jest.Mock };

  beforeEach(async () => {
    prismaService = {
      agent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      promptTemplate: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    promptsService = {
      findDefault: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentsService,
        { provide: PrismaService, useValue: prismaService },
        { provide: PromptsService, useValue: promptsService },
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
  });

  it('должен быть определён', () => {
    expect(service).toBeDefined();
  });

  describe('createForSession', () => {
    const sessionId = 'session-1';

    it('должен создать корректный набор агентов', async () => {
      const agents = buildValidAgents();
      promptsService.findDefault.mockResolvedValue({
        content: 'default prompt',
      });

      const mockAgents = agents.map((a, i) => ({
        id: `agent-${i}`,
        sessionId,
        ...a,
        name: '',
        systemPrompt: 'default prompt',
        webSearchEnabled: true,
      }));
      prismaService.$transaction.mockResolvedValue(mockAgents);

      const result = await service.createForSession(sessionId, agents);

      expect(result).toHaveLength(4);
      expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('должен отклонить если нет директора', async () => {
      const agents = buildValidAgents().filter((a) => a.role !== AGENT_ROLE.DIRECTOR);

      await expect(service.createForSession(sessionId, agents)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createForSession(sessionId, agents)).rejects.toThrow(
        'Требуется ровно 1 директор',
      );
    });

    it('должен отклонить если больше 1 директора', async () => {
      const agents = buildValidAgents();
      agents.push({
        role: AGENT_ROLE.DIRECTOR,
        provider: 'openrouter',
        modelId: 'openai/gpt-5.2',
      });

      await expect(service.createForSession(sessionId, agents)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('должен отклонить если меньше 2 аналитиков', async () => {
      const agents = buildValidAgents().filter((a, i) => !(a.role === AGENT_ROLE.ANALYST && i > 1));

      // Оставляем только 1 аналитик
      const oneAnalyst = agents.filter((a) => a.role !== AGENT_ROLE.ANALYST);
      oneAnalyst.push({
        role: AGENT_ROLE.ANALYST,
        provider: 'openrouter',
        modelId: 'openai/gpt-5.2',
      });

      await expect(service.createForSession(sessionId, oneAnalyst)).rejects.toThrow(
        'Количество аналитиков должно быть от 2 до 6',
      );
    });

    it('должен отклонить если больше 6 аналитиков', async () => {
      const agents = buildValidAgents();
      for (let i = 0; i < 5; i++) {
        agents.push({
          role: AGENT_ROLE.ANALYST,
          provider: 'openrouter',
          modelId: 'openai/gpt-5.2',
        });
      }

      await expect(service.createForSession(sessionId, agents)).rejects.toThrow(
        'Количество аналитиков должно быть от 2 до 6',
      );
    });

    it('должен отклонить если нет ресерчера', async () => {
      const agents = buildValidAgents().filter((a) => a.role !== AGENT_ROLE.RESEARCHER);

      await expect(service.createForSession(sessionId, agents)).rejects.toThrow(
        'Требуется ровно 1 ресерчер',
      );
    });

    it('должен использовать customSystemPrompt если передан', async () => {
      const agents = buildValidAgents();
      agents[0].customSystemPrompt = 'Кастомный промпт директора';

      promptsService.findDefault.mockResolvedValue({
        content: 'default prompt',
      });

      const mockResult = agents.map((a, i) => ({
        id: `agent-${i}`,
        sessionId,
        ...a,
      }));
      prismaService.$transaction.mockResolvedValue(mockResult);

      await service.createForSession(sessionId, agents);

      // Проверяем что create был вызван с кастомным промптом для директора
      const transactionCalls = prismaService.$transaction.mock.calls[0][0];
      expect(transactionCalls).toHaveLength(4);
    });

    it('должен загрузить promptTemplate по promptTemplateId', async () => {
      const agents = buildValidAgents();
      agents[0].promptTemplateId = 'template-uuid-1234';

      prismaService.promptTemplate.findUnique.mockResolvedValue({
        id: 'template-uuid-1234',
        content: 'Промпт из шаблона',
      });
      promptsService.findDefault.mockResolvedValue({
        content: 'default prompt',
      });

      const mockResult = agents.map((a, i) => ({
        id: `agent-${i}`,
        sessionId,
        ...a,
      }));
      prismaService.$transaction.mockResolvedValue(mockResult);

      await service.createForSession(sessionId, agents);

      expect(prismaService.promptTemplate.findUnique).toHaveBeenCalledWith({
        where: { id: 'template-uuid-1234' },
      });
    });

    it('должен отклонить если promptTemplateId не найден', async () => {
      const agents = buildValidAgents();
      agents[0].promptTemplateId = 'nonexistent-uuid';

      prismaService.promptTemplate.findUnique.mockResolvedValue(null);
      promptsService.findDefault.mockResolvedValue({
        content: 'default',
      });

      await expect(service.createForSession(sessionId, agents)).rejects.toThrow(
        'Шаблон промпта с ID nonexistent-uuid не найден',
      );
    });

    it('должен использовать дефолтный промпт если нет custom и template', async () => {
      const agents = buildValidAgents();

      promptsService.findDefault.mockResolvedValue({
        content: 'default prompt content',
      });

      const mockResult = agents.map((a, i) => ({
        id: `agent-${i}`,
        sessionId,
        ...a,
      }));
      prismaService.$transaction.mockResolvedValue(mockResult);

      await service.createForSession(sessionId, agents);

      expect(promptsService.findDefault).toHaveBeenCalledTimes(4);
    });

    it('должен отклонить если дефолтный промпт не найден', async () => {
      const agents = buildValidAgents();
      promptsService.findDefault.mockResolvedValue(null);

      await expect(service.createForSession(sessionId, agents)).rejects.toThrow(
        'Дефолтный промпт для роли',
      );
    });

    it('должен генерировать имена автоматически', async () => {
      const agents = buildValidAgents();
      promptsService.findDefault.mockResolvedValue({
        content: 'prompt',
      });

      prismaService.$transaction.mockImplementation((calls: unknown[]) => {
        return Promise.resolve(calls.map((_, i) => ({ id: `agent-${i}` })));
      });

      await service.createForSession(sessionId, agents);

      // Проверяем вызовы create — первый аргумент data
      const createCalls = prismaService.$transaction.mock.calls[0][0];
      expect(createCalls).toHaveLength(4);
    });

    it('должен использовать пользовательское имя если задано', async () => {
      const agents = buildValidAgents();
      agents[0].name = 'Мой директор';

      promptsService.findDefault.mockResolvedValue({
        content: 'prompt',
      });

      prismaService.$transaction.mockImplementation((calls: unknown[]) => {
        return Promise.resolve(calls.map((_, i) => ({ id: `agent-${i}` })));
      });

      await service.createForSession(sessionId, agents);
      expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('findBySession', () => {
    it('должен вернуть агентов сессии', async () => {
      const mockAgents = [
        { id: 'a1', role: AGENT_ROLE.DIRECTOR, name: 'Директор' },
        { id: 'a2', role: AGENT_ROLE.ANALYST, name: 'Аналитик 1' },
      ];
      prismaService.agent.findMany.mockResolvedValue(mockAgents);

      const result = await service.findBySession('session-1');

      expect(result).toEqual(mockAgents);
      expect(prismaService.agent.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'session-1' },
        orderBy: { createdAt: 'asc' },
      });
    });
  });
});
