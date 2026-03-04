import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReportsService } from '@core/reports/reports.service';
import { PrismaService } from '@prisma/prisma.service';
import { IDEA_STATUS } from '@oracle/shared';
import type { ReportContent } from '@oracle/shared';
import { CSV_UTF8_BOM, CSV_SEPARATOR } from '@core/reports/constants/reports.constants';

describe('ReportsService', () => {
  let service: ReportsService;
  let prismaService: {
    session: { findUnique: jest.Mock };
    idea: { findMany: jest.Mock };
    agent: { findMany: jest.Mock };
    round: { count: jest.Mock };
    report: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  const mockSession = {
    id: 'session-1',
    mode: 'GENERATE',
    inputPrompt: 'Найди прибыльную нишу',
    totalCostUsd: 0.15,
  };

  const mockFinalIdea = {
    id: 'idea-1',
    title: 'Маркетплейс услуг',
    summary: 'Платформа для фрилансеров',
    status: IDEA_STATUS.FINAL,
    avgIce: 7.5,
    avgRice: 12.3,
    details: { risks: 'Конкуренция' },
    scores: { 'agent-1': { ice: { total: 7.5 }, rice: { total: 12.3 } } },
    rejectionReason: null,
    rejectedInRound: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRejectedIdea = {
    id: 'idea-2',
    title: 'Продажа воды',
    summary: 'Продажа питьевой воды',
    status: IDEA_STATUS.REJECTED,
    avgIce: 3.1,
    avgRice: 2.0,
    details: null,
    scores: {},
    rejectionReason: 'Не вошла в ТОП-3 по скорингу ICE/RICE',
    rejectedInRound: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReport = {
    id: 'report-1',
    sessionId: 'session-1',
    content: {
      finalIdeas: [
        {
          title: mockFinalIdea.title,
          summary: mockFinalIdea.summary,
          avgIce: 7.5,
          avgRice: 12.3,
          details: { risks: 'Конкуренция' },
          scores: {},
        },
      ],
      rejectedIdeas: [
        {
          title: mockRejectedIdea.title,
          summary: mockRejectedIdea.summary,
          rejectionReason: 'Не вошла в ТОП-3 по скорингу ICE/RICE',
          rejectedInRound: 0,
        },
      ],
      summary:
        'Итоги обсуждения:\n• Раундов проведено: 5\n• Финальных идей: 1\n• Отклонено идей: 1',
      totalRounds: 5,
      totalCostUsd: 0.15,
    } satisfies ReportContent,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prismaService = {
      session: { findUnique: jest.fn() },
      idea: { findMany: jest.fn() },
      agent: { findMany: jest.fn() },
      round: { count: jest.fn() },
      report: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: prismaService }],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('create', () => {
    beforeEach(() => {
      prismaService.session.findUnique.mockResolvedValue(mockSession);
      // FINAL ideas первый вызов, REJECTED ideas второй — используем mockImplementation
      // чтобы работало при повторных вызовах (тест идемпотентности)
      prismaService.idea.findMany.mockImplementation((args: { where: { status: string } }) => {
        if (args?.where?.status === 'FINAL') {
          return Promise.resolve([mockFinalIdea]);
        }
        return Promise.resolve([mockRejectedIdea]);
      });
      prismaService.agent.findMany.mockResolvedValue([]);
      prismaService.round.count.mockResolvedValue(5);
      prismaService.report.upsert.mockResolvedValue(mockReport);
    });

    it('создаёт отчёт с корректной структурой ReportContent', async () => {
      const result = await service.create('session-1');

      expect(prismaService.report.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { sessionId: 'session-1' },
          create: expect.objectContaining({ sessionId: 'session-1' }),
          update: expect.any(Object),
        }),
      );
      expect(result.sessionId).toBe('session-1');
    });

    it('включает totalCostUsd из сессии', async () => {
      await service.create('session-1');

      const upsertCall = prismaService.report.upsert.mock.calls[0][0];
      const content = upsertCall.create.content as ReportContent;
      expect(content.totalCostUsd).toBe(0.15);
    });

    it('включает количество раундов', async () => {
      await service.create('session-1');

      const upsertCall = prismaService.report.upsert.mock.calls[0][0];
      const content = upsertCall.create.content as ReportContent;
      expect(content.totalRounds).toBe(5);
    });

    it('включает финальные и отклонённые идеи', async () => {
      await service.create('session-1');

      const upsertCall = prismaService.report.upsert.mock.calls[0][0];
      const content = upsertCall.create.content as ReportContent;
      expect(content.finalIdeas).toHaveLength(1);
      expect(content.rejectedIdeas).toHaveLength(1);
    });

    it('вызывает upsert (идемпотентно)', async () => {
      await service.create('session-1');
      await service.create('session-1');

      // второй вызов тоже должен работать через upsert
      expect(prismaService.report.upsert).toHaveBeenCalledTimes(2);
    });

    it('выбрасывает NotFoundException если сессия не найдена', async () => {
      prismaService.session.findUnique.mockResolvedValueOnce(null);

      await expect(service.create('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findBySession', () => {
    it('возвращает отчёт по sessionId', async () => {
      prismaService.report.findUnique.mockResolvedValueOnce(mockReport);

      const result = await service.findBySession('session-1');

      expect(prismaService.report.findUnique).toHaveBeenCalledWith({
        where: { sessionId: 'session-1' },
      });
      expect(result.id).toBe('report-1');
    });

    it('выбрасывает NotFoundException если отчёт не найден', async () => {
      prismaService.report.findUnique.mockResolvedValueOnce(null);

      await expect(service.findBySession('session-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportCsv', () => {
    beforeEach(() => {
      prismaService.report.findUnique.mockResolvedValue(mockReport);
    });

    it('начинается с UTF-8 BOM', async () => {
      const result = (await service.exportCsv('session-1')).toString('utf-8');
      expect(result.startsWith(CSV_UTF8_BOM)).toBe(true);
    });

    it('использует ; как разделитель', async () => {
      const result = (await service.exportCsv('session-1')).toString('utf-8');
      const lines = result.split('\n');
      const headerLine = lines[0].replace(CSV_UTF8_BOM, '');
      expect(headerLine.includes(CSV_SEPARATOR)).toBe(true);
    });

    it('содержит заголовочную строку', async () => {
      const result = (await service.exportCsv('session-1')).toString('utf-8');
      expect(result).toContain('Название');
      expect(result).toContain('Средний ICE');
      expect(result).toContain('Средний RICE');
    });

    it('содержит финальные идеи', async () => {
      const result = (await service.exportCsv('session-1')).toString('utf-8');
      expect(result).toContain('Маркетплейс услуг');
    });

    it('содержит секцию отклонённых идей', async () => {
      const result = (await service.exportCsv('session-1')).toString('utf-8');
      expect(result).toContain('Отклонённые идеи');
      expect(result).toContain('Продажа воды');
    });
  });

  describe('exportJson', () => {
    it('возвращает ReportContent', async () => {
      prismaService.report.findUnique.mockResolvedValueOnce(mockReport);

      const result = await service.exportJson('session-1');

      expect(result.finalIdeas).toHaveLength(1);
      expect(result.totalCostUsd).toBe(0.15);
    });

    it('выбрасывает NotFoundException если отчёт не найден', async () => {
      prismaService.report.findUnique.mockResolvedValueOnce(null);

      await expect(service.exportJson('session-1')).rejects.toThrow(NotFoundException);
    });
  });
});
