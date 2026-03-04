import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard JWT-аутентификации.
 * Требует валидный Bearer-токен в заголовке Authorization.
 * JWT-стратегия регистрируется в AuthModule (задача 1.6).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
