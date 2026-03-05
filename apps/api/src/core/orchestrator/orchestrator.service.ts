import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  SESSION_STATUS,
  ROUND_TYPE,
  AGENT_ROLE,
  MESSAGE_ROLE,
  SESSION_LIMITS,
  SESSION_MODE,
  type ChatMessage,
  type SessionMode,
  type ToolDefinition,
} from '@oracle/shared';
import { PrismaService } from '@prisma/prisma.service';
import { AgentRunnerService } from '@core/orchestrator/agent-runner.service';
import { RoundManagerService } from '@core/orchestrator/round-manager.service';
import { ScoringParserService } from '@core/orchestrator/scoring-parser.service';
import {
  FINALIZATION_SIGNALS,
  SCORING_INSTRUCTION,
  FINAL_INSTRUCTION,
  TOOL_NAMES,
  DISCUSSION_DIRECTOR_TASK_INSTRUCTION,
  DISCUSSION_DIRECTOR_DECISION_INSTRUCTION,
} from '@core/orchestrator/constants/orchestrator.constants';
import type {
  SessionWithAgents,
  AgentRunnerResult,
  RunAgentParams,
} from '@core/orchestrator/interfaces/orchestrator.types';
import {
  SESSION_EVENT_EMITTER,
  type ISessionEventEmitter,
} from '@core/orchestrator/interfaces/session-event-emitter.interface';
import { IdeasService } from '@core/ideas/ideas.service';
import { ReportsService } from '@core/reports/reports.service';
import { IDEA_LIMITS } from '@core/ideas/constants/ideas.constants';

/** Минимальное количество аналитиков для валидного запуска */
const MIN_ANALYSTS_FOR_START = SESSION_LIMITS.MIN_ANALYSTS;

/**
 * Жёсткая инструкция Директору на старте:
 * он формирует ТЗ аналитикам и не запускает ресерч до их первого ответа.
 */
const INITIAL_DIRECTOR_TASK_INSTRUCTION = [
  'Сформулируй ЧЁТКОЕ задание для аналитиков на этот раунд.',
  'Учитывай все вводные и фильтры сессии.',
  'Если режим сессии VALIDATE — разрешено только валидировать existingIdeas, без генерации нового пула.',
  'Не предлагай собственные идеи и НЕ вызывай call_researcher на этом шаге.',
].join(' ');

/** Fallback-инструкция аналитикам, если в INITIAL ответ Директора пустой */
const ANALYST_TASK_FALLBACK_GENERATE = [
  'Технический fallback: Директор не сформулировал явное задание.',
  'Работайте строго по вводным и фильтрам текущей сессии.',
  'Сформулируйте 2-3 конкретные гипотезы и аргументируйте каждую.',
].join(' ');

/** Fallback-инструкция аналитикам в VALIDATE, если задание Директора пустое */
const ANALYST_TASK_FALLBACK_VALIDATE = [
  'Технический fallback: Директор не сформулировал явное задание.',
  'КРИТИЧЕСКОЕ ПРАВИЛО: режим VALIDATE. Не генерируй новый список идей.',
  'Разбирай только existingIdeas и вводные пользователя, фиксируй слабые места и улучшения.',
].join(' ');

/** Необходимая guard-инструкция аналитикам в режиме VALIDATE (добавляется всегда) */
const VALIDATE_ANALYST_GUARD_INSTRUCTION = [
  'РЕЖИМ VALIDATE: работай только с existingIdeas и вводными пользователя.',
  'Запрещено предлагать новый пул идей, не связанных с existingIdeas.',
  'Если данных мало — явно запроси уточнение/ресерч, но не выдумывай новые направления.',
].join(' ');

/** Fallback-текст постановки задачи от Директора (если директор вернул пустой ответ) */
const DIRECTOR_TASK_FALLBACK_GENERATE = [
  'ЗАДАНИЕ АНАЛИТИКАМ (fallback): работайте строго по вводным и фильтрам этой сессии.',
  'Сформируйте 2-3 конкретные гипотезы, оцените риски и путь к первым деньгам.',
].join(' ');

/** Fallback-текст постановки задачи от Директора для VALIDATE */
const DIRECTOR_TASK_FALLBACK_VALIDATE = [
  'ЗАДАНИЕ АНАЛИТИКАМ (fallback): режим VALIDATE.',
  'Проверяйте только existingIdeas из контекста сессии и вводные пользователя.',
  'Новый пул идей не генерировать; зафиксировать сильные/слабые стороны и рекомендации.',
].join(' ');

/** Результат выполнения discussion loop */
type DiscussionLoopResult = 'completed' | 'paused';

/** Тип агента в сессии */
type SessionAgent = SessionWithAgents['agents'][number];

