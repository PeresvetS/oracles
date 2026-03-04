import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Глобальный throttler guard с трекингом по пользователю.
 *
 * Приоритет трекера:
 * 1) JWT user.id / user.sub (для авторизованных запросов)
 * 2) x-forwarded-for / req.ip (для публичных эндпоинтов)
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req['user'] as { id?: string; sub?: string } | undefined;
    const userId = user?.id ?? user?.sub;
    if (userId) {
      return `user:${userId}`;
    }

    const forwardedFor = req['headers'] as { 'x-forwarded-for'?: string | string[] } | undefined;
    const forwarded = forwardedFor?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return `ip:${forwarded.split(',')[0].trim()}`;
    }

    const ip = req['ip'];
    return typeof ip === 'string' && ip.length > 0 ? `ip:${ip}` : 'ip:unknown';
  }
}
