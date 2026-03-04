import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Session, Agent, Message, Prisma, Round } from '@prisma/client';
import {
  SESSION_STATUS,
  SESSION_MODE,
  SESSION_LIMITS,
  PAGINATION,
  type SessionStatus,
  type SessionMode,
} from '@oracle/shared';
import { PrismaService } from '@prisma/prisma.service';
import { AgentsService } from '@core/agents/agents.service';
import { OrchestratorService } from '@core/orchestrator/orchestrator.service';
import { CreateSessionDto } from '@core/sessions/dto/create-session.dto';
import { UpdateSessionDto } from '@core/sessions/dto/update-session.dto';
import type { PaginatedResult } from '@shared/interfaces/paginated-result.interface';

/** Максимальная длина автогенерированного title */
const AUTO_TITLE_MAX_LENGTH = 80;

/** Тип сессии с агрегированными данными */
export interface SessionWithDetails extends Session {
  agents: Agent[];
  _count: {
    rounds: number;
    messages: number;
    ideas: number;
  };
}

/** Сообщение с данными агента и раунда для UI */
export interface SessionMessageWithRelations extends Message {
  agent: Pick<Agent, 'name' | 'role' | 'modelId'> | null;
  round: Pick<Round, 'number' | 'type'>;
}

/** Список сообщений сессии */
export interface SessionMessagesResult {
  items: SessionMessageWithRelations[];
  total: number;
}

/** Опции фильтрации/пагинации для findAll */
export interface FindAllOptions {
  page?: number;
  limit?: number;
  status?: SessionStatus;
}

/**
 * Сервис управления сессиями.
 *
 * Отвечает за CRUD сессий и управление жизненным циклом:
 * start/pause/resume/sendMessage/updateMaxRounds.
 *
 * Делегирует оркестрацию в OrchestratorService.
 */
