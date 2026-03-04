import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Agent } from '@prisma/client';
import { AGENT_ROLE, SESSION_LIMITS, type AgentRole } from '@oracle/shared';
import { PrismaService } from '@prisma/prisma.service';
import { PromptsService } from '@core/prompts/prompts.service';
import { CreateAgentDto } from '@core/agents/dto/create-agent.dto';
import {
  DEFAULT_AGENT_NAMES,
  generateAnalystName,
} from '@core/agents/constants/agent-names.constants';

/**
 * Сервис управления агентами.
 *
 * Отвечает за создание агентов для сессии с валидацией состава,
 * разрешением системных промптов и автогенерацией имён.
 */
@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly promptsService: PromptsService,
  ) {}

  /**
   * Создать агентов для сессии.
   *
   * Валидирует состав (1 директор, 2-6 аналитиков, 1 ресерчер),
   * разрешает системные промпты по приоритету, генерирует имена.
   *
   * @throws BadRequestException если состав агентов невалиден
   * @throws BadRequestException если промпт не найден
   */
  async createForSession(sessionId: string, agentDtos: CreateAgentDto[]): Promise<Agent[]> {
    this.validateAgentComposition(agentDtos);

    // Индексы аналитиков назначаются синхронно ДО запуска Promise.all,
    // чтобы избежать race condition при конкурентных resolveSystemPrompt.
    let analystIndex = 0;
    const dtosWithIndex = agentDtos.map((dto) => ({
      dto,
      analystIdx: dto.role === AGENT_ROLE.ANALYST ? ++analystIndex : 0,
    }));

    const agentDataArray = await Promise.all(
      dtosWithIndex.map(async ({ dto, analystIdx }) => {
        const systemPrompt = await this.resolveSystemPrompt(dto);
        const name = this.generateName(dto, analystIdx);

        return {
          sessionId,
          role: dto.role,
          name,
          provider: dto.provider,
          modelId: dto.modelId,
          systemPrompt,
          webSearchEnabled: dto.webSearchEnabled ?? true,
        };
      }),
    );

    // $transaction с create вместо createMany (createMany не возвращает записи)
    const agents = await this.prisma.$transaction(
      agentDataArray.map((data) => this.prisma.agent.create({ data })),
    );

    this.logger.log(`Создано ${agents.length} агентов для сессии ${sessionId}`);

    return agents;
  }

  /** Получить всех агентов сессии, отсортированных по дате создания */
  async findBySession(sessionId: string): Promise<Agent[]> {
    return this.prisma.agent.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Валидация состава агентов:
   * - ровно 1 DIRECTOR
   * - от MIN_ANALYSTS до MAX_ANALYSTS ANALYST
   * - ровно 1 RESEARCHER
   */
  private validateAgentComposition(agents: CreateAgentDto[]): void {
    const directors = agents.filter((a) => a.role === AGENT_ROLE.DIRECTOR);
    const analysts = agents.filter((a) => a.role === AGENT_ROLE.ANALYST);
    const researchers = agents.filter((a) => a.role === AGENT_ROLE.RESEARCHER);

    if (directors.length !== 1) {
      throw new BadRequestException(`Требуется ровно 1 директор, получено: ${directors.length}`);
    }

    if (
      analysts.length < SESSION_LIMITS.MIN_ANALYSTS ||
      analysts.length > SESSION_LIMITS.MAX_ANALYSTS
    ) {
      throw new BadRequestException(
        `Количество аналитиков должно быть от ${SESSION_LIMITS.MIN_ANALYSTS} до ${SESSION_LIMITS.MAX_ANALYSTS}, получено: ${analysts.length}`,
      );
    }

    if (researchers.length !== 1) {
      throw new BadRequestException(`Требуется ровно 1 ресерчер, получено: ${researchers.length}`);
    }
  }

  /**
   * Разрешение системного промпта по приоритету:
   * 1. customSystemPrompt — если передан напрямую
   * 2. promptTemplateId — загрузить из БД
   * 3. PromptsService.findDefault(role, modelId) — дефолтный
   */
  private async resolveSystemPrompt(dto: CreateAgentDto): Promise<string> {
    if (dto.customSystemPrompt) {
      return dto.customSystemPrompt;
    }

    if (dto.promptTemplateId) {
      const template = await this.prisma.promptTemplate.findUnique({
        where: { id: dto.promptTemplateId },
      });
      if (!template) {
        throw new BadRequestException(`Шаблон промпта с ID ${dto.promptTemplateId} не найден`);
      }
      return template.content;
    }

    const defaultPrompt = await this.promptsService.findDefault(dto.role as AgentRole, dto.modelId);
    if (!defaultPrompt) {
      throw new BadRequestException(
        `Дефолтный промпт для роли ${dto.role} и модели ${dto.modelId} не найден`,
      );
    }
    return defaultPrompt.content;
  }

  /** Генерация имени агента (авто если не задано) */
  private generateName(dto: CreateAgentDto, analystIndex: number): string {
    if (dto.name) return dto.name;

    if (dto.role === AGENT_ROLE.DIRECTOR) return DEFAULT_AGENT_NAMES.DIRECTOR;
    if (dto.role === AGENT_ROLE.RESEARCHER) return DEFAULT_AGENT_NAMES.RESEARCHER;

    return generateAnalystName(analystIndex);
  }
}
