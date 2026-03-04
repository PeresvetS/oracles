import { Module } from '@nestjs/common';
import { ModelsController } from '@config/models.controller';
import { ModelsService } from '@config/models.service';

/**
 * Модуль реестра моделей.
 * Предоставляет GET /api/models endpoint и ModelsService для использования другими модулями.
 */
@Module({
  controllers: [ModelsController],
  providers: [ModelsService],
  exports: [ModelsService],
})
export class ModelsModule {}
