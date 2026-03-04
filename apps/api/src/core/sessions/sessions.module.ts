import { Module } from '@nestjs/common';
import { AgentsModule } from '@core/agents/agents.module';
import { OrchestratorModule } from '@core/orchestrator/orchestrator.module';
import { SessionsController } from '@core/sessions/sessions.controller';
import { SessionsService } from '@core/sessions/sessions.service';

/**
 * Модуль управления сессиями.
 *
 * Импортирует AgentsModule для создания агентов при создании сессии.
 * Импортирует OrchestratorModule для запуска сессий.
 * Экспортирует SessionsService.
 */
@Module({
  imports: [AgentsModule, OrchestratorModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
