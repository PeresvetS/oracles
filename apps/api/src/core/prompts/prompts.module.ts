import { Module } from '@nestjs/common';
import { PromptsController } from '@core/prompts/prompts.controller';
import { PromptsService } from '@core/prompts/prompts.service';

/**
 * Модуль управления шаблонами промптов.
 * Экспортирует PromptsService для использования в OrchestratorModule.
 */
@Module({
  controllers: [PromptsController],
  providers: [PromptsService],
  exports: [PromptsService],
})
export class PromptsModule {}
