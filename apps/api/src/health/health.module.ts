import { Module } from '@nestjs/common';
import { HealthController } from '@health/health.controller';

/**
 * Модуль проверки работоспособности сервиса.
 * Регистрирует публичный GET /api/health эндпоинт.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
