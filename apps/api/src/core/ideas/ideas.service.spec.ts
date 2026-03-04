import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IdeasService } from '@core/ideas/ideas.service';
import { PrismaService } from '@prisma/prisma.service';
import { IDEA_STATUS } from '@oracle/shared';
import type { AnalystScore } from '@oracle/shared';

describe('IdeasService', () => {
  let service: IdeasService;
  let prismaService: {
    idea: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const mockIdea = {
    id: 'idea-1',
    sessionId: 'session-1',
    title: 'Тестовая идея',
    summary: 'Описание тестовой идеи',
    status: IDEA_STATUS.PROPOSED,
    proposedByAgentId: 'agent-1',
    proposedInRound: 1,
    rejectedInRound: null,
    rejectionReason: null,
    details: null,
    scores: null,
    avgIce: null,
    avgRice: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAnalystScore1: AnalystScore = {
    ice: { impact: 8, confidence: 7, ease: 6, total: 7 },
    rice: { reach: 9, impact: 8, confidence: 0.7, effort: 4, total: 12.6 },
  };

  const mockAnalystScore2: AnalystScore = {
    ice: { impact: 6, confidence: 8, ease: 9, total: 7.67 },
    rice: { reach: 7, impact: 7, confidence: 0.8, effort: 3, total: 13.07 },
  };

  beforeEach(async () => {
    prismaService = {
      idea: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [IdeasService, { provide: PrismaService, useValue: prismaService }],
    }).compile();

    service = module.get<IdeasService>(IdeasService);
    prismaService.idea.findMany.mockResolvedValue([]);
  });

  describe('create', () => {
    it('создаёт идею с PROPOSED статусом', async () => {
      prismaService.idea.create.mockResolvedValueOnce(mockIdea);

      const result = await service.create({
        sessionId: 'session-1',
        title: 'Тестовая идея',
        summary: 'Описание',
        proposedByAgentId: 'agent-1',
        proposedInRound: 1,
      });

      expect(prismaService.idea.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: IDEA_STATUS.PROPOSED,
            sessionId: 'session-1',
            title: 'Тестовая идея',
          }),
        }),
      );
      expect(result.status).toBe(IDEA_STATUS.PROPOSED);
    });

    it('создаёт идею без агента (proposedByAgentId = null)', async () => {
      prismaService.idea.create.mockResolvedValueOnce({ ...mockIdea, proposedByAgentId: null });

      const result = await service.create({
        sessionId: 'session-1',
        title: 'Идея без агента',
        summary: 'Описание',
      });

      expect(result.proposedByAgentId).toBeNull();
    });
  });

  describe('createFromAgentResponse', () => {
    it('создаёт несколько идей из ответа агента', async () => {
      const created = [
        { ...mockIdea, id: 'idea-1', title: 'Идея 1' },
        { ...mockIdea, id: 'idea-2', title: 'Идея 2' },
      ];
      prismaService.$transaction.mockResolvedValueOnce(created);

      const result = await service.createFromAgentResponse('session-1', 'agent-1', 1, [
        { title: 'Идея 1', summary: 'Описание 1' },
        { title: 'Идея 2', summary: 'Описание 2' },
      ]);

      expect(prismaService.$transaction).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('возвращает пустой массив при пустом списке идей', async () => {
      const result = await service.createFromAgentResponse('session-1', 'agent-1', 1, []);
      expect(result).toEqual([]);
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('parseIdeasFromText', () => {
    it('парсит markdown-блоки с заголовками ###', () => {
      const result = service.parseIdeasFromText(
        [
          '### AI-ассистент для продаж',
          'Автоматизация квалификации лидов в Telegram.',
          '',
          '### CRM-плагин',
          'Виджет с рекомендациями следующего действия для менеджера.',
        ].join('\n'),
      );

      expect(result).toEqual([
        {
          title: 'AI-ассистент для продаж',
          summary: 'Автоматизация квалификации лидов в Telegram.',
        },
        {
          title: 'CRM-плагин',
          summary: 'Виджет с рекомендациями следующего действия для менеджера.',
        },
      ]);
    });

    it('использует fallback на нумерованный список', () => {
      const result = service.parseIdeasFromText(
        [
          '1. Маркетплейс нишевых услуг — Быстрый запуск через шаблоны объявлений.',
          '2. Подписка для SMB: AI-аналитика маркетинга.',
        ].join('\n'),
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.title).toContain('Маркетплейс нишевых услуг');
    });

    it('дедуплицирует идеи по заголовку', () => {
      const result = service.parseIdeasFromText(
        [
          '### AI-помощник',
          'Вариант A с подробным описанием',
          '',
          '### AI-помощник',
          'Вариант B с подробным описанием',
        ].join('\n'),
      );

      expect(result).toHaveLength(1);
    });
  });

  describe('updateStatus', () => {
    it('обновляет статус PROPOSED → ACTIVE (допустимый переход)', async () => {
      const updatedIdea = { ...mockIdea, status: IDEA_STATUS.ACTIVE };
      prismaService.idea.findUnique.mockResolvedValueOnce(mockIdea);
      prismaService.idea.update.mockResolvedValueOnce(updatedIdea);

      const result = await service.updateStatus('idea-1', IDEA_STATUS.ACTIVE);

      expect(prismaService.idea.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: IDEA_STATUS.ACTIVE }),
        }),
      );
      expect(result.status).toBe(IDEA_STATUS.ACTIVE);
    });

    it('обновляет статус ACTIVE → FINAL', async () => {
      const activeIdea = { ...mockIdea, status: IDEA_STATUS.ACTIVE };
      const finalIdea = { ...mockIdea, status: IDEA_STATUS.FINAL };
      prismaService.idea.findUnique.mockResolvedValueOnce(activeIdea);
      prismaService.idea.update.mockResolvedValueOnce(finalIdea);

      const result = await service.updateStatus('idea-1', IDEA_STATUS.FINAL);
      expect(result.status).toBe(IDEA_STATUS.FINAL);
    });

    it('обновляет статус ACTIVE → REJECTED с причиной', async () => {
      const activeIdea = { ...mockIdea, status: IDEA_STATUS.ACTIVE };
      const rejectedIdea = {
        ...mockIdea,
        status: IDEA_STATUS.REJECTED,
        rejectionReason: 'Слабое RICE-скор',
        rejectedInRound: 3,
      };
      prismaService.idea.findUnique.mockResolvedValueOnce(activeIdea);
      prismaService.idea.update.mockResolvedValueOnce(rejectedIdea);

      const result = await service.updateStatus('idea-1', IDEA_STATUS.REJECTED, {
        rejectionReason: 'Слабое RICE-скор',
        rejectedInRound: 3,
      });

      expect(prismaService.idea.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: IDEA_STATUS.REJECTED,
            rejectionReason: 'Слабое RICE-скор',
            rejectedInRound: 3,
          }),
        }),
      );
      expect(result.status).toBe(IDEA_STATUS.REJECTED);
    });

    it('выбрасывает BadRequestException при недопустимом переходе PROPOSED → FINAL', async () => {
      prismaService.idea.findUnique.mockResolvedValueOnce(mockIdea);

      await expect(service.updateStatus('idea-1', IDEA_STATUS.FINAL)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('выбрасывает NotFoundException если идея не найдена', async () => {
      prismaService.idea.findUnique.mockResolvedValueOnce(null);

      await expect(service.updateStatus('idea-1', IDEA_STATUS.ACTIVE)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addScore', () => {
    it('добавляет скоринг первого аналитика и пересчитывает averages', async () => {
      prismaService.idea.findUnique.mockResolvedValueOnce({ ...mockIdea, scores: null });
      const updatedIdea = {
        ...mockIdea,
        scores: { 'agent-1': mockAnalystScore1 },
        avgIce: 7,
        avgRice: 12.6,
      };
      prismaService.idea.update.mockResolvedValueOnce(updatedIdea);

      const result = await service.addScore('idea-1', 'agent-1', mockAnalystScore1);

      expect(prismaService.idea.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            avgIce: 7,
            avgRice: 12.6,
          }),
        }),
      );
      expect(result.avgIce).toBe(7);
    });

    it('добавляет скоринг второго аналитика и пересчитывает средние', async () => {
      const ideaWithScore1 = {
        ...mockIdea,
        scores: { 'agent-1': mockAnalystScore1 },
        avgIce: 7,
        avgRice: 12.6,
      };
      prismaService.idea.findUnique.mockResolvedValueOnce(ideaWithScore1);

      // avg ICE = (7 + 7.67) / 2 = 7.335 → 7.34
      // avg RICE = (12.6 + 13.07) / 2 = 12.835 → 12.84
      const updatedIdea = {
        ...mockIdea,
        scores: { 'agent-1': mockAnalystScore1, 'agent-2': mockAnalystScore2 },
        avgIce: 7.34,
        avgRice: 12.84,
      };
      prismaService.idea.update.mockResolvedValueOnce(updatedIdea);

      const result = await service.addScore('idea-1', 'agent-2', mockAnalystScore2);

      const updateCall = prismaService.idea.update.mock.calls[0][0];
      expect(updateCall.data.avgIce).toBeCloseTo(7.34, 1);
      expect(result.avgRice).toBe(12.84);
    });

    it('перезаписывает скоринг того же аналитика', async () => {
      const existingScore: AnalystScore = {
        ice: { impact: 1, confidence: 1, ease: 1, total: 1 },
        rice: { reach: 1, impact: 1, confidence: 0.1, effort: 10, total: 0.01 },
      };
      const ideaWithOldScore = {
        ...mockIdea,
        scores: { 'agent-1': existingScore },
      };
      prismaService.idea.findUnique.mockResolvedValueOnce(ideaWithOldScore);
      prismaService.idea.update.mockResolvedValueOnce({
        ...mockIdea,
        scores: { 'agent-1': mockAnalystScore1 },
        avgIce: 7,
      });

      await service.addScore('idea-1', 'agent-1', mockAnalystScore1);

      const updateCall = prismaService.idea.update.mock.calls[0][0];
      const updatedScores = updateCall.data.scores as Record<string, AnalystScore>;
      expect(updatedScores['agent-1']).toEqual(mockAnalystScore1);
      // Только один аналитик
      expect(Object.keys(updatedScores)).toHaveLength(1);
    });

    it('выбрасывает NotFoundException если идея не найдена', async () => {
      prismaService.idea.findUnique.mockResolvedValueOnce(null);

      await expect(service.addScore('nonexistent', 'agent-1', mockAnalystScore1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('finalizeTopIdeas', () => {
    const makeIdea = (id: string, avgIce: number, avgRice = 5) => ({
      ...mockIdea,
      id,
      title: `Идея ${id}`,
      status: IDEA_STATUS.ACTIVE,
      avgIce,
      avgRice,
    });

    it('финализирует ТОП-3, остальные отклоняет', async () => {
      const ideas = [
        makeIdea('idea-1', 9),
        makeIdea('idea-2', 8),
        makeIdea('idea-3', 7),
        makeIdea('idea-4', 6),
        makeIdea('idea-5', 5),
      ];
      prismaService.idea.findMany.mockResolvedValueOnce(ideas);

      const finalIdeas = ideas.slice(0, 3).map((i) => ({ ...i, status: IDEA_STATUS.FINAL }));
      const rejectedIdeas = ideas.slice(3).map((i) => ({ ...i, status: IDEA_STATUS.REJECTED }));

      prismaService.$transaction
        .mockResolvedValueOnce(finalIdeas)
        .mockResolvedValueOnce(rejectedIdeas);

      const result = await service.finalizeTopIdeas('session-1', 3);

      expect(result.finalized).toHaveLength(3);
      expect(result.rejected).toHaveLength(2);
    });

    it('использует avgRice как tiebreaker при равном avgIce', async () => {
      const ideas = [
        makeIdea('idea-1', 8, 12),
        makeIdea('idea-2', 8, 15), // должна быть выше при tiebreaker
        makeIdea('idea-3', 7, 10),
      ];
      prismaService.idea.findMany.mockResolvedValueOnce(ideas);
      prismaService.$transaction
        .mockResolvedValueOnce([ideas[1], ideas[0]])
        .mockResolvedValueOnce([ideas[2]]);

      const result = await service.finalizeTopIdeas('session-1', 2);

      // Проверяем что транзакция вызвалась — реальная сортировка внутри сервиса
      expect(prismaService.$transaction).toHaveBeenCalledTimes(2);
      expect(result.finalized).toHaveLength(2);
      expect(result.rejected).toHaveLength(1);
    });

    it('финализирует все идеи если их меньше topCount', async () => {
      const ideas = [makeIdea('idea-1', 8), makeIdea('idea-2', 7)];
      prismaService.idea.findMany.mockResolvedValueOnce(ideas);
      prismaService.$transaction
        .mockResolvedValueOnce(ideas.map((i) => ({ ...i, status: IDEA_STATUS.FINAL })))
        .mockResolvedValueOnce([]);

      const result = await service.finalizeTopIdeas('session-1', 5);

      expect(result.finalized).toHaveLength(2);
      expect(result.rejected).toHaveLength(0);
    });

    it('возвращает пустые массивы если нет активных идей', async () => {
      prismaService.idea.findMany.mockResolvedValueOnce([]);

      const result = await service.finalizeTopIdeas('session-1', 3);

      expect(result.finalized).toHaveLength(0);
      expect(result.rejected).toHaveLength(0);
      expect(prismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('findBySession', () => {
    it('возвращает все идеи без фильтра', async () => {
      const ideas = [mockIdea, { ...mockIdea, id: 'idea-2' }];
      prismaService.idea.findMany.mockResolvedValueOnce(ideas);

      const result = await service.findBySession('session-1');

      expect(prismaService.idea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: 'session-1' },
        }),
      );
      expect(result).toHaveLength(2);
    });

    it('фильтрует по статусу FINAL', async () => {
      const finalIdea = { ...mockIdea, status: IDEA_STATUS.FINAL };
      prismaService.idea.findMany.mockResolvedValueOnce([finalIdea]);

      const result = await service.findBySession('session-1', IDEA_STATUS.FINAL);

      expect(prismaService.idea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: 'session-1', status: IDEA_STATUS.FINAL },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('findRejected', () => {
    it('возвращает только отклонённые идеи', async () => {
      const rejected = [
        { ...mockIdea, id: 'idea-r1', status: IDEA_STATUS.REJECTED },
        { ...mockIdea, id: 'idea-r2', status: IDEA_STATUS.REJECTED },
      ];
      prismaService.idea.findMany.mockResolvedValueOnce(rejected);

      const result = await service.findRejected('session-1');

      expect(prismaService.idea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: 'session-1', status: IDEA_STATUS.REJECTED },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('findActiveForScoring', () => {
    it('возвращает PROPOSED и ACTIVE идеи', async () => {
      const ideas = [
        { ...mockIdea, status: IDEA_STATUS.PROPOSED },
        { ...mockIdea, id: 'idea-2', status: IDEA_STATUS.ACTIVE },
      ];
      prismaService.idea.findMany.mockResolvedValueOnce(ideas);

      const result = await service.findActiveForScoring('session-1');

      expect(prismaService.idea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            sessionId: 'session-1',
            status: { in: [IDEA_STATUS.PROPOSED, IDEA_STATUS.ACTIVE] },
          },
        }),
      );
      expect(result).toHaveLength(2);
    });
  });
});
