import { Module } from '@nestjs/common';
import { AuthModule } from '@core/auth/auth.module';
import { SessionGateway } from '@transport/gateway/session.gateway';

/**
 * Модуль WebSocket Gateway для сессий.
 *
 * Предоставляет SessionGateway, который:
 * 1. Обрабатывает WebSocket-подключения с JWT-авторизацией
 * 2. Управляет комнатами (session:join / session:leave)
 * 3. Реализует ISessionEventEmitter для OrchestratorModule
 *
 * Экспортирует SessionGateway для использования в OrchestratorModule
 * через DI-токен SESSION_EVENT_EMITTER (useExisting: SessionGateway).
 */
@Module({
  imports: [AuthModule],
  providers: [SessionGateway],
  exports: [SessionGateway],
})
export class SessionGatewayModule {}
