# Error Handling, Logging & Infrastructure

## Обзор

Продакшн-инфраструктура Oracle включает:

- **GlobalExceptionFilter** — централизованная обработка ошибок с correlationId
- **Pino logging** — структурированное JSON-логирование (nestjs-pino)
- **Rate limiting** — защита от злоупотреблений (@nestjs/throttler)
- **Health check** — публичный эндпоинт для Railway деплоя

---

## GlobalExceptionFilter

**Файл:** `src/shared/filters/global-exception.filter.ts`

Перехватывает все исключения приложения и возвращает стандартный ответ.

### Формат ответа

```json
{
  "statusCode": 400,
  "message": "Некорректный запрос",
  "correlationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Поведение

| Тип исключения | statusCode | message |
|----------------|-----------|---------|
| `HttpException` (BadRequest, Unauthorized, etc.) | Из исключения | Из исключения |
| `ThrottlerException` (429) | 429 | Из исключения |
| Любой `Error` | 500 | "Внутренняя ошибка сервера" |
| Примитив (throw 'string') | 500 | "Внутренняя ошибка сервера" |

### correlationId

`correlationId` берётся из `X-Correlation-ID` (если передан) или генерируется как UUID v4.
Включается в:
- Тело HTTP-ответа (поле `correlationId`)
- Строку лога (формат: `[correlationId] METHOD /path → statusCode: message`)

### Маскировка секретов

Функция `maskSecrets()` экранирует в логах:
- Bearer-токены: `Bearer eyJ...` → `Bearer ***`
- OpenAI API-ключи: `sk-abc123...` → `sk-***`
- JSON-поля `apiKey`, `api_key`, `password`, `secret`, `token`: значение → `***`

---

## Pino Logging

**Пакеты:** `nestjs-pino`, `pino`, `pino-http` (+ `pino-pretty` для dev)

### Конфигурация

**Development** (`NODE_ENV !== 'production'`):
```
[2026-03-04 12:00:00.123] INFO: GET /api/sessions (200)
  correlationId: "uuid-..."
  method: "GET"
  url: "/api/sessions"
```

**Production** (`NODE_ENV === 'production'`):
```json
{"level":30,"time":1709553600000,"msg":"GET /api/sessions","correlationId":"uuid-...","statusCode":200}
```

### correlationId в HTTP-запросах

Автоматически генерируется через `genReqId`:
- Берёт заголовок `X-Correlation-ID` если передан
- Иначе генерирует новый UUID v4

### Redaction (маскировка)

Pino автоматически маскирует в логах HTTP-запросов:
- `req.headers.authorization` → `***`
- `req.headers["x-api-key"]` → `***`

### Исключения из автологирования

Запросы к `/health` не логируются (снижение шума в логах Railway).

### Использование в сервисах

Существующий код не нужно менять — `new Logger(ClassName.name)` из `@nestjs/common` автоматически перехватывается pino через `app.useLogger()` в `main.ts`.

```typescript
// Стандартное использование (без изменений)
private readonly logger = new Logger(OrchestratorService.name);
this.logger.log(`[${sessionId}] Раунд 3 начался`);
this.logger.error('Ошибка LLM', error.stack);
```

---

## Rate Limiting

**Пакет:** `@nestjs/throttler`

**Настройки:** 100 запросов в минуту на пользователя (JWT), fallback на IP для публичных маршрутов

**Файл констант:** `src/shared/constants/throttle.constants.ts`

```typescript
export const THROTTLE_DEFAULTS = {
  TTL_MS: 60_000,   // 1 минута
  LIMIT: 100,        // 100 запросов
} as const;
```

### Ответ при превышении лимита

```json
{
  "statusCode": 429,
  "message": "Too Many Requests",
  "correlationId": "uuid-..."
}
```

### Исключения

- `GET /api/health` — декоратор `@SkipThrottle()` на контроллере

### WebSocket

ThrottlerGuard применяется только к HTTP контексту и не влияет на WebSocket соединения.

---

## Health Check

**Файл:** `src/health/health.controller.ts`

**Эндпоинт:** `GET /api/health`

**Авторизация:** нет (публичный)

**Rate limiting:** отключён (`@SkipThrottle()`)

**Использование:** Railway проверяет этот эндпоинт при каждом деплое.

### Ответ

```json
{
  "status": "ok",
  "timestamp": "2026-03-04T12:00:00.000Z"
}
```

---

## Регистрация в AppModule

```typescript
// GlobalExceptionFilter — через APP_FILTER (DI-aware)
{ provide: APP_FILTER, useClass: GlobalExceptionFilter }

// UserThrottlerGuard — через APP_GUARD (глобально)
{ provide: APP_GUARD, useClass: UserThrottlerGuard }
```

**Почему `APP_FILTER`, а не `app.useGlobalFilters(new Filter())`:**
При регистрации через DI-токен NestJS создаёт фильтр в рамках DI-контейнера, что позволяет `new Logger()` внутри фильтра корректно использовать pino после вызова `app.useLogger()` в `main.ts`.

---

## Файлы

| Файл | Описание |
|------|----------|
| `src/shared/filters/global-exception.filter.ts` | GlobalExceptionFilter + maskSecrets() |
| `src/shared/filters/global-exception.filter.spec.ts` | Тесты (8 тест-кейсов) |
| `src/shared/constants/throttle.constants.ts` | THROTTLE_DEFAULTS |
| `src/shared/guards/user-throttler.guard.ts` | Rate limit tracker: userId → IP fallback |
| `src/shared/guards/user-throttler.guard.spec.ts` | Тесты user/ip tracker логики |
| `src/health/health.controller.ts` | GET /api/health |
| `src/health/health.module.ts` | HealthModule |
| `src/app.module.ts` | LoggerModule, ThrottlerModule, HealthModule, APP_FILTER, APP_GUARD |
| `src/main.ts` | app.useLogger(pino), bufferLogs: true |
