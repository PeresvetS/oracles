import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Ответ healthcheck-эндпоинта.
 */
interface HealthResponse {
  status: string;
  timestamp: string;
}

/**
 * Контроллер проверки работоспособности сервиса.
 * Используется Railway для healthcheck при деплое.
 * Публичный эндпоинт — без JWT-авторизации и без rate limiting.
 */
@ApiTags('Health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  /**
   * Проверка работоспособности сервиса.
   * @returns { status: 'ok', timestamp: ISO-строка }
   */
  @Get()
  @ApiOperation({ summary: 'Проверка работоспособности сервиса' })
  @ApiResponse({
    status: 200,
    description: 'Сервис работает',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2026-03-04T12:00:00.000Z' },
      },
    },
  })
  health(): HealthResponse {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
