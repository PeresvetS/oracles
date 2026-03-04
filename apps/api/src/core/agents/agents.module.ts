import { Module } from '@nestjs/common';
import { PromptsModule } from '@core/prompts/prompts.module';
import { AgentsService } from '@core/agents/agents.service';

/**
 * Модуль управления агентами.
 *
 * Импортирует PromptsModule для разрешения дефолтных промптов.
 * Экспортирует AgentsService для использования в SessionsModule.
 * Не имеет собственного контроллера — агенты создаются через SessionsController.
 */
@Module({
  imports: [PromptsModule],
  providers: [AgentsService],
  exports: [AgentsService],
})
export class AgentsModule {}
