import { Module } from '@nestjs/common';
import { LlmModule } from '@integrations/llm/llm.module';
import { PromptsModule } from '@core/prompts/prompts.module';
import { SessionGatewayModule } from '@transport/gateway/session-gateway.module';
import { SessionGateway } from '@transport/gateway/session.gateway';
import { IdeasModule } from '@core/ideas/ideas.module';
import { ReportsModule } from '@core/reports/reports.module';
import { OrchestratorService } from '@core/orchestrator/orchestrator.service';
import { AgentRunnerService } from '@core/orchestrator/agent-runner.service';
import { RoundManagerService } from '@core/orchestrator/round-manager.service';
import { ScoringParserService } from '@core/orchestrator/scoring-parser.service';
import { SESSION_EVENT_EMITTER } from '@core/orchestrator/interfaces/session-event-emitter.interface';

/**
 * Модуль оркестрации сессий.
 *
 * Координирует жизненный цикл сессии: INITIAL -> DISCUSSION -> SCORING -> FINAL.
 * Импортирует LlmModule, PromptsModule, SessionGatewayModule, IdeasModule, ReportsModule.
 * НЕ импортирует SessionsModule (избежание circular dependency).
 *
 * SESSION_EVENT_EMITTER → SessionGateway (WebSocket real-time стриминг).
 * Экспортирует OrchestratorService для использования в SessionsModule.
 */
@Module({
  imports: [LlmModule, PromptsModule, SessionGatewayModule, IdeasModule, ReportsModule],
  providers: [
    OrchestratorService,
    AgentRunnerService,
    RoundManagerService,
    ScoringParserService,
    {
      provide: SESSION_EVENT_EMITTER,
      useExisting: SessionGateway,
    },
  ],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
