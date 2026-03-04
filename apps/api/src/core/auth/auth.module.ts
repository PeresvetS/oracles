import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AUTH } from '@oracle/shared';
import { AuthController } from '@core/auth/auth.controller';
import { AuthService } from '@core/auth/auth.service';
import { JwtStrategy } from '@core/auth/jwt.strategy';

/**
 * Модуль аутентификации.
 * Регистрирует JWT-стратегию Passport — после этого JwtAuthGuard
 * работает во всех модулях без дополнительного импорта.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: AUTH.JWT_EXPIRES_IN },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
