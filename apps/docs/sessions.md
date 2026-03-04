# SessionsModule

## Что это / зачем

SessionsModule управляет сессиями «совета директоров» — основной сущностью Oracle. Одна сессия = один полный цикл генерации или валидации бизнес-идей мультиагентной системой.

Модуль отвечает за:
- CRUD сессий (создание, чтение, обновление, удаление)
- Управление жизненным циклом (start / pause / resume / message / updateMaxRounds)
- Создание агентов при создании сессии (через AgentsModule)
- Чтение сообщений чата

## Структура файлов

```
src/core/sessions/
├── sessions.module.ts              # NestJS модуль (imports: AgentsModule)
├── sessions.controller.ts          # 11 REST endpoints
├── sessions.service.ts             # Бизнес-логика + интерфейсы
├── sessions.service.spec.ts        # Unit тесты
└── dto/
    ├── create-session.dto.ts       # mode, inputPrompt, agents[], filters?, maxRounds?
    ├── update-session.dto.ts       # title?, filters?
    ├── send-message.dto.ts         # content (required)
    ├── update-max-rounds.dto.ts    # maxRounds (int)
    ├── resume-session.dto.ts       # message? (optional)
    └── session-filters.dto.ts      # maxComplexity, maxBudget, timeToRevenue, etc.
```

## API Endpoints

Все endpoints защищены `JwtAuthGuard`. Swagger: `/api/docs` → тег «Сессии».

| Метод | Путь | Статус ответа | Описание |
|-------|------|---------------|----------|
| GET | `/api/sessions` | 200 | Список сессий пользователя (пагинация, фильтр по статусу) |
| POST | `/api/sessions` | 201 | Создание сессии с агентами |
| GET | `/api/sessions/:id` | 200 | Детали сессии (agents + _count) |
| GET | `/api/sessions/:id/messages` | 200 | Все сообщения сессии (для чата) |
| PATCH | `/api/sessions/:id` | 200 | Обновление title и/или filters |
| DELETE | `/api/sessions/:id` | 204 | Удаление (каскадно) |
| POST | `/api/sessions/:id/start` | 200 | Запуск: CONFIGURING → RUNNING |
| POST | `/api/sessions/:id/pause` | 200 | Пауза: RUNNING → PAUSED |
| POST | `/api/sessions/:id/resume` | 200 | Возобновление: PAUSED → RUNNING |
| POST | `/api/sessions/:id/message` | 200 | Сообщение пользователя → доп. раунд |
| PATCH | `/api/sessions/:id/max-rounds` | 200 | Увеличение лимита раундов |

### GET `/api/sessions` — query параметры

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `page` | number | 1 | Номер страницы |
| `limit` | number | 20 | Записей на странице (макс. 100) |
| `status` | string | — | Фильтр: CONFIGURING / RUNNING / PAUSED / COMPLETED |

**Ответ:** `PaginatedResult<Session>` — `{ items, total, page }`.

### GET `/api/sessions/:id/messages`

Возвращает сообщения в хронологическом порядке с данными агента и раунда.

**Ответ:** `SessionMessagesResult` — `{ items: SessionMessageWithRelations[], total }`.

Каждое сообщение включает:
- `agent`: `{ name, role, modelId }` (null для системных)
- `round`: `{ number, type }`

Лимит: `PAGINATION.MESSAGES_DEFAULT_LIMIT` (100 сообщений).

## Ключевые сервисы и методы

### SessionsService

| Метод | Описание | Ошибки |
|-------|----------|--------|
| `create(userId, dto)` | Создаёт сессию + агентов через AgentsService | BadRequestException при невалидных агентах |
| `findAll(userId, options)` | Пагинированный список с фильтрацией по статусу | — |
| `findOne(userId, id)` | Сессия с agents и _count только для владельца | NotFoundException |
| `findMessages(userId, id)` | Сообщения для чата только для владельца | NotFoundException |
| `update(userId, id, dto)` | title и/или filters только для владельца | NotFoundException |
| `delete(userId, id)` | Каскадное удаление только для владельца | NotFoundException |
| `start(userId, id)` | CONFIGURING → RUNNING | NotFoundException, ConflictException |
| `pause(userId, id)` | RUNNING → PAUSED | NotFoundException, ConflictException |
| `resume(userId, id, message?)` | PAUSED → RUNNING | NotFoundException, ConflictException |
| `sendMessage(userId, id, content)` | Пользовательское сообщение только для владельца | NotFoundException, ConflictException |
| `updateMaxRounds(userId, id, maxRounds)` | Не ниже currentRound, не выше MAX_ROUNDS | NotFoundException, BadRequestException |

### SessionWithDetails (тип ответа)

