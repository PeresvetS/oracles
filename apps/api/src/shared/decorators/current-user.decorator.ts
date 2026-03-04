import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '@core/auth/interfaces/authenticated-user.interface';

/**
 * Декоратор для получения текущего пользователя из JWT-контекста.
 * Использовать только на эндпоинтах, защищённых JwtAuthGuard.
 *
 * @example
 * \@Get('me')
 * \@UseGuards(JwtAuthGuard)
 * getMe(\@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
