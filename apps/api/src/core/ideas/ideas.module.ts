import { Module } from '@nestjs/common';
import { IdeasService } from '@core/ideas/ideas.service';
import { IdeasController } from '@core/ideas/ideas.controller';

/**
 * Модуль управления идеями.
 *
 * Предоставляет IdeasService для использования в OrchestratorModule.
 * Регистрирует IdeasController для REST-эндпоинтов.
 * PrismaModule глобален — не нужно импортировать.
 */
@Module({
  controllers: [IdeasController],
  providers: [IdeasService],
  exports: [IdeasService],
})
export class IdeasModule {}