@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService,
    private readonly orchestratorService: OrchestratorService,
  ) {}

  /**
   * Создать новую сессию с агентами.
   *
   * 1. Создаёт сессию в статусе CONFIGURING.
   * 2. Делегирует создание агентов в AgentsService.
   * 3. Возвращает сессию с агентами и нулевыми счётчиками.
   */
  async create(userId: string, dto: CreateSessionDto): Promise<SessionWithDetails> {
    const title = dto.title || this.generateTitle(dto.mode, dto.inputPrompt);

    const session = await this.prisma.session.create({
      data: {
        userId,
        title,
        mode: dto.mode,
        inputPrompt: dto.inputPrompt,
        existingIdeas: dto.existingIdeas ? JSON.stringify(dto.existingIdeas) : null,
        filters: (dto.filters ?? {}) as Prisma.InputJsonValue,
        maxRounds: dto.maxRounds ?? SESSION_LIMITS.DEFAULT_MAX_ROUNDS,
        maxResearchCalls: dto.maxResearchCalls ?? SESSION_LIMITS.DEFAULT_MAX_RESEARCH_CALLS,
      },
    });

    const agents = await this.agentsService.createForSession(session.id, dto.agents);

    this.logger.log(`Сессия ${session.id} создана (${dto.mode}, ${agents.length} агентов)`);

    return {
      ...session,
      agents,
      _count: { rounds: 0, messages: 0, ideas: 0 },
    };
  }

  /**
   * Список сессий текущего пользователя с пагинацией.
   *
   * Поддерживает фильтрацию по статусу.
   * Сортировка по updatedAt desc.
   */
  async findAll(userId: string, options: FindAllOptions): Promise<PaginatedResult<Session>> {
    const page = options.page ?? PAGINATION.DEFAULT_PAGE;
    const limit = Math.min(options.limit ?? PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
    const skip = (page - 1) * limit;

    const where: Prisma.SessionWhereInput = { userId };
    if (options.status) {
      where.status = options.status;
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
        include: {
          agents: {
            select: { id: true, role: true, name: true, modelId: true },
          },
          _count: {
            select: { rounds: true, messages: true, ideas: true },
          },
        },
      }),
      this.prisma.session.count({ where }),
    ]);

    return { items, total, page };
  }

  /**
   * Детали сессии с агентами и счётчиками.
   *
   * @throws NotFoundException если сессия не найдена
   */
  async findOne(userId: string, id: string): Promise<SessionWithDetails> {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        agents: true,
        _count: {
          select: { rounds: true, messages: true, ideas: true },
        },
      },
    });

    if (!session || session.userId !== userId) {
      throw new NotFoundException('Сессия не найдена');
    }

    return session as SessionWithDetails;
  }

  /**
   * Получить сообщения сессии для чата.
   *
   * Возвращает сообщения в хронологическом порядке с данными агента и раунда.
   * Пока без явной пагинации в API, но с защитным лимитом MESSAGES_DEFAULT_LIMIT.
   *
   * @throws NotFoundException если сессия не найдена
   */
  async findMessages(userId: string, id: string): Promise<SessionMessagesResult> {
    await this.findByIdOrThrow(id, userId);

    const where: Prisma.MessageWhereInput = { sessionId: id };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: PAGINATION.MESSAGES_DEFAULT_LIMIT,
        include: {
          agent: {
            select: {
              name: true,
              role: true,
              modelId: true,
            },
          },
          round: {
            select: {
              number: true,
              type: true,
            },
          },
        },
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      items: items as SessionMessageWithRelations[],
      total,
    };
  }

  /**
   * Обновить title и/или filters сессии.
   *
   * @throws NotFoundException если сессия не найдена
   */
  async update(userId: string, id: string, dto: UpdateSessionDto): Promise<Session> {
    await this.findByIdOrThrow(id, userId);

    const data: Prisma.SessionUpdateInput = {};
    if (dto.title !== undefined) {
      data.title = dto.title;
    }
    if (dto.filters !== undefined) {
      data.filters = dto.filters as unknown as Prisma.InputJsonValue;
    }

    return this.prisma.session.update({ where: { id }, data });
  }

  /**
   * Удалить сессию (каскадно удалятся агенты, раунды, сообщения, идеи, отчёт).
   *
   * @throws NotFoundException если сессия не найдена
   */
  async delete(userId: string, id: string): Promise<void> {
    await this.findByIdOrThrow(id, userId);
    await this.prisma.session.delete({ where: { id } });
  }

  /**
   * Запуск сессии: CONFIGURING → RUNNING.
   *
   * Переводит статус и запускает OrchestratorService.startSession() fire-and-forget.
   * Оркестратор работает асинхронно (минуты), клиент получает ответ сразу.
   *
   * @throws NotFoundException если сессия не найдена
   * @throws ConflictException если статус !== CONFIGURING
   */
  async start(userId: string, id: string): Promise<Session> {
    const session = await this.findByIdOrThrow(id, userId);
    this.assertStatus(session, SESSION_STATUS.CONFIGURING, 'запуска');

    const updated = await this.prisma.session.update({
      where: { id },
      data: { status: SESSION_STATUS.RUNNING },
    });

    // Fire-and-forget: оркестрация — долгая операция (минуты)
    setImmediate(() => {
      this.orchestratorService.startSession(id).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
        this.logger.error(`Ошибка оркестратора для сессии ${id}: ${message}`);
      });
    });

    this.logger.log(`Сессия ${id} запущена`);
    return updated;
  }

  /**
   * Пауза сессии: RUNNING → PAUSED.
   *
   * @throws NotFoundException если сессия не найдена
   * @throws ConflictException если статус !== RUNNING
   */
  async pause(userId: string, id: string): Promise<Session> {
    const session = await this.findByIdOrThrow(id, userId);
    this.assertStatus(session, SESSION_STATUS.RUNNING, 'паузы');

    const updated = await this.prisma.session.update({
      where: { id },
      data: { status: SESSION_STATUS.PAUSED },
    });

    setImmediate(() => {
      this.orchestratorService.pauseSession(id).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
        this.logger.error(`Ошибка постановки на паузу для сессии ${id}: ${message}`);
      });
    });

    this.logger.log(`Сессия ${id} поставлена на паузу`);
    return updated;
  }

  /**
   * Возобновление сессии: PAUSED → RUNNING.
   *
   * @throws NotFoundException если сессия не найдена
   * @throws ConflictException если статус !== PAUSED
   */
  async resume(userId: string, id: string, message?: string): Promise<Session> {
    const session = await this.findByIdOrThrow(id, userId);
    this.assertStatus(session, SESSION_STATUS.PAUSED, 'возобновления');

    const updated = await this.prisma.session.update({
      where: { id },
      data: { status: SESSION_STATUS.RUNNING },
    });

    setImmediate(() => {
      this.orchestratorService.resumeSession(id, message).catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : 'Неизвестная ошибка';
        this.logger.error(`Ошибка возобновления сессии ${id}: ${msg}`);
      });
    });

    this.logger.log(`Сессия ${id} возобновлена${message ? ' с сообщением' : ''}`);

    return updated;
  }

  /**
   * Отправка пользовательского сообщения.
   * Создаёт USER_INITIATED раунд (не расходует лимит раундов).
   *
   * @throws NotFoundException если сессия не найдена
   * @throws ConflictException если статус === CONFIGURING
   */
  async sendMessage(userId: string, id: string, content: string): Promise<void> {
    const session = await this.findByIdOrThrow(id, userId);
    const contentLength = content.trim().length;

    if (session.status === SESSION_STATUS.CONFIGURING) {
      throw new ConflictException('Невозможно отправить сообщение: сессия ещё не запущена');
    }

    setImmediate(() => {
      this.orchestratorService.handleUserMessage(id, content).catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : 'Неизвестная ошибка';
        this.logger.error(`Ошибка обработки сообщения для сессии ${id}: ${msg}`);
      });
    });

    this.logger.log(`Пользовательское сообщение для сессии ${id} (длина: ${contentLength})`);
  }

  /**
   * Обновить лимит раундов.
   *
   * Валидация: maxRounds не ниже currentRound и не выше SESSION_LIMITS.MAX_ROUNDS.
   *
   * @throws NotFoundException если сессия не найдена
   * @throws BadRequestException при нарушении лимитов
   */
  async updateMaxRounds(userId: string, id: string, maxRounds: number): Promise<Session> {
    const session = await this.findByIdOrThrow(id, userId);

    if (maxRounds < session.currentRound) {
      throw new BadRequestException(
        `maxRounds (${maxRounds}) не может быть меньше текущего раунда (${session.currentRound})`,
      );
    }

    if (maxRounds > SESSION_LIMITS.MAX_ROUNDS) {
      throw new BadRequestException(`maxRounds не может превышать ${SESSION_LIMITS.MAX_ROUNDS}`);
    }

    return this.prisma.session.update({
      where: { id },
      data: { maxRounds },
    });
  }

  /** Найти сессию или бросить NotFoundException */
  private async findByIdOrThrow(id: string, userId?: string): Promise<Session> {
    const session = await this.prisma.session.findUnique({
      where: { id },
    });

    if (!session || (userId !== undefined && session.userId !== userId)) {
      throw new NotFoundException('Сессия не найдена');
    }

    return session;
  }

  /** Проверка ожидаемого статуса сессии */
  private assertStatus(session: Session, expected: SessionStatus, action: string): void {
    if (session.status !== expected) {
      throw new ConflictException(
        `Невозможно выполнить действие «${action}»: сессия в статусе ${session.status}, требуется ${expected}`,
      );
    }
  }

  /** Автогенерация title из режима и промпта */
  private generateTitle(mode: SessionMode, inputPrompt: string): string {
    const prefix = mode === SESSION_MODE.GENERATE ? 'Генерация' : 'Валидация';
    const truncated =
      inputPrompt.length > AUTO_TITLE_MAX_LENGTH
        ? `${inputPrompt.slice(0, AUTO_TITLE_MAX_LENGTH)}...`
        : inputPrompt;
    return `${prefix}: ${truncated}`;
  }
}
