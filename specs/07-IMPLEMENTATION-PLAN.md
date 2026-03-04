# Oracle — План реализации

## Общие принципы (из CLAUDE.md)

- Только `yarn` (не npm, не npx)
- Монорепо: Turborepo + Yarn workspaces
- Clean Architecture: `core/`, `integrations/`, `transport/`, `shared/`
- Path Aliases обязательны
- Barrel exports запрещены
- Каждый файл ≤ 1200 строк
- Все числа через константы (`SESSION_LIMITS`, `AGENT_DEFAULTS`, …)
- Все строки UI через i18n (en, ru)
- Swagger на русском для всех endpoints
- Документация модулей в `apps/docs/`
- Тесты обязательны для критических путей
- После каждой задачи: `yarn lint:fix`
- Без TODO — сразу конечное решение
- Deploy: Railway

## Структура репозитория

```
oracle/
├── apps/
│   ├── api/              # NestJS backend (port 3001)
│   ├── admin/            # Next.js 16 frontend (port 3000)
│   └── docs/             # MD-документация модулей
├── packages/
│   └── shared/           # Типы, enums, constants, utils
├── docker-compose.yml    # PostgreSQL + Redis (dev)
├── turbo.json
├── package.json          # Yarn workspaces
├── CLAUDE.md
└── .env.example
```

## Docker Compose (dev)

```yaml
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: oracle
      POSTGRES_USER: oracle
      POSTGRES_PASSWORD: oracle
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

volumes:
  pgdata:
```

---

## Phase 1: Скелет и базовый flow (2-3 дня)

### Цель
Запущенные backend + frontend, создание сессии, один раунд с двумя агентами.

### Задачи

**Инфраструктура:**
1. Инициализация монорепо: `turbo.json`, root `package.json` с workspaces
2. `packages/shared`: enums (`SessionMode`, `SessionStatus`, `AgentRole`, `RoundType`, `MessageRole`, `IdeaStatus`), типы (`ModelInfo`, `LlmChatParams`, и т.д.), константы (`SESSION_LIMITS`, `AGENT_DEFAULTS`, `LLM_DEFAULTS`, `PAGINATION`, `AUTH`)
3. `docker-compose.yml` для PostgreSQL + Redis

**Backend (`apps/api`):**
1. `nest new api` → настройка path aliases в `tsconfig.json`
2. `PrismaModule` (global) + `schema.prisma` со всеми таблицами из 02-DATABASE.md
3. `yarn prisma migrate dev --name init`
4. `@settings/settings.module.ts` (global) — CRUD настроек с env fallback
5. `@core/auth` — JWT login, `JwtAuthGuard`, seed пользователя
6. `@core/sessions` — CRUD (controller + service + DTOs с class-validator)
7. `@core/agents` — создание агентов при создании сессии
8. `@core/prompts` — CRUD + seed дефолтных промптов
9. `@config/models.registry.ts` — `MODEL_REGISTRY`
10. `@integrations/llm` — `LlmGatewayService` + `OpenRouterProvider` (только `chat()`, без стриминга)
11. `@core/orchestrator` — упрощённый: один раунд (Директор → Аналитики → Директор)
12. Swagger: `/api/docs`, все endpoints с `@ApiTags`/`@ApiOperation`
13. `apps/docs/`: auth.md, sessions.md, llm-gateway.md

**Frontend (`apps/admin`):**
1. `create-next-app` → Tailwind CSS 4 + Shadcn UI init
2. i18n: `context.tsx`, `en.ts`, `ru.ts` (каркас)
3. `auth-store.ts` (Zustand + persist)
4. `lib/api.ts` — fetch wrapper с JWT
5. Страница Login (Shadcn Card + Input + Button)
6. Дашборд: список сессий (TanStack Query)
7. Форма создания сессии (базовая: промпт + режим)
8. Страница сессии: отображение сообщений (polling через TanStack Query, не WebSocket пока)

### Критерий готовности
Создание сессии → запуск → сообщения от Директора и двух аналитиков видны в UI.