```typescript
interface SessionWithDetails extends Session {
  agents: Agent[];
  _count: { rounds: number; messages: number; ideas: number; };
}
```

## Жизненный цикл сессии

```
CONFIGURING ──start()──→ RUNNING ──pause()──→ PAUSED
                            │                    │
                            │                resume()
                            │                    │
                            ←────────────────────┘
                            │
                   (OrchestratorService: все раунды завершены)
                            │
                            ▼
                         COMPLETED
```

### Стейт-машина (допустимые переходы)

| Из | В | Метод | Ошибка при неверном статусе |
|----|---|-------|-----------------------------|
| CONFIGURING | RUNNING | `start()` | `ConflictException` |
| RUNNING | PAUSED | `pause()` | `ConflictException` |
| PAUSED | RUNNING | `resume()` | `ConflictException` |
| RUNNING / PAUSED | — | `sendMessage()` | `ConflictException` если CONFIGURING |

## CreateSessionDto — валидация

| Поле | Обязательно | Описание |
|------|------------|---------|
| `mode` | ✅ | `GENERATE` или `VALIDATE` |
| `inputPrompt` | ✅ | Минимум 10 символов |
| `agents[]` | ✅ | Минимум 4 (1 директор + 2 аналитика + 1 ресерчер) |
| `title` | ❌ | Если не передан — автогенерируется |
| `existingIdeas` | ❌ | Массив строк (только для режима VALIDATE) |
| `filters` | ❌ | `SessionFiltersDto` |
| `maxRounds` | ❌ | 1–15, по умолчанию 5 |
| `maxResearchCalls` | ❌ | 0–10, по умолчанию 5 |

### Автогенерация title

Если `title` не передан:
```
mode=GENERATE  → "Генерация: <первые 80 символов inputPrompt>..."
mode=VALIDATE  → "Валидация: <первые 80 символов inputPrompt>..."
```

## Конфигурация

### Константы (`SESSION_LIMITS` из `@oracle/shared`)

| Константа | Значение | Описание |
|-----------|----------|----------|
| `MIN_ANALYSTS` | 2 | Минимум аналитиков |
| `MAX_ANALYSTS` | 6 | Максимум аналитиков |
| `DEFAULT_ANALYSTS` | 3 | По умолчанию |
| `MIN_ROUNDS` | 1 | Минимум раундов |
| `MAX_ROUNDS` | 15 | Максимум раундов |
| `DEFAULT_MAX_ROUNDS` | 5 | По умолчанию |
| `DEFAULT_MAX_RESEARCH_CALLS` | 5 | По умолчанию вызовов ресерчера |
| `MAX_RESEARCH_CALLS` | 10 | Максимум вызовов ресерчера |

### Пагинация (`PAGINATION` из `@oracle/shared`)

| Константа | Значение |
|-----------|----------|
| `DEFAULT_PAGE` | 1 |
| `DEFAULT_LIMIT` | 20 |
| `MAX_LIMIT` | 100 |
| `MESSAGES_DEFAULT_LIMIT` | 100 |

## Интеграция с OrchestratorService

Методы `start()`, `pause()`, `resume()` и `sendMessage()` сразу делегируют работу в `OrchestratorService` через `setImmediate()`:
- HTTP-ответ возвращается сразу
- долгая оркестрация идёт асинхронно
- точечные операции предварительно проверяют, что сессия принадлежит текущему пользователю

## Зависимости модуля

- `AgentsModule` — создание агентов при создании сессии
- `PrismaModule` (глобальный) — таблица `sessions`, `messages`, `rounds`
- `@oracle/shared` — SESSION_STATUS, SESSION_MODE, SESSION_LIMITS, PAGINATION

## Как расширять

### Добавить новый endpoint

1. Добавить метод в `SessionsService` с бизнес-логикой
2. Добавить endpoint в `SessionsController` с `@ApiOperation` и `@ApiResponse`
3. Создать DTO если нужна валидация входных данных
4. Добавить тест в `sessions.service.spec.ts`

### Подключить OrchestratorService (после его реализации)

В `sessions.module.ts` добавить импорт:
```typescript
imports: [AgentsModule, OrchestratorModule]
```

В `sessions.service.ts` инжектировать и вызвать:
```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly agentsService: AgentsService,
  private readonly orchestrator: OrchestratorService,  // добавить
) {}

async start(id: string): Promise<Session> {
  // ...
  await this.orchestrator.startSession(id);  // вместо TODO-STUB
  return updated;
}
```

### Добавить новый фильтр сессии

В `session-filters.dto.ts` добавить поле с валидатором. Поле автоматически попадёт в JSON-колонку `filters` в БД.
