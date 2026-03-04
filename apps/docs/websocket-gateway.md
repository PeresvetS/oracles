# SessionGatewayModule

## Что это

WebSocket Gateway для real-time стриминга событий сессий Oracle. Реализует `ISessionEventEmitter` — используется `OrchestratorModule` вместо `LoggerSessionEventEmitter` через DI-токен `SESSION_EVENT_EMITTER`.

## Расположение

```
apps/api/src/transport/gateway/
├── session.gateway.ts         — WebSocket gateway, реализует ISessionEventEmitter
├── session-gateway.module.ts  — NestJS модуль
├── gateway.constants.ts       — WS_EVENTS, WS_NAMESPACE, WS_CORS_ORIGIN_FALLBACK
└── session.gateway.spec.ts    — unit-тесты
```

## Подключение и авторизация

- **Namespace:** `/session`
- **Auth:** JWT передаётся через `handshake.auth.token` или `handshake.query.token`
- При невалидном или отсутствующем JWT — сервер отключает клиента (`client.disconnect()`)
- После успешной авторизации `client.data` содержит `{ userId, email }`

```javascript
// Пример подключения с клиента (socket.io-client)
const socket = io('http://localhost:3001/session', {
  auth: { token: 'eyJhbGciOiJIUzI1NiJ9...' }
});

// Подписаться на сессию
socket.emit('session:join', { sessionId: 'abc-123' });
```

## Управление комнатами

| Событие (Client → Server) | Payload | Описание |
|---------------------------|---------|----------|
| `session:join` | `{ sessionId: string }` | Добавить клиента в комнату сессии |
| `session:leave` | `{ sessionId: string }` | Убрать клиента из комнаты сессии |

После `session:join` клиент начинает получать все события для указанной сессии.

## События (Server → Client)

### Стриминг сообщений агентов

Три события на каждое сообщение агента: `start → N×chunk → end`.

| Событие | Payload | Описание |
|---------|---------|----------|
| `agent:message:start` | `{ sessionId, messageId, agentId, agentName, agentRole, roundId }` | Начало генерации сообщения |
| `agent:message:chunk` | `{ sessionId, messageId, chunk }` | Текстовый фрагмент ответа |
| `agent:message:end` | `{ sessionId, messageId, tokensInput, tokensOutput, costUsd, latencyMs }` | Завершение с метриками |

`messageId` одинаковый во всех трёх событиях и совпадает с `id` записи в БД.

### Инструменты агентов

| Событие | Payload | Описание |
|---------|---------|----------|
| `agent:tool:start` | `{ sessionId, agentId, tool, query }` | Агент начинает вызов инструмента |
| `agent:tool:result` | `{ sessionId, agentId, tool, result }` | Превью результата (первые 200 символов) |

### Раунды

| Событие | Payload | Описание |
|---------|---------|----------|
| `round:start` | `{ sessionId, roundId, roundNumber, roundType }` | Начало раунда |
| `round:end` | `{ sessionId, roundId }` | Завершение раунда |

### Статус сессии

| Событие | Payload | Описание |
|---------|---------|----------|
| `session:status` | `{ sessionId, status }` | Смена статуса (RUNNING, PAUSED, COMPLETED, ERROR) |
| `session:error` | `{ sessionId, error }` | Ошибка сессии |
| `idea:update` | `{ sessionId, idea }` | Обновление идеи (вызывается из IdeasService) |
| `report:ready` | `{ sessionId, reportId }` | Отчёт готов (вызывается из ReportsService) |

## Архитектура и зависимости

```
SessionGatewayModule
    imports: [AuthModule]       — JwtModule → JwtService для верификации токенов
    providers: [SessionGateway]
    exports:  [SessionGateway]

OrchestratorModule
    imports: [..., SessionGatewayModule]
    providers: [
      ...,
      { provide: SESSION_EVENT_EMITTER, useExisting: SessionGateway }
    ]
```

**Ключевое архитектурное решение:** используется `useExisting: SessionGateway`, а не `useClass`. Это позволяет `@WebSocketServer()` корректно инициализировать `server` ещё до того, как `AgentRunnerService` начнёт эмитить события.

## Стриминговый flow

```
AgentRunnerService.executeWithToolLoop():
    1. messageId = randomUUID()
    2. emitMessageStart(sessionId, { messageId, agentId, agentName, agentRole, roundId })
    3. for await (chunk of llmGateway.chatStream()):
         if chunk.type === 'text':
             emitMessageChunk(sessionId, { messageId, chunk: text })
         if chunk.type === 'tool_call':
             накопить → processToolCalls → следующая итерация chatStream
         if chunk.type === 'done':
             сохранить usage
    4. emitMessageEnd(sessionId, { messageId, tokensInput, tokensOutput, costUsd, latencyMs })
    5. prisma.message.create({ id: messageId, ... })  ← тот же UUID
```

## CORS

CORS origin читается из `process.env.ADMIN_URL`. Если переменная не задана — fallback на `http://localhost:3000` (константа `WS_CORS_ORIGIN_FALLBACK`).

## Тестирование

```bash
# Unit тесты gateway (JWT auth, join/leave, emit методы)
yarn test src/transport/gateway/session.gateway.spec.ts
```

Unit-тесты не поднимают реальный WebSocket-сервер. Вместо этого:
- `this.server` подменяется моком через `Object.defineProperty`
- `JwtService.verifyAsync` мокируется для проверки авторизации
- Тестируются: авторизация, join/leave, все emit-методы через `server.to(sessionId).emit()`

## Константы

```typescript
// gateway.constants.ts
WS_EVENTS.AGENT_MESSAGE_START  = 'agent:message:start'
WS_EVENTS.AGENT_MESSAGE_CHUNK  = 'agent:message:chunk'
WS_EVENTS.AGENT_MESSAGE_END    = 'agent:message:end'
WS_EVENTS.AGENT_TOOL_START     = 'agent:tool:start'
WS_EVENTS.AGENT_TOOL_RESULT    = 'agent:tool:result'
WS_EVENTS.ROUND_START          = 'round:start'
WS_EVENTS.ROUND_END            = 'round:end'
WS_EVENTS.SESSION_STATUS       = 'session:status'
WS_EVENTS.SESSION_ERROR        = 'session:error'
WS_EVENTS.IDEA_UPDATE          = 'idea:update'
WS_EVENTS.REPORT_READY         = 'report:ready'
WS_EVENTS.SESSION_JOIN         = 'session:join'
WS_EVENTS.SESSION_LEAVE        = 'session:leave'

WS_NAMESPACE = '/session'
WS_CORS_ORIGIN_FALLBACK = 'http://localhost:3000'
```