### Definition of Done
- [ ] TS без ошибок
- [ ] `yarn lint:fix` пройден
- [ ] Swagger актуален
- [ ] Seed работает
- [ ] Тесты: AuthService, SessionsService (create, start)
- [ ] Документация: `apps/docs/auth.md`, `apps/docs/sessions.md`

---

## Phase 2: Полный цикл раундов (2-3 дня)

### Цель
Полноценные раунды с конвергенцией, ресерчер, pause/resume, стриминг.

### Задачи

**Backend:**
1. `OrchestratorService` — полный цикл: INITIAL → DISCUSSION → RESEARCH → SCORING → FINAL
2. `RoundManagerService` — создание раундов, `buildAgentContext()`, `summarizePreviousRounds()`
3. `PerplexityProvider` — подключение Sonar API
4. `WebSearchTool` — Serper API
5. Tool calls в `AgentRunnerService`: `web_search` (все) + `call_researcher` (Директор)
6. Pause/Resume: сохранение состояния, `currentRound` не инкрементируется при паузе
7. `handleUserMessage()`: USER_INITIATED раунд, не расходует лимит
8. Token tracking: `tokensInput`, `tokensOutput`, `costUsd` на каждое сообщение, агрегация в Session
9. `@transport/gateway/session.gateway.ts` — WebSocket events (только emit!)
10. Стриминг через `chatStream()` → WebSocket чанки
11. Retry: `AGENT_DEFAULTS.RETRY_ATTEMPTS`, exponential backoff

**Frontend:**
1. `use-session-socket.ts` — WebSocket подключение
2. `session-store.ts` — Zustand для real-time state
3. Стриминг сообщений в чате
4. `RoundDivider` — разделители раундов с типом
5. `SessionControls` — pause, resume, stop
6. `UserInput` — отправка сообщения → доп. раунд
7. `TokenCounter` — стоимость на сообщение + суммарно
8. `ToolCallDisplay` — web_search, call_researcher

### Критерий готовности
Полная сессия: несколько раундов, ресерчер, пауза → корректива → продолжение. Token tracking.

### Definition of Done
- [ ] Тесты: OrchestratorService (полный цикл, pause/resume, user message), AgentRunnerService (tool calls, retry), LlmGatewayService (routing)
- [ ] Документация: `apps/docs/orchestrator.md`, `apps/docs/llm-gateway.md`
- [ ] i18n: все новые строки UI через локализацию

---

## Phase 3: Конфигурация агентов и финализация (2-3 дня)

### Цель
Полная настройка агентов в UI, RICE/ICE скоринг, отчёт.

### Задачи

**Backend:**
1. Скоринг: Директор запрашивает ICE/RICE → парсинг в `Idea.scores` (JSON)
2. `ReportsService` — формирование Report, экспорт CSV/JSON
3. `IdeasService` — CRUD, фильтрация по статусу, агрегация `avgIce`/`avgRice`
4. `PATCH /api/sessions/:id/max-rounds` — увеличение лимита в процессе

**Frontend:**
1. `SessionConfigForm` — полная версия:
   - `AgentConfigurator` — карточка агента с `ModelSelector` + `PromptEditor`
   - `ModelSelector` — выпадающий, группировка по family, greyed out если нет ключа
   - `PromptEditor` — авто-смена промпта при смене модели + inline-редактирование
   - `FiltersConfig` — слайдеры, селекты
2. Вкладка «Отчёт»:
   - `IdeaTable` — @tanstack/react-table с ICE/RICE, клик → `IdeaDetailCard`
   - `ScoringChart` — recharts bar chart
   - `RejectedIdeasList` — Shadcn Collapsible
   - `ExportButtons` — CSV/JSON
3. Кнопка `[+]` для увеличения раундов
4. `AgentStatusBar` — кто думает

### Критерий готовности
Полный продукт: настройка агентов → запуск → мониторинг → отчёт с скорингом → экспорт.

