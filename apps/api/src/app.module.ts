import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import { PrismaModule } from '@prisma/prisma.module';
import { SettingsModule } from '@settings/settings.module';
import { AuthModule } from '@core/auth/auth.module';
import { PromptsModule } from '@core/prompts/prompts.module';
import { ModelsModule } from '@config/models.module';
import { SessionsModule } from '@core/sessions/sessions.module';
import { LlmModule } from '@integrations/llm/llm.module';
import { IdeasModule } from '@core/ideas/ideas.module';
import { ReportsModule } from '@core/reports/reports.module';
import { HealthModule } from '@health/health.module';
import { validateEnv } from '@config/env.validation';
import { GlobalExceptionFilter } from '@shared/filters/global-exception.filter';
import { THROTTLE_DEFAULTS } from '@shared/constants/throttle.constants';
import { UserThrottlerGuard } from '@shared/guards/user-throttler.guard';

/**
 * Корневой модуль приложения.
 * Подключает глобальные модули и импортирует функциональные модули.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),

    // Структурированное логирование через pino
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level: configService.get('NODE_ENV') === 'production' ? 'info' : 'debug',
          // Генерируем correlationId из заголовка или создаём новый UUID
          genReqId: (req: IncomingMessage) =>
            (req.headers['x-correlation-id'] as string) ?? randomUUID(),
          // Не логируем healthcheck-запросы
          autoLogging: {
            ignore: (req: IncomingMessage) => req.url?.includes('/health') ?? false,
          },
          // Маскируем секреты в логах HTTP-запросов
          redact: {
            paths: ['req.headers.authorization', 'req.headers["x-api-key"]'],
            censor: '***',
          },
          serializers: {
            req: (req: { method: string; url: string; id: string }) => ({
              method: req.method,
              url: req.url,
              correlationId: req.id,
            }),
            res: (res: { statusCode: number }) => ({
              statusCode: res.statusCode,
            }),
          },
          // Pino-pretty только в non-production окружениях
          ...(configService.get('NODE_ENV') !== 'production' && {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname',
              },
            },
          }),
        },
      }),
      inject: [ConfigService],
    }),

    // Rate limiting: 100 запросов в минуту
    ThrottlerModule.forRoot([
      {
        ttl: THROTTLE_DEFAULTS.TTL_MS,
        limit: THROTTLE_DEFAULTS.LIMIT,
      },
    ]),

    PrismaModule,
    SettingsModule,
    AuthModule,
    PromptsModule,
    ModelsModule,
    SessionsModule,
    LlmModule,
    IdeasModule,
    ReportsModule,
    HealthModule,
  ],
  providers: [
    // Глобальный фильтр ошибок: correlationId + маскировка секретов
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    // Глобальный rate limiting guard (HTTP только)
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
  ],
})
export class AppModule {}
