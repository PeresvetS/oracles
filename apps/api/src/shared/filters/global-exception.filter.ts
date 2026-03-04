import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

/**
 * Глобальный фильтр исключений.
 *
 * - Перехватывает все исключения (HttpException и неизвестные ошибки)
 * - Генерирует уникальный correlationId для каждой ошибки
 * - Маскирует секреты (Bearer-токены, API-ключи) в логах
 * - Возвращает стандартный ответ: { statusCode, message, correlationId }
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestCorrelationId = (
      (request.headers?.['x-correlation-id'] as string | undefined) ?? ''
    ).trim();
    const correlationId = requestCorrelationId || randomUUID();
    const isHttpException = exception instanceof HttpException;

    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = this.extractClientMessage(exception);

    const stack = exception instanceof Error ? exception.stack : undefined;

    const logMessage = maskSecrets(
      `[${correlationId}] ${request.method} ${request.url} → ${statusCode}: ${message}`,
    );

    const sanitizedStack = stack ? maskSecrets(stack) : undefined;
    this.logger.error(logMessage, sanitizedStack);

    response.status(statusCode).json({ statusCode, message, correlationId });
  }

  private extractClientMessage(exception: unknown): string {
    if (!(exception instanceof HttpException)) {
      return 'Внутренняя ошибка сервера';
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }

    if (response && typeof response === 'object') {
      const typed = response as { message?: string | string[] };
      if (Array.isArray(typed.message)) {
        return typed.message.join('; ');
      }
      if (typeof typed.message === 'string' && typed.message.trim().length > 0) {
        return typed.message;
      }
    }

    return exception.message;
  }
}

/**
 * Маскирует секреты в строке для безопасного логирования.
 * Скрывает Bearer-токены, sk-*** API-ключи и JSON-поля с секретами.
 */
export function maskSecrets(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .replace(/sk-[A-Za-z0-9\-_]{10,}/g, 'sk-***')
    .replace(/"(api[Kk]ey|api_key|password|secret|token)"\s*:\s*"[^"]+"/gi, '"$1": "***"');
}