### Definition of Done
- [ ] Тесты: IdeasService (статусы, скоринг), ReportsService (формирование, экспорт), PromptsService (подстановки)
- [ ] Документация: `apps/docs/ideas-and-reports.md`, `apps/docs/agents.md`
- [ ] i18n: полная локализация всех новых строк

---

## Phase 4: Админка и полировка (1-2 дня)

### Цель
Администрирование, устойчивость, UX.

### Задачи

**Backend:**
1. Global exception filter с `correlationId`
2. Логирование (pino): события домена + ошибки, маскировка секретов
3. Rate limiting на REST endpoints

**Frontend:**
1. `/admin` — `ApiKeysForm` (PATCH /api/settings)
2. `/admin/prompts` — `PromptTemplateList` + `PromptTemplateEditor`
3. `/admin/models` — `ModelList` с индикаторами доступности
4. Dark theme (Shadcn theme config)
5. Error Boundaries на страницах
6. Sonner toasts для всех ошибок и подтверждений

### Критерий готовности
Продукт готов к ежедневному использованию командой.

### Definition of Done
- [ ] Все пункты из CLAUDE.md "Definition of Done"
- [ ] `yarn lint:errors` проходит без ошибок
- [ ] Swagger полностью актуален
- [ ] Все модули задокументированы в `apps/docs/`

---

## Phase 5 (Post-MVP): Улучшения

По приоритету:
1. **pgvector memory**: поиск по прошлым сессиям
2. **Прямые провайдеры**: Anthropic Direct, OpenAI Direct, Google Direct
3. **Claude Code SDK**: подключение подписки Claude Max
4. **OpenAI Codex/Responses API**: подключение подписки GPT
5. **Google AI Studio**: подключение подписки Gemini
6. **Расширенный скоринг**: кастомные методики
7. **Шаблоны сессий**: сохранение и переиспользование конфигураций
8. **Telegram-бот**: уведомления, отправка комментариев
9. **Batch-режим**: несколько сессий одновременно
10. **A/B промптов**: две сессии с разными промптами, сравнение

---

## Оценка стоимости

### Одна сессия (5 раундов, 3 аналитика)

```
Директор:     ~8 вызовов × ~3K tokens out ≈ 24K tokens    ~$0.36
Аналитик 1:   ~6 вызовов × ~2K tokens out ≈ 12K tokens    ~$0.18
Аналитик 2:   ~6 вызовов × ~2K tokens out ≈ 12K tokens    ~$0.18
Аналитик 3:   ~6 вызовов × ~2K tokens out ≈ 12K tokens    ~$0.12
Ресерчер:     ~3 вызова × ~3K tokens out ≈ 9K tokens      ~$0.05
Суммаризация: ~3 вызова × ~1K tokens out ≈ 3K tokens      ~$0.05
Web search:   ~5 вызовов Serper                             ~$0.01
Input tokens: ~150K-300K (контекст нарастает)               ~$0.50-$2.00
─────────────────────────────────────────────────────────────
Итого:                                                  ~$1.50-$3.00
```

С Opus вместо Sonnet: ×5 ≈ $7.50-$15.00.

### Месячный бюджет

2-3 сессии/день: **$100-$200/мес** (Sonnet/GPT-4.1/Gemini 2.5 Pro).

---

## Deploy (Railway)

Railway поддерживает монорепо через Nixpacks:

```toml
# apps/api/railway.toml
[build]
buildCommand = "cd ../.. && yarn install && yarn build --filter=api"

[deploy]
startCommand = "cd apps/api && yarn start:prod"
healthcheckPath = "/api/health"

[service]
internalPort = 3001
```

```toml
# apps/admin/railway.toml
[build]
buildCommand = "cd ../.. && yarn install && yarn build --filter=admin"

[deploy]
startCommand = "cd apps/admin && yarn start"

[service]
internalPort = 3000
```

- PostgreSQL: Railway managed PostgreSQL (pgvector через extension)
- Redis: Railway managed Redis
- Env variables: через Railway dashboard
- Domain: oracle.besales.app (Custom Domain)