/**
 * Главный оркестратор сессии.
 *
 * Координирует полный жизненный цикл сессии:
 * CONFIGURING -> INITIAL -> DISCUSSION LOOP -> SCORING -> FINAL -> COMPLETED
 *
 * Все LLM-вызовы делегируются в AgentRunnerService (стриминг через chatStream).
 * Управление раундами и построение контекста — через RoundManagerService.
 * Tool definitions строятся через AgentRunnerService.buildToolDefinitions().
 *
 * Событийная модель стриминга:
 * AgentRunnerService эмитит message:start → N×message:chunk → message:end
 * OrchestratorService эмитит round:start/end, session:status, session:error
 */
@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly pausingSessions = new Set<string>();
  private readonly activeSessionRuns = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentRunner: AgentRunnerService,
    private readonly roundManager: RoundManagerService,
    private readonly ideasService: IdeasService,
    private readonly reportsService: ReportsService,
    private readonly scoringParser: ScoringParserService,
    @Inject(SESSION_EVENT_EMITTER)
    private readonly eventEmitter: ISessionEventEmitter,
  ) {}

  /**
   * Запустить сессию: полный цикл от INITIAL до COMPLETED.
   *
   * Метод долгоживущий (минуты). Вызывается fire-and-forget из SessionsService.
   *
   * @throws Error при невалидном состоянии (неверный статус, нет агентов)
   */
  async startSession(sessionId: string): Promise<void> {
    if (!this.acquireSessionRun(sessionId, 'start')) {
      return;
    }

    this.pausingSessions.delete(sessionId);

    try {
      const session = await this.loadSession(sessionId);
      this.validateSession(session);
      await this.emitSessionStatus(sessionId, SESSION_STATUS.RUNNING, {
        currentRound: session.currentRound,
        totalCostUsd: session.totalCostUsd,
      });

      const director = this.getDirector(session);
      const analysts = this.getAnalysts(session);

      // === INITIAL ===
      const initialResult = await this.runInitialRound(session, director, analysts);
      if (initialResult === 'paused') {
        this.logger.log(`[${sessionId}] Сессия остановлена во время INITIAL по запросу паузы`);
        return;
      }

      // INITIAL всегда создаёт раунд #1 — синхронизируем in-memory для discussion loop
      session.currentRound = 1;

      // === DISCUSSION LOOP ===
      const discussionResult = await this.runDiscussionLoop(session, director, analysts);

      if (discussionResult === 'paused') {
        this.logger.log(`[${sessionId}] Сессия поставлена на паузу, оркестрация остановлена`);
        return;
      }

      // === SCORING ===
      await this.runScoringRound(session, analysts);

      // === FINAL ===
      await this.runFinalRound(session, director);

      // === COMPLETED ===
      await this.completeSession(sessionId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${sessionId}] Критическая ошибка: ${errorMessage}`);
      await this.failSession(sessionId, errorMessage);
    } finally {
      this.pausingSessions.delete(sessionId);
      this.releaseSessionRun(sessionId);
    }
  }

  /**
   * Поставить сессию на паузу.
   *
   * Реальная пауза происходит в discussion loop при перезагрузке статуса сессии.
   * Здесь только эмитим событие (статус уже обновлён SessionsService).
   */
  async pauseSession(sessionId: string): Promise<void> {
    this.pausingSessions.add(sessionId);
    this.logger.log(`[${sessionId}] Пауза запрошена`);
    await this.emitSessionStatus(sessionId, SESSION_STATUS.PAUSED);
  }

  /**
   * Возобновить сессию после паузы.
   *
   * Продолжает discussion loop с currentRound.
   * Если передано сообщение — обрабатывает его как USER_INITIATED раунд перед продолжением.
   */
  async resumeSession(sessionId: string, message?: string): Promise<void> {
    if (!this.acquireSessionRun(sessionId, 'resume')) {
      return;
    }

    this.pausingSessions.delete(sessionId);

    try {
      let session = await this.loadSession(sessionId);
      let director = this.getDirector(session);
      let analysts = this.getAnalysts(session);

      await this.emitSessionStatus(sessionId, SESSION_STATUS.RUNNING, {
        currentRound: session.currentRound,
        totalCostUsd: session.totalCostUsd,
      });

      // Если есть сообщение — сохранить в текущий раунд и запросить реакцию Директора.
      if (message) {
        await this.addResumeMessageAndDirectorResponse(session, director, message);
        session = await this.loadSession(sessionId);
        director = this.getDirector(session);
        analysts = this.getAnalysts(session);
      }

      await this.continueFromDiscussionLoop(sessionId, session, director, analysts);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${sessionId}] Ошибка при возобновлении: ${errorMessage}`);
      await this.failSession(sessionId, errorMessage);
    } finally {
      this.pausingSessions.delete(sessionId);
      this.releaseSessionRun(sessionId);
    }
  }

  /**
   * Обработать пользовательское сообщение.
   *
   * Создаёт USER_INITIATED раунд. Не расходует лимит обычных раундов.
   * Директор → Аналитики (параллельно) → Директор синтезирует.
   * При ошибке — emitSessionError (НЕ failSession, сессия продолжает работу).
   */
  async handleUserMessage(sessionId: string, content: string): Promise<void> {
    try {
      const session = await this.loadSession(sessionId);
      const director = this.getDirector(session);
      const analysts = this.getAnalysts(session);

      // Создать USER_INITIATED раунд
      const round = await this.roundManager.createRound(sessionId, ROUND_TYPE.USER_INITIATED);
      this.logRoundStarted(sessionId, round.number, round.type);
      this.eventEmitter.emitRoundStarted(sessionId, {
        roundId: round.id,
        number: round.number,
        type: round.type,
      });

      // Сохранить пользовательское сообщение в БД
      await this.saveUserMessage(sessionId, round.id, content);

      // Директор отвечает (buildAgentContext включает user message из БД)
      const directorContext = await this.roundManager.buildAgentContext(
        director,
        session,
        round.number,
      );
      await this.runAgentWithLogging('USER_INITIATED.DIRECTOR_TASK', {
        agent: director,
        messages: directorContext,
        sessionId,
        roundId: round.id,
        tools: this.buildTools(director, { allowResearcherCall: false }),
        session,
      });

      // Аналитики отвечают параллельно
      const analystResults = await Promise.allSettled(
        analysts.map(async (analyst) => {
          const ctx = await this.roundManager.buildAgentContext(analyst, session, round.number);
          return this.runAgentWithLogging('USER_INITIATED.ANALYST', {
            agent: analyst,
            messages: ctx,
            sessionId,
            roundId: round.id,
            tools: this.buildTools(analyst),
            session,
          });
        }),
      );
      this.logSettledResults(sessionId, 'USER_INITIATED аналитики', analystResults);
      await this.parseAndPersistIdeasFromResults(sessionId, round.number, analysts, analystResults);

      // Директор синтезирует (buildAgentContext включает ответы аналитиков из БД)
      const synthesisContext = await this.roundManager.buildAgentContext(
        director,
        session,
        round.number,
      );
      await this.runAgentWithLogging('USER_INITIATED.DIRECTOR_SYNTHESIS', {
        agent: director,
        messages: synthesisContext,
        sessionId,
        roundId: round.id,
        tools: this.buildTools(director, { allowResearcherCall: false }),
        session,
      });

      await this.roundManager.completeRound(round.id);
      this.logRoundCompleted(sessionId, round.number, round.type);
      this.eventEmitter.emitRoundCompleted(sessionId, {
        roundId: round.id,
        number: round.number,
      });

      this.logger.log(`[${sessionId}] Пользовательское сообщение обработано`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${sessionId}] Ошибка обработки сообщения: ${errorMessage}`);
      // emitSessionError, но НЕ failSession — сессия продолжает работу
      this.eventEmitter.emitSessionError(sessionId, errorMessage);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Приватные методы: фазы сессии
  // ──────────────────────────────────────────────────────────────────────────

  /** INITIAL: Директор задаёт направление, аналитики генерируют идеи */
  private async runInitialRound(
    session: SessionWithAgents,
    director: SessionAgent,
    analysts: SessionAgent[],
  ): Promise<DiscussionLoopResult> {
    const round = await this.roundManager.createRound(session.id, ROUND_TYPE.INITIAL);
    this.logRoundStarted(session.id, round.number, round.type);
    this.eventEmitter.emitRoundStarted(session.id, {
      roundId: round.id,
      number: round.number,
      type: round.type,
    });

    await this.updateCurrentRound(session.id, round.number);

    // Директор: buildAgentContext (system prompt + session context) + inputPrompt как user trigger
    const directorContext = await this.roundManager.buildAgentContext(
      director,
      session,
      round.number,
    );
    const directorMessages: ChatMessage[] = [
      ...directorContext,
      {
        role: 'user',
        content: INITIAL_DIRECTOR_TASK_INSTRUCTION,
      },
    ];

    const directorResult = await this.runAgentWithLogging('INITIAL.DIRECTOR_TASK', {
      agent: director,
      messages: directorMessages,
      sessionId: session.id,
      roundId: round.id,
      tools: this.buildTools(director, { allowResearcherCall: false }),
      session,
    });
    const resolvedDirectorTask = await this.ensureDirectorTaskVisible(
      session.id,
      directorResult.messageId,
      session.mode,
      directorResult.content,
    );

    if (await this.shouldPause(session.id)) {
      return 'paused';
    }

    // Аналитики: buildAgentContext уже содержит сообщение Директора из БД
    const analystResults = await Promise.allSettled(
      analysts.map(async (analyst) => {
        const context = await this.roundManager.buildAgentContext(analyst, session, round.number);
        const analystMessages = this.buildAnalystMessages(context, session, resolvedDirectorTask);
        return this.runAgentWithLogging('INITIAL.ANALYST', {
          agent: analyst,
          messages: analystMessages,
          sessionId: session.id,
          roundId: round.id,
          tools: this.buildTools(analyst),
          session,
        });
      }),
    );

    this.logSettledResults(session.id, 'INITIAL', analystResults);
    await this.parseAndPersistIdeasFromResults(session.id, round.number, analysts, analystResults);

    if (await this.shouldPause(session.id)) {
      return 'paused';
    }

    // Директор синтезирует: buildAgentContext включает все ответы аналитиков из БД
    const synthesisContext = await this.roundManager.buildAgentContext(
      director,
      session,
      round.number,
    );
    await this.runAgentWithLogging('INITIAL.DIRECTOR_SYNTHESIS', {
      agent: director,
      messages: synthesisContext,
      sessionId: session.id,
      roundId: round.id,
      tools: this.buildTools(director, { allowResearcherCall: false }),
      session,
    });

    if (await this.shouldPause(session.id)) {
      return 'paused';
    }

    await this.roundManager.completeRound(round.id);
    this.logRoundCompleted(session.id, round.number, round.type);
    this.eventEmitter.emitRoundCompleted(session.id, {
      roundId: round.id,
      number: round.number,
    });
    return 'completed';
  }

  /** DISCUSSION LOOP: раунды обсуждения до финализации или лимита */
  private async runDiscussionLoop(
    session: SessionWithAgents,
    director: SessionAgent,
    analysts: SessionAgent[],
  ): Promise<DiscussionLoopResult> {
    let currentRound = session.currentRound; // уже учитывает INITIAL раунд

    while (currentRound < session.maxRounds) {
      if (await this.shouldPause(session.id)) {
        this.logger.log(`[${session.id}] Сессия на паузе, discussion loop остановлен`);
        return 'paused';
      }

      const round = await this.roundManager.createRound(session.id, ROUND_TYPE.DISCUSSION);
      this.logRoundStarted(session.id, round.number, round.type);
      this.eventEmitter.emitRoundStarted(session.id, {
        roundId: round.id,
        number: round.number,
        type: round.type,
      });

      // Директор задаёт фокус раунда (без call_researcher на этапе постановки задачи)
      const directorTaskContext = await this.roundManager.buildAgentContext(
        director,
        session,
        round.number,
      );
      const directorTaskMessages: ChatMessage[] = [
        ...directorTaskContext,
        { role: 'user', content: DISCUSSION_DIRECTOR_TASK_INSTRUCTION },
      ];
      const directorTaskResult = await this.runAgentWithLogging('DISCUSSION.DIRECTOR_TASK', {
        agent: director,
        messages: directorTaskMessages,
        sessionId: session.id,
        roundId: round.id,
        tools: this.buildTools(director, { allowResearcherCall: false }),
        session,
      });
      const resolvedDirectorTask = await this.ensureDirectorTaskVisible(
        session.id,
        directorTaskResult.messageId,
        session.mode,
        directorTaskResult.content,
      );

      if (await this.shouldPause(session.id)) {
        this.logger.log(
          `[${session.id}] Пауза после постановки задачи Директором в раунде ${round.number}`,
        );
        return 'paused';
      }

      const analystResults = await Promise.allSettled(
        analysts.map(async (analyst) => {
          const context = await this.roundManager.buildAgentContext(analyst, session, round.number);
          const analystMessages = this.buildAnalystMessages(context, session, resolvedDirectorTask);
          return this.runAgentWithLogging('DISCUSSION.ANALYST', {
            agent: analyst,
            messages: analystMessages,
            sessionId: session.id,
            roundId: round.id,
            tools: this.buildTools(analyst),
            session,
          });
        }),
      );

      this.logSettledResults(session.id, `DISCUSSION ${round.number}`, analystResults);
      await this.parseAndPersistIdeasFromResults(
        session.id,
        round.number,
        analysts,
        analystResults,
      );

      if (await this.shouldPause(session.id)) {
        this.logger.log(`[${session.id}] Пауза после ответов аналитиков в раунде ${round.number}`);
        return 'paused';
      }

      // После ответов аналитиков Директор принимает решение по следующему шагу
      const directorContext = await this.roundManager.buildAgentContext(
        director,
        session,
        round.number,
      );
      const directorMessages: ChatMessage[] = [
        ...directorContext,
        { role: 'user', content: DISCUSSION_DIRECTOR_DECISION_INSTRUCTION },
      ];
      const directorResult = await this.runAgentWithLogging('DISCUSSION.DIRECTOR_DECISION', {
        agent: director,
        messages: directorMessages,
        sessionId: session.id,
        roundId: round.id,
        tools: this.buildTools(director),
        session,
      });

      if (await this.shouldPause(session.id)) {
        this.logger.log(`[${session.id}] Пауза после решения Директора в раунде ${round.number}`);
        return 'paused';
      }

      if (this.containsFinalizationSignal(directorResult.content)) {
        this.logger.log(
          `[${session.id}] Директор сигнализирует финализацию в раунде ${round.number}`,
        );
        await this.roundManager.completeRound(round.id);
        this.logRoundCompleted(session.id, round.number, round.type);
        await this.updateCurrentRound(session.id, round.number);
        this.eventEmitter.emitRoundCompleted(session.id, {
          roundId: round.id,
          number: round.number,
        });
        currentRound = round.number;
        return 'completed';
      }

      if (this.containsResearchSignal(directorResult)) {
        await this.prisma.round.update({
          where: { id: round.id },
          data: { type: ROUND_TYPE.RESEARCH },
        });

        await this.roundManager.completeRound(round.id);
        this.logRoundCompleted(session.id, round.number, ROUND_TYPE.RESEARCH);
        await this.updateCurrentRound(session.id, round.number);
        this.eventEmitter.emitRoundCompleted(session.id, {
          roundId: round.id,
          number: round.number,
        });
        currentRound = round.number;
        continue;
      }

      await this.roundManager.completeRound(round.id);
      this.logRoundCompleted(session.id, round.number, round.type);
      await this.updateCurrentRound(session.id, round.number);
      this.eventEmitter.emitRoundCompleted(session.id, {
        roundId: round.id,
        number: round.number,
      });
      currentRound = round.number;
    }

    this.logger.log(
      `[${session.id}] Лимит раундов (${session.maxRounds}) достигнут, переход к скорингу`,
    );
    return 'completed';
  }

  /** SCORING: каждый аналитик оценивает идеи по ICE/RICE */
  private async runScoringRound(
    session: SessionWithAgents,
    analysts: SessionAgent[],
  ): Promise<void> {
    const round = await this.roundManager.createRound(session.id, ROUND_TYPE.SCORING);
    this.logRoundStarted(session.id, round.number, round.type);
    this.eventEmitter.emitRoundStarted(session.id, {
      roundId: round.id,
      number: round.number,
      type: round.type,
    });

    await this.updateCurrentRound(session.id, round.number);

    const scoringResults = await Promise.allSettled(
      analysts.map(async (analyst) => {
        const context = await this.roundManager.buildAgentContext(analyst, session, round.number);
        const messagesWithScoring: ChatMessage[] = [
          ...context,
          { role: 'user', content: SCORING_INSTRUCTION },
        ];
        return this.runAgentWithLogging('SCORING.ANALYST', {
          agent: analyst,
          messages: messagesWithScoring,
          sessionId: session.id,
          roundId: round.id,
          tools: this.buildTools(analyst),
          session,
        });
      }),
    );

    this.logSettledResults(session.id, 'SCORING', scoringResults);

    // Парсим скоры из ответов аналитиков и сохраняем в БД
    await this.parseScoringResults(session.id, analysts, scoringResults);

    await this.roundManager.completeRound(round.id);
    this.logRoundCompleted(session.id, round.number, round.type);
    this.eventEmitter.emitRoundCompleted(session.id, {
      roundId: round.id,
      number: round.number,
    });
  }

  /** FINAL: Директор формирует итоговый отчёт */
  private async runFinalRound(session: SessionWithAgents, director: SessionAgent): Promise<void> {
    const round = await this.roundManager.createRound(session.id, ROUND_TYPE.FINAL);
    this.logRoundStarted(session.id, round.number, round.type);
    this.eventEmitter.emitRoundStarted(session.id, {
      roundId: round.id,
      number: round.number,
      type: round.type,
    });

    await this.updateCurrentRound(session.id, round.number);

    const context = await this.roundManager.buildAgentContext(director, session, round.number);
    const finalMessages: ChatMessage[] = [...context, { role: 'user', content: FINAL_INSTRUCTION }];

    await this.runAgentWithLogging('FINAL.DIRECTOR', {
      agent: director,
      messages: finalMessages,
      sessionId: session.id,
      roundId: round.id,
      tools: this.buildTools(director, { allowResearcherCall: false }),
      session,
    });

    await this.roundManager.completeRound(round.id);
    this.logRoundCompleted(session.id, round.number, round.type);
    this.eventEmitter.emitRoundCompleted(session.id, {
      roundId: round.id,
      number: round.number,
    });

    // Финализируем ТОП идеи, создаём отчёт
    const { finalized, rejected } = await this.ideasService.finalizeTopIdeas(
      session.id,
      IDEA_LIMITS.DEFAULT_TOP_COUNT,
    );
    this.logger.log(
      `[${session.id}] Финализировано ${finalized.length} идей, отклонено ${rejected.length}`,
    );

    const report = await this.reportsService.create(session.id);
    this.eventEmitter.emitReportReady(session.id, report.id);
  }

  /**
   * Продолжить сессию после паузы: discussion loop -> scoring -> final -> completed.
   */
  private async continueFromDiscussionLoop(
    sessionId: string,
    session: SessionWithAgents,
    director: SessionAgent,
    analysts: SessionAgent[],
  ): Promise<void> {
    const discussionResult = await this.runDiscussionLoop(session, director, analysts);

    if (discussionResult === 'paused') {
      this.logger.log(`[${sessionId}] Повторная пауза после resume`);
      return;
    }

    await this.runScoringRound(session, analysts);
    await this.runFinalRound(session, director);
    await this.completeSession(sessionId);
  }

  private async addResumeMessageAndDirectorResponse(
    session: SessionWithAgents,
    director: SessionAgent,
    message: string,
  ): Promise<void> {
    const latestRound = await this.getLatestRoundOrThrow(session.id);

    await this.saveUserMessage(session.id, latestRound.id, message);

    const directorContext = await this.roundManager.buildAgentContext(
      director,
      session,
      latestRound.number,
    );
    const resumeInstruction: ChatMessage = {
      role: 'user',
      content: `[Пользователь: ${message}]. Учти это и решай как продолжить.`,
    };

    await this.runAgentWithLogging('RESUME.DIRECTOR', {
      agent: director,
      messages: [...directorContext, resumeInstruction],
      sessionId: session.id,
      roundId: latestRound.id,
      tools: this.buildTools(director, { allowResearcherCall: false }),
      session,
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Приватные методы: вспомогательные
  // ──────────────────────────────────────────────────────────────────────────

  /** Построить tool definitions для агента */
  private buildTools(
    agent: SessionAgent,
    options?: { allowResearcherCall?: boolean },
  ): ToolDefinition[] | undefined {
    const isDirector = agent.role === AGENT_ROLE.DIRECTOR;
    const canUseResearcherTool = options?.allowResearcherCall ?? true;
    const tools = this.agentRunner.buildToolDefinitions(agent, isDirector && canUseResearcherTool);
    return tools.length > 0 ? tools : undefined;
  }

  private async runAgentWithLogging(
    phase: string,
    params: RunAgentParams,
  ): Promise<AgentRunnerResult> {
    const result = await this.agentRunner.runAgent(params);
    this.logger.debug(
      `[${params.sessionId}] ${phase}: ${params.agent.name} (${params.agent.modelId}) ` +
        `tokens=${result.tokensInput}/${result.tokensOutput}, cost=$${result.costUsd.toFixed(4)}`,
    );
    return result;
  }

  private logRoundStarted(sessionId: string, roundNumber: number, roundType: string): void {
    this.logger.log(`[${sessionId}] Раунд ${roundNumber} (${roundType}) начат`);
  }

  private logRoundCompleted(sessionId: string, roundNumber: number, roundType: string): void {
    this.logger.log(`[${sessionId}] Раунд ${roundNumber} (${roundType}) завершён`);
  }

  /** Сохранить пользовательское сообщение в БД */
  private async saveUserMessage(
    sessionId: string,
    roundId: string,
    content: string,
  ): Promise<void> {
    await this.prisma.message.create({
      data: {
        sessionId,
        roundId,
        role: MESSAGE_ROLE.USER,
        content,
        modelUsed: 'user',
        tokensInput: 0,
        tokensOutput: 0,
        costUsd: 0,
        latencyMs: 0,
      },
    });
  }

  /** Загрузить сессию с агентами */
  private async loadSession(sessionId: string): Promise<SessionWithAgents> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { agents: true },
    });

    if (!session) {
      throw new Error(`Сессия ${sessionId} не найдена`);
    }

    return session as SessionWithAgents;
  }

  /** Перезагрузить сессию (для проверки статуса в loop) */
  private async reloadSession(sessionId: string): Promise<{ status: string }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });

    if (!session) {
      throw new Error(`Сессия ${sessionId} не найдена при перезагрузке`);
    }

    return session;
  }

  private async getLatestRoundOrThrow(sessionId: string): Promise<{
    id: string;
    number: number;
  }> {
    const round = await this.prisma.round.findFirst({
      where: { sessionId },
      orderBy: { number: 'desc' },
      select: { id: true, number: true },
    });

    if (!round) {
      throw new Error(`Для сессии ${sessionId} не найден ни один раунд`);
    }

    return round;
  }

  /** Валидация сессии перед запуском */
  private validateSession(session: SessionWithAgents): void {
    if (session.status !== SESSION_STATUS.RUNNING) {
      throw new Error(
        `Невозможно запустить сессию: статус ${session.status}, требуется ${SESSION_STATUS.RUNNING}`,
      );
    }

    const directors = session.agents.filter((a) => a.role === AGENT_ROLE.DIRECTOR);
    if (directors.length === 0) {
      throw new Error('В сессии отсутствует Директор');
    }

    const analysts = session.agents.filter((a) => a.role === AGENT_ROLE.ANALYST);
    if (analysts.length < MIN_ANALYSTS_FOR_START) {
      throw new Error(`Минимум ${MIN_ANALYSTS_FOR_START} аналитика, найдено: ${analysts.length}`);
    }
  }

  /** Получить Директора */
  private getDirector(session: SessionWithAgents): SessionAgent {
    const director = session.agents.find((a) => a.role === AGENT_ROLE.DIRECTOR);
    if (!director) {
      throw new Error('Директор не найден');
    }
    return director;
  }

  /** Получить аналитиков */
  private getAnalysts(session: SessionWithAgents): SessionAgent[] {
    return session.agents.filter((a) => a.role === AGENT_ROLE.ANALYST);
  }

  /** Обновить currentRound в сессии */
  private async updateCurrentRound(sessionId: string, roundNumber: number): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { currentRound: roundNumber },
    });
  }

  /** Завершить сессию успешно */
  private async completeSession(sessionId: string): Promise<void> {
    const completedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SESSION_STATUS.COMPLETED,
        completedAt: new Date(),
      },
      select: {
        currentRound: true,
        totalCostUsd: true,
      },
    });

    await this.emitSessionStatus(sessionId, SESSION_STATUS.COMPLETED, completedSession);
    this.roundManager.clearSummaryCache(sessionId);
    this.eventEmitter.emitSessionCompleted(sessionId);
    this.logger.log(`[${sessionId}] Сессия завершена успешно`);
  }

  /** Перевести сессию в статус ERROR */
  private async failSession(sessionId: string, error: string): Promise<void> {
    const erroredSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SESSION_STATUS.ERROR },
      select: {
        currentRound: true,
        totalCostUsd: true,
      },
    });

    await this.emitSessionStatus(sessionId, SESSION_STATUS.ERROR, erroredSession);
    this.roundManager.clearSummaryCache(sessionId);
    this.eventEmitter.emitSessionError(sessionId, error);
  }

  /** Проверить наличие сигнала финализации в ответе Директора */
  private containsFinalizationSignal(content: string): boolean {
    const upper = content.toUpperCase();
    return FINALIZATION_SIGNALS.some((signal) => upper.includes(signal));
  }

  private async parseAndPersistIdeasFromResults(
    sessionId: string,
    roundNumber: number,
    analysts: SessionAgent[],
    results: PromiseSettledResult<AgentRunnerResult>[],
  ): Promise<void> {
    let totalCreated = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== 'fulfilled') {
        continue;
      }

      const analyst = analysts[i];
      const parsedIdeas = this.ideasService.parseIdeasFromText(result.value.content);
      if (parsedIdeas.length === 0) {
        continue;
      }

      const created = await this.ideasService.createFromAgentResponse(
        sessionId,
        analyst.id,
        roundNumber,
        parsedIdeas,
      );
      totalCreated += created.length;
    }

    if (totalCreated > 0) {
      this.logger.log(`[${sessionId}] Раунд ${roundNumber}: сохранено ${totalCreated} новых идей`);
    }
  }

  private containsResearchSignal(result: { toolCalls?: Array<{ tool: string }> }): boolean {
    return (result.toolCalls ?? []).some(
      (toolCall) => toolCall.tool === TOOL_NAMES.CALL_RESEARCHER,
    );
  }

  private hasUsableDirectorTask(content: string): boolean {
    return content.trim().length > 0;
  }

  private buildAnalystMessages(
    context: ChatMessage[],
    session: Pick<SessionWithAgents, 'mode' | 'inputPrompt' | 'existingIdeas'>,
    directorTaskContent: string,
  ): ChatMessage[] {
    const messages = [...context];
    if (session.mode === SESSION_MODE.VALIDATE) {
      messages.push({ role: 'system', content: VALIDATE_ANALYST_GUARD_INSTRUCTION });
    }

    const resolvedTask = this.hasUsableDirectorTask(directorTaskContent)
      ? directorTaskContent
      : this.buildAnalystFallbackInstruction(session.mode);
    const roundInstruction =
      session.mode === SESSION_MODE.VALIDATE
        ? [
            'КРИТИЧЕСКОЕ ПРАВИЛО: режим VALIDATE. Разрешено обсуждать только existingIdeas и вводные пользователя.',
            `Вводные пользователя:\n${session.inputPrompt}`,
            `existingIdeas:\n${session.existingIdeas ?? 'N/A'}`,
            `Задание Директора на этот ход:\n${resolvedTask}`,
          ].join('\n\n')
        : `Задание Директора на этот ход:\n${resolvedTask}`;
    messages.push({ role: 'user', content: roundInstruction });

    return messages;
  }

  private buildAnalystFallbackInstruction(mode: SessionMode): string {
    return mode === SESSION_MODE.VALIDATE
      ? ANALYST_TASK_FALLBACK_VALIDATE
      : ANALYST_TASK_FALLBACK_GENERATE;
  }

  private buildDirectorTaskFallback(mode: SessionMode): string {
    return mode === SESSION_MODE.VALIDATE
      ? DIRECTOR_TASK_FALLBACK_VALIDATE
      : DIRECTOR_TASK_FALLBACK_GENERATE;
  }

  private async ensureDirectorTaskVisible(
    sessionId: string,
    messageId: string,
    mode: SessionMode,
    content: string,
  ): Promise<string> {
    if (this.hasUsableDirectorTask(content)) {
      return content;
    }

    const fallbackTask = this.buildDirectorTaskFallback(mode);
    await this.prisma.message.update({
      where: { id: messageId },
      data: { content: fallbackTask },
    });
    this.eventEmitter.emitMessageChunk(sessionId, {
      messageId,
      chunk: fallbackTask,
    });
    this.logger.warn(`[${sessionId}] Пустая постановка задачи Директора, применён fallback`);
    return fallbackTask;
  }

  private acquireSessionRun(sessionId: string, source: 'start' | 'resume'): boolean {
    if (this.activeSessionRuns.has(sessionId)) {
      this.logger.warn(
        `[${sessionId}] Пропуск ${source}: уже выполняется другой оркестраторный цикл`,
      );
      return false;
    }

    this.activeSessionRuns.add(sessionId);
    return true;
  }

  private releaseSessionRun(sessionId: string): void {
    this.activeSessionRuns.delete(sessionId);
  }

  private async shouldPause(sessionId: string): Promise<boolean> {
    if (!this.pausingSessions.has(sessionId)) {
      const freshSession = await this.reloadSession(sessionId);
      if (freshSession.status !== SESSION_STATUS.PAUSED) {
        return false;
      }
      // Передаём уже прочитанный статус, чтобы избежать второго DB-запроса
      await this.ensurePausedStatus(sessionId, freshSession.status);
    } else {
      await this.ensurePausedStatus(sessionId);
    }

    this.pausingSessions.add(sessionId);
    return true;
  }

  /**
   * Убедиться что сессия в PAUSED статусе и уведомить клиентов.
   *
   * @param currentStatus - Уже известный статус (из предыдущего DB-чтения).
   *   Если не передан — будет выполнено дополнительное DB-чтение.
   */
  private async ensurePausedStatus(sessionId: string, currentStatus?: string): Promise<void> {
    const status = currentStatus ?? (await this.reloadSession(sessionId)).status;

    if (status !== SESSION_STATUS.PAUSED) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { status: SESSION_STATUS.PAUSED },
      });
    }

    await this.emitSessionStatus(sessionId, SESSION_STATUS.PAUSED);
  }

  private async emitSessionStatus(
    sessionId: string,
    status: string,
    progress?: { currentRound: number; totalCostUsd: number },
  ): Promise<void> {
    const resolvedProgress = progress ?? (await this.loadSessionProgress(sessionId));
    this.eventEmitter.emitSessionStatusChanged(sessionId, {
      status,
      currentRound: resolvedProgress.currentRound,
      totalCostUsd: resolvedProgress.totalCostUsd,
    });
  }

  private async loadSessionProgress(
    sessionId: string,
  ): Promise<{ currentRound: number; totalCostUsd: number }> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        currentRound: true,
        totalCostUsd: true,
      },
    });

    if (!session) {
      throw new Error(`Сессия ${sessionId} не найдена при загрузке прогресса`);
    }

    return session;
  }

  /**
   * Парсинг ICE/RICE скоров из ответов аналитиков после SCORING раунда.
   *
   * Для каждого fulfilled результата:
   * 1. Парсит текст через ScoringParserService
   * 2. Сопоставляет названия идей с PROPOSED/ACTIVE идеями в БД
   * 3. Вызывает IdeasService.addScore() для каждого совпадения
   *
   * @param sessionId - ID сессии
   * @param analysts - Список аналитиков (в том же порядке что и results)
   * @param results - Результаты Promise.allSettled от runAgent
   */
  private async parseScoringResults(
    sessionId: string,
    analysts: SessionAgent[],
    results: PromiseSettledResult<AgentRunnerResult>[],
  ): Promise<void> {
    const activeIdeas = await this.ideasService.findActiveForScoring(sessionId);

    if (activeIdeas.length === 0) {
      this.logger.warn(`[${sessionId}] Нет активных идей для скоринга`);
      return;
    }

    // Строим Map: нормализованное название → ideaId
    const titleToIdea = new Map<string, string>();
    for (const idea of activeIdeas) {
      titleToIdea.set(this.scoringParser.normalizeIdeaTitle(idea.title), idea.id);
    }

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== 'fulfilled') continue;

      const analyst = analysts[i];
      const parsed = this.scoringParser.parseAnalystScoring(result.value.content);

      for (const [parsedTitle, score] of parsed) {
        const normalized = this.scoringParser.normalizeIdeaTitle(parsedTitle);

        // Exact match
        let ideaId = titleToIdea.get(normalized);

        // Fallback: substring matching
        if (!ideaId) {
          for (const [dbTitle, dbId] of titleToIdea) {
            if (dbTitle.includes(normalized) || normalized.includes(dbTitle)) {
              ideaId = dbId;
              break;
            }
          }
        }

        if (ideaId) {
          await this.ideasService.addScore(ideaId, analyst.id, score);
        } else {
          this.logger.warn(
            `[${sessionId}] Скоринг: не найдена идея "${parsedTitle}" от ${analyst.name}`,
          );
        }
      }
    }
  }

  /** Логировать результаты Promise.allSettled */
  private logSettledResults(
    sessionId: string,
    phase: string,
    results: PromiseSettledResult<unknown>[],
  ): void {
    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;

    if (rejected > 0) {
      this.logger.warn(`[${sessionId}] ${phase}: ${fulfilled} успешно, ${rejected} ошибок`);
    } else {
      this.logger.debug(`[${sessionId}] ${phase}: все ${fulfilled} агентов завершили`);
    }
  }
}
