# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨 CRITICAL

### Язык и инструменты

- Отвечать на русском. JSDoc/Swagger комментарии — на русском
- Использовать только `yarn` (не npm); для Prisma CLI использовать `yarn prisma` (не `npx prisma` — глобальный Prisma 7 конфликтует с yarn PnP)
- Документацию искать через context7 MCP
- Всегда думай шаг за шагом
- Всегда пиши чистый код, используя лучшие практики TypeScript
- Добавляй новые сервисы/классы сразу во все необходимые модули в провайдерах
- Всегда проверяй, что вы добавил всё необходимое в DTO, интерфейсы, типы и модули
- Прежде чем завершить работу, проверь себя на наличие технического долга и устрани его
- Обязательно сразу делай без TODO и создания тех долга на потом - сразу делай конечное решение, чтобы не нужно было делать рефакторинг
- После каждой исполненой задачи вызывай `yarn lint:fix`
- Каждый файл должен быть не больше 1200 строк
- Обязательно создавай тесты основных функций
- Обязательно создавай человеко-читаемую документацию каждого модуля в apps/docs/ и обновляй её, когда что-то меняешь в логике модуля
- В HTTP-путях везде используется префикс `api` (`/api/...`)
- Не используй barrel exports
- Обязательно используй Path Aliases
- Проект хостится на Railway, учитывай это
- **Docker локально НЕ используется** — docker-compose.yml и Dockerfile только для Railway. Локальная БД и Redis — через Railway (переменные DATABASE_URL, REDIS_URL из Railway окружения)
- Делай без TODO и незавершённого кода
- Не используй магические цифры — сразу создай константы и переиспользуй существующие
- Не хардкодь текст - сразу используй локализацию
- Сегодня март 2026 года

### Запреты Prisma

- ❌ `npx prisma db push --accept-data-loss`
- ❌ `--reset` в командах миграции
- ✅ `npx prisma migrate dev --name {name}`
- ✅ `px prisma migrate dev --name {name}`

### Архитектурные запреты

- Избегать `forwardRef` — выносить зависимости в отдельные модули
- Не создавать гигантские PR — разбивать на инкременты
- ❌ Бизнес-логика в транспортном слое (WebSocket gateway/controllers). Транспорт = тонкая обёртка
- ❌ Прямой вызов Prisma/Redis из controllers/transport — только через сервисы
- ❌ Прямой вызов LLM-провайдеров из оркестратора — только через LlmGatewayService
- ❌ Хранение API-ключей в коде — только через Settings (БД) или env-переменные

---

## 🏗️ ARCHITECTURE

### Product Overview

Oracle — внутренний инструмент BeSales для автоматизированной генерации и валидации бизнес-идей. Мультиагентная система «совет директоров» из нескольких ИИ-агентов (Claude, GPT, Gemini), которые параллельно генерируют идеи, обсуждают их в раундах, привлекают ресерчера (Perplexity Sonar) для поиска конкурентов и рыночных данных, и выдают финальный структурированный отчёт с RICE/ICE-скорингом.

**Два режима:**
- **Generate** — аналитики генерируют идеи с нуля по вводным пользователя
- **Validate** — аналитики анализируют уже существующие идеи

**Ключевая метафора:** «Найди готовую трубу, по которой текут деньги, и вставь туда свой фильтр».

**Роли агентов:**
- **Директор** (1) — оркестратор: ставит задачи, арбитражит, вызывает ресерчера, финалит отчёт
- **Аналитики** (2-6, настраиваемо) — генерация и критический анализ идей, каждый с настраиваемой моделью и промптом
- **Ресерчер** (1) — глубокий поиск через Perplexity Sonar

**Auth:** Простая JWT-авторизация. Все пользователи — равноправные админы. Управление учётками только через БД.

### Clean Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Transport    │ REST Controllers, WebSocket Gateway      │
├─────────────────────────────────────────────────────────┤
│  Core Services│ OrchestratorService, RoundManagerService, │
│               │ AgentRunnerService, SessionsService,     │
│               │ IdeasService, ReportsService             │
├─────────────────────────────────────────────────────────┤
│  Domain       │ Session, Agent, Round, Message, Idea,    │
│               │ Report, PromptTemplate, Setting          │
├─────────────────────────────────────────────────────────┤
│  Infrastructure│ LlmGateway (OpenRouter, Perplexity),   │
│               │ Prisma, Redis, WebSearchTool             │
└─────────────────────────────────────────────────────────┘
```

**Структура проекта (monorepo, Turborepo):**

```
apps/
├── api/                          # NestJS backend (port 3001)
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── core/                 # Бизнес-логика
│   │   │   ├── sessions/         # CRUD сессий
│   │   │   │   ├── sessions.module.ts
│   │   │   │   ├── sessions.controller.ts
│   │   │   │   ├── sessions.service.ts
│   │   │   │   └── dto/
│   │   │   ├── orchestrator/     # Координация агентов и раундов
│   │   │   │   ├── orchestrator.module.ts
│   │   │   │   ├── orchestrator.service.ts
│   │   │   │   ├── round-manager.service.ts
│   │   │   │   └── agent-runner.service.ts
│   │   │   ├── agents/           # CRUD агентов в рамках сессии
│   │   │   ├── ideas/            # Идеи: создание, статусы, скоринг
│   │   │   ├── reports/          # Финальные отчёты, экспорт
│   │   │   ├── prompts/          # CRUD промпт-шаблонов
│   │   │   └── auth/             # JWT login, guards
│   │   ├── integrations/         # Внешние сервисы
│   │   │   └── llm/              # LLM Gateway
│   │   │       ├── llm.module.ts
│   │   │       ├── llm-gateway.service.ts
│   │   │       ├── providers/
│   │   │       │   ├── openrouter.provider.ts
│   │   │       │   ├── perplexity.provider.ts
│   │   │       │   ├── anthropic-direct.provider.ts   # (будущее)
│   │   │       │   ├── openai-direct.provider.ts      # (будущее)
│   │   │       │   ├── google-direct.provider.ts      # (будущее)
│   │   │       │   └── claude-code-sdk.provider.ts    # (будущее)
│   │   │       └── tools/
│   │   │           └── web-search.tool.ts
│   │   ├── transport/            # WebSocket + REST тонкие обёртки
│   │   │   └── gateway/
│   │   │       └── session.gateway.ts  # WebSocket стриминг
│   │   ├── shared/               # Guards, decorators, filters, constants
│   │   │   ├── guards/
│   │   │   ├── decorators/
│   │   │   ├── filters/
│   │   │   ├── constants/
│   │   │   └── interfaces/
│   │   ├── config/               # Конфигурация: env, модели, провайдеры
│   │   │   ├── models.registry.ts
│   │   │   └── env.validation.ts
│   │   ├── prisma/               # Prisma module + service
│   │   └── settings/             # Глобальные настройки (API-ключи и т.д.)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts
│   └── test/
├── admin/                        # Next.js 16 admin panel (port 3000)
│   └── src/
│       ├── app/                  # App Router pages
│       │   ├── login/
│       │   ├── sessions/
│       │   │   ├── page.tsx          # Список сессий (дашборд)
│       │   │   ├── new/page.tsx      # Создание сессии
│       │   │   └── [id]/page.tsx     # Страница сессии (чат + отчёт)
│       │   └── admin/
│       │       ├── page.tsx          # API keys
│       │       ├── prompts/page.tsx  # Промпт-шаблоны
│       │       └── models/page.tsx   # Доступные модели
│       ├── components/
│       │   ├── session-config/   # AgentConfigurator, ModelSelector, PromptEditor
│       │   ├── chat/             # SessionChat, MessageBubble, RoundDivider
│       │   ├── report/           # IdeaTable, ScoringChart, ExportButtons
│       │   ├── admin/            # ApiKeysForm, PromptTemplateEditor
│       │   └── ui/               # Header, Sidebar, TokenCounter, StatusBadge
│       ├── hooks/
│       │   ├── use-auth.ts
│       │   ├── use-session.ts
│       │   ├── use-session-socket.ts
│       │   └── use-models.ts
│       ├── store/
│       │   ├── auth-store.ts
│       │   └── session-store.ts
│       ├── lib/
│       │   ├── api.ts            # API client (fetch wrapper с JWT)
│       │   ├── socket.ts         # Socket.io client
│       │   └── utils.ts
│       ├── types/
│       │   └── index.ts
│       └── i18n/
│           ├── en.ts
│           └── ru.ts
├── docs/                         # Документация модулей
│   ├── sessions.md
│   ├── orchestrator.md
│   ├── agents.md
│   ├── llm-gateway.md
│   ├── ideas-and-reports.md
│   └── auth.md
packages/
└── shared/                       # Общие типы между api и admin
    └── src/
        ├── types/                # Session, Agent, Message, Idea, Report типы
        ├── enums/                # SessionMode, SessionStatus, AgentRole, etc.
        ├── constants/            # Общие константы
        └── utils/                # Общие утилиты (форматирование стоимости и т.д.)
```

### Data Flow

```
Пользователь (UI)
    │
    ▼ POST /api/sessions + POST /api/sessions/:id/start
SessionsController → SessionsService → создание Session + Agents в БД
    │
    ▼ OrchestratorService.startSession(sessionId)
    │
    ├─── Фаза INITIAL:
    │    Директор получает вводные → формирует задание
    │    → AgentRunner запускает всех Аналитиков (Promise.allSettled)
    │    → каждый AgentRunner:
    │         LlmGateway → OpenRouter/Perplexity API
    │         → стриминг через WebSocket (session.gateway.ts)
    │         → сохранение Message в БД + token tracking
    │
    ├─── Фаза DISCUSSION (раунды):
    │    RoundManager собирает контекст (суммари + текущие идеи)
    │    → Директор оценивает:
    │         ├── нужен ресерч? → call_researcher tool → PerplexityProvider
    │         ├── продолжить? → следующий раунд
    │         └── консенсус? → переход к SCORING
    │    → Аналитики отвечают по кругу/параллельно
    │    → WebSocket стримит каждый ответ
    │
    ├─── Фаза SCORING:
    │    Директор запрашивает ICE/RICE от каждого аналитика
    │    → парсинг скоров в Idea.scores (JSON)
    │
    └─── Фаза FINAL:
         Директор агрегирует → ReportsService создаёт Report
         → WebSocket: report:ready
         → UI показывает вкладку Отчёт

Pause/Resume:
    POST /api/sessions/:id/pause → status = PAUSED, текущий агент дозавершает
    POST /api/sessions/:id/resume → status = RUNNING, продолжение с того же раунда

User Message (в любой момент):
    POST /api/sessions/:id/message → создаёт USER_INITIATED раунд
    → Директор → Аналитики по кругу → Директор суммаризирует
    → НЕ уменьшает оставшиеся раунды
```

### Правила слоёв

- **Transport**: тонкие адаптеры — парсинг ввода + вызов core-сервисов + форматирование ответа. Без бизнес-логики
- **Controllers (Admin)**: тонкие — только guards + DTO + вызов service
- **Use-cases**: для НОВОГО кода (один use-case = одна бизнес-операция)
- **Services**: для СУЩЕСТВУЮЩЕГО кода (не рефакторить без необходимости)
- **Ports**: интерфейсы для абстракции infrastructure от core

### Path Aliases

```typescript
// apps/api/tsconfig.json paths:
"@core/*":         ["src/core/*"]
"@transport/*":    ["src/transport/*"]
"@integrations/*": ["src/integrations/*"]
"@shared/*":       ["src/shared/*"]
"@prisma/*":       ["src/prisma/*"]
"@config/*":       ["src/config/*"]
"@settings/*":     ["src/settings/*"]

// apps/admin/tsconfig.json paths:
"@/*":             ["./src/*"]

// packages/shared:
"@oracle/shared":  ["packages/shared/src"]

// Примеры использования:
import { SessionsService } from '@core/sessions/sessions.service';
import { OrchestratorService } from '@core/orchestrator/orchestrator.service';
import { AgentRunnerService } from '@core/orchestrator/agent-runner.service';
import { RoundManagerService } from '@core/orchestrator/round-manager.service';
import { IdeasService } from '@core/ideas/ideas.service';
import { ReportsService } from '@core/reports/reports.service';
import { PromptsService } from '@core/prompts/prompts.service';
import { LlmGatewayService } from '@integrations/llm/llm-gateway.service';
import { OpenRouterProvider } from '@integrations/llm/providers/openrouter.provider';
import { PerplexityProvider } from '@integrations/llm/providers/perplexity.provider';
import { WebSearchTool } from '@integrations/llm/tools/web-search.tool';
import { PrismaService } from '@prisma/prisma.service';
import { SettingsService } from '@settings/settings.service';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { SESSION_LIMITS, AGENT_COLORS } from '@shared/constants/session.constants';
import { SessionMode, AgentRole } from '@oracle/shared';
```

### Key Modules

| Модуль | Описание | Global | Transport |
|--------|----------|--------|-----------|
| `PrismaModule` | Prisma Client + PrismaService | ✅ | — |
| `SettingsModule` | Глобальные настройки (API-ключи, дефолты) из БД | ✅ | — |
| `AuthModule` | JWT login, JwtAuthGuard | — | REST |
| `SessionsModule` | CRUD сессий, start/pause/resume/message | — | REST |
| `OrchestratorModule` | Координация агентов: OrchestratorService, RoundManagerService, AgentRunnerService | — | — |
| `AgentsModule` | CRUD агентов в рамках сессии | — | — |
| `IdeasModule` | Управление идеями: статусы, скоринг | — | REST |
| `ReportsModule` | Финальные отчёты, экспорт CSV/JSON | — | REST |
| `PromptsModule` | CRUD промпт-шаблонов, дефолтные промпты | — | REST |
| `LlmModule` | LlmGatewayService + провайдеры (OpenRouter, Perplexity) | — | — |
| `SessionGatewayModule` | WebSocket gateway для real-time стриминга | — | WS |

### Module Dependency Graph

```
SessionsController
    └── SessionsService
         └── OrchestratorService
              ├── RoundManagerService
              │    ├── PrismaService (rounds, messages, ideas)
              │    └── LlmGatewayService (суммаризация раундов)
              ├── AgentRunnerService
              │    ├── LlmGatewayService
              │    │    ├── OpenRouterProvider
              │    │    └── PerplexityProvider
              │    ├── WebSearchTool
              │    └── SessionGateway (WebSocket emit)
              ├── IdeasService
              ├── ReportsService
              └── SettingsService

PromptsController → PromptsService → PrismaService
SettingsController → SettingsService → PrismaService
AuthController → AuthService → PrismaService
ReportsController → ReportsService → PrismaService
```

### Key Domain Concepts

| Concept | Описание | Расположение |
|---------|----------|-------------|
| Session | Одна сессия «совета директоров». Содержит конфиг агентов, режим, фильтры, статус, стоимость | `@core/sessions` |
| Agent | Экземпляр агента в сессии: роль + модель + промпт + провайдер | `@core/agents` |
| Round | Один раунд обсуждения. Типы: INITIAL, DISCUSSION, RESEARCH, SCORING, USER_INITIATED, FINAL | `@core/orchestrator` |
| Message | Сообщение в чате от агента/пользователя/системы. Включает token tracking и tool calls | `@core/orchestrator` |
| Idea | Бизнес-идея. Статусы: PROPOSED → ACTIVE → FINAL/REJECTED. Содержит скоринг от каждого аналитика | `@core/ideas` |
| Report | Финальный структурированный отчёт сессии с агрегированными данными | `@core/reports` |
| PromptTemplate | Шаблон системного промпта. Привязка к роли + модели, флаг isDefault | `@core/prompts` |
| Setting | Key-value настройка (API-ключи, дефолтные параметры) | `@settings` |
| LlmProvider | Абстракция над LLM-провайдером (OpenRouter, Perplexity, будущие) | `@integrations/llm` |
| ToolCall | Вызов тулзы агентом: web_search (все), call_researcher (только Директор) | `@integrations/llm/tools` |

### LLM Integration Rules

- Единый интерфейс `LlmProvider` для всех провайдеров: `chat()` + `chatStream()`
- OpenAI SDK (`openai` npm) как унифицированный клиент для OpenRouter и Perplexity (оба OpenAI-совместимые)
- **Провайдер определяется по полю `agent.provider`**: `openrouter` → OpenRouterProvider, `perplexity` → PerplexityProvider
- Стриминг обязателен: каждый ответ агента стримится через WebSocket в UI
- Tool calls обрабатываются в цикле внутри AgentRunnerService (максимум 5 tool calls за один ход)
- **web_search** доступен всем агентам (реализация через Serper API или OpenRouter native)
- **call_researcher** доступен только Директору; вызывает PerplexityProvider; лимит на сессию
- Token tracking: каждый LLM-вызов возвращает `tokensInput`, `tokensOutput`, `costUsd`; сохраняется в Message и агрегируется в Session
- Стоимость рассчитывается по MODEL_REGISTRY (цены за 1K tokens)
- **Retry**: 3 попытки с exponential backoff (1s, 2s, 4s); если не помогло → пауза сессии
- **Таймаут**: 120 сек на ответ агента (настраиваемо); таймаут → retry → если Директор → пауза
- API-ключи читаются из SettingsService (БД) с fallback на env-переменные
- Промпты: подстановка `{{SESSION_FILTERS}}`, `{{INPUT_PROMPT}}`, `{{EXISTING_IDEAS}}` перед отправкой
- Контекстное окно: начиная с раунда 3, предыдущие раунды суммаризируются Директором (отдельный LLM-вызов)
- **Будущие провайдеры** (заложены как заглушки): AnthropicDirect, OpenAIDirect, GoogleDirect, ClaudeCodeSdk

### Constants (не магические числа)

```typescript
// @shared/constants/session.constants.ts
export const SESSION_LIMITS = {
  MIN_ANALYSTS: 2,
  MAX_ANALYSTS: 6,
  DEFAULT_ANALYSTS: 3,
  MIN_ROUNDS: 1,
  MAX_ROUNDS: 15,
  DEFAULT_MAX_ROUNDS: 5,
  DEFAULT_MAX_RESEARCH_CALLS: 5,
  MAX_RESEARCH_CALLS: 10,
  DEFAULT_MAX_IDEAS_FINAL: 3,
  MAX_IDEAS_FINAL: 10,
} as const;

// @shared/constants/agent.constants.ts
export const AGENT_DEFAULTS = {
  TIMEOUT_MS: 120_000,
  MAX_TOOL_CALLS_PER_TURN: 5,
  RETRY_ATTEMPTS: 3,
  RETRY_BASE_DELAY_MS: 1_000,
  CONTEXT_SUMMARIZE_FROM_ROUND: 3,
  SUMMARY_MAX_WORDS: 500,
} as const;

export const AGENT_COLORS = {
  DIRECTOR: 'blue',
  ANALYST_1: 'emerald',
  ANALYST_2: 'orange',
  ANALYST_3: 'yellow',
  ANALYST_4: 'cyan',
  ANALYST_5: 'pink',
  ANALYST_6: 'red',
  RESEARCHER: 'purple',
  USER: 'green',
  SYSTEM: 'gray',
} as const;

// @shared/constants/llm.constants.ts
export const LLM_DEFAULTS = {
  TEMPERATURE: 0.7,
  MAX_TOKENS: 4096,
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  PERPLEXITY_BASE_URL: 'https://api.perplexity.ai',
} as const;

// @shared/constants/pagination.constants.ts
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
  MESSAGES_DEFAULT_LIMIT: 100,
} as const;

// @shared/constants/auth.constants.ts
export const AUTH = {
  JWT_EXPIRES_IN: '7d',
  BCRYPT_SALT_ROUNDS: 10,
  API_KEY_MASK_LENGTH: 4,
} as const;
```

---

## 🛠️ COMMANDS

### Backend (apps/api)

```bash
# Разработка
yarn dev                    # Запуск dev сервера (port 3001)
yarn build                  # Production сборка
yarn start:prod             # Запуск production

# База данных
yarn db:generate            # Генерация Prisma Client
yarn db:migrate             # Создание миграции
yarn db:migrate:prod        # Применение миграций (production)
yarn db:seed                # Seed данных (создание админа + промпт-шаблоны)
yarn db:studio              # Prisma Studio GUI

# Линтинг
yarn lint                   # ESLint проверка
yarn lint:fix               # ESLint с авто-исправлением
yarn lint:errors            # Только ошибки (без warnings)
yarn format                 # Prettier форматирование

# Тесты
yarn test                   # Unit тесты
yarn test:watch             # Тесты в watch режиме
yarn test:cov               # Тесты с coverage
yarn test:e2e               # E2E тесты
```

### Admin Panel (apps/admin)

```bash
# Разработка
yarn dev                    # Запуск dev сервера (port 3000)
yarn build                  # Production сборка
yarn preview                # Preview production сборки

# Линтинг
yarn lint                   # ESLint проверка
yarn lint:fix               # ESLint с авто-исправлением
yarn lint:errors            # Только ошибки
yarn format                 # Prettier форматирование
```

### Monorepo (root)

```bash
yarn dev                    # Запуск всех apps (Turborepo)
yarn build                  # Build всех apps
yarn db:generate            # Proxy → apps/api db:generate
yarn db:migrate             # Proxy → apps/api db:migrate
```

---

## 🧪 TESTING

**Запуск:**

```bash
yarn test                   # Все unit тесты
yarn test auth              # Тесты для auth модуля
yarn test:e2e               # E2E тесты (нужна БД)
```

### Backend Unit тесты

- При добавлении сервиса в constructor — добавлять mock в тесты
- pgvector: мокать embedding-запросы в тестах (не вызывать OpenAI)
- Jest moduleNameMapper: паттерн `^@prisma/(.*)$` ловит node_modules, использовать `^@prisma/prisma\\.(.*)$`

### Что обязательно покрыть тестами (backend)

- **OrchestratorService**: полный цикл сессии (start → rounds → finalize), pause/resume, user message → доп. раунд
- **RoundManagerService**: buildAgentContext (проверка сжатия контекста с раунда 3+), summarizePreviousRounds
- **AgentRunnerService**: обработка tool calls (web_search, call_researcher), retry логика, таймауты
- **LlmGatewayService**: routing по провайдеру, fallback при ошибках, расчёт стоимости
- **OpenRouterProvider / PerplexityProvider**: формирование запросов, парсинг ответов (мокать HTTP)
- **SessionsService**: создание сессии с агентами, валидация фильтров, увеличение maxRounds
- **IdeasService**: смена статусов (PROPOSED → ACTIVE → FINAL/REJECTED), агрегация скоров
- **ReportsService**: формирование JSON-отчёта, экспорт CSV/JSON
- **PromptsService**: подстановка {{SESSION_FILTERS}} / {{INPUT_PROMPT}}, выбор дефолтного промпта по роли+модели
- **AuthService**: login, JWT генерация/валидация

### Admin Panel (рекомендации)

- **SessionConfigForm**: создание сессии с агентами, валидация (мин. 2 аналитика, обязательный промпт)
- **ModelSelector**: фильтрация моделей по доступности API-ключа
- **PromptEditor**: автоматическая смена промпта при смене модели
- **SessionChat**: рендеринг сообщений с разметкой по раундам, стриминг через WebSocket
- **SessionControls**: pause/resume/stop, увеличение раундов, отправка сообщения
- **IdeaTable**: сортировка по ICE/RICE, развёртывание деталей

**Рекомендуемый стек:**

- Vitest (вместо Jest для Vite)
- React Testing Library
- MSW (Mock Service Worker)

---

## 📐 TYPESCRIPT & CLEAN CODE

### Обязательно

- Следовать **SOLID** принципам
- Следовать **Clean Code** практикам
- Композиция > наследование

### Типизация

- `unknown` вместо `any` на границах системы (HTTP, queue, webhook, LLM API responses)
- `never` для невозможных веток + `assertUnreachable()`
- Явный return type для публичных методов/use-cases
- Generics/abstract — только когда реально уменьшают дублирование

### Классы

- `private` по умолчанию, наружу только необходимое
- DTO — отдельные типы (не переиспользовать entity)

### Функции

- Чистые (functional core) или явно побочные (imperative shell)
- Дублирование кода ≥2 мест → выносить в utils/helpers
- Дублирование типов ≥2 мест → выносить тип

---

## 🛡️ RELIABILITY & SECURITY

### Валидация

- На границах: class-validator + понятные ошибки
- ValidationPipe: `whitelist + forbidNonWhitelisted + transform`
- LLM API responses: валидировать структуру перед сохранением (tool calls, usage, content)

### Ошибки

- Ожидаемые → Result/Either паттерн
- Неожиданные → throw + логирование
- Публичные use-cases: перечислять коды ошибок в JSDoc/Swagger
- LLM ошибки: classify (auth → refresh key, rate_limit → backoff + retry, timeout → retry, other → pause session)
- OpenRouter fail → retry 3x → pause session с уведомлением через WebSocket

### Идемпотентность

- Webhook/queue handlers ОБЯЗАНЫ быть идемпотентны
- Ретраи: dead-letter queue + exponential backoff
- Side-effects после записи факта

### Redis

- TTL обязателен для кэша
- Конкурентный доступ: `SET key value NX PX` / Lua scripts
- Атомарные операции где возможно

### Prisma

- Нет N+1: осознанно использовать `select`/`include`
- Batching где нужно (createMany, updateMany)
- Пагинация по умолчанию для списков + лимиты
- Nullable Json поля: использовать spread `...(value && { field: value as unknown as Prisma.InputJsonValue })`
- pgvector: использовать raw SQL для similarity search (`<=>` оператор)

### Трассировка

- Каждый запрос/job имеет `correlationId`
- Каждая сессия имеет `sessionId` для группировки логов
- Логировать: начало/конец раунда, вызовы LLM (модель + tokens + cost), ошибки
- Не логировать секреты/PII, маскировать API-ключи и токены

---

## 🔐 AUTH & ACCESS

### Admin Panel (HTTP)

- `POST /api/auth/login` — email/пароль → JWT token
- `JwtAuthGuard` — проверка Bearer token на защищённых endpoints
- Все пользователи равноправные админы (нет ролей)
- Управление пользователями только через БД (нет UI для регистрации/смены пароля)
- JWT хранится в localStorage на клиенте, auto-inject через API client

---

## 📝 API & DOCUMENTATION

### Swagger (обязательно для новых endpoints)

- `@ApiTags`, `@ApiOperation`, `@ApiResponse`
- `@ApiParam`, `@ApiQuery` при наличии параметров
- Комментарии на русском
- Swagger доступен: `/api/docs`

### DTO

- Входные данные всегда через DTO с валидацией
- Обновлять DTO/types в том же PR что и код
- Admin API DTOs: `LoginDto`, `CreateSessionDto`, `UpdateSessionDto`, `SendMessageDto`, `CreatePromptDto`, `UpdateSettingsDto`, `ExportReportDto`

### Основные API Endpoints

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/login` | Авторизация → JWT |
| GET | `/api/auth/me` | Текущий пользователь |
| GET | `/api/sessions` | Список сессий (с пагинацией) |
| POST | `/api/sessions` | Создание сессии + агентов |
| GET | `/api/sessions/:id` | Детали сессии |
| PATCH | `/api/sessions/:id` | Обновление настроек |
| DELETE | `/api/sessions/:id` | Удаление сессии |
| POST | `/api/sessions/:id/start` | Запуск сессии |
| POST | `/api/sessions/:id/pause` | Пауза |
| POST | `/api/sessions/:id/resume` | Возобновление (+ опц. сообщение) |
| POST | `/api/sessions/:id/message` | Сообщение → доп. раунд |
| PATCH | `/api/sessions/:id/max-rounds` | Увеличение лимита раундов |
| GET | `/api/sessions/:id/messages` | Все сообщения сессии |
| GET | `/api/sessions/:id/ideas` | Идеи сессии |
| GET | `/api/sessions/:id/report` | Финальный отчёт |
| GET | `/api/sessions/:id/report/export` | Экспорт (CSV/JSON) |
| GET/POST/PATCH/DELETE | `/api/prompts` | CRUD промпт-шаблонов |
| GET/PATCH | `/api/settings` | Настройки (API-ключи) |
| GET | `/api/models` | Список доступных моделей |

---

## 🖥️ FRONTEND

### Admin Panel (Next.js 16)

- **Framework**: Next.js 16 (App Router) + React 19
- **State**: Zustand 5 (auth store с persist) + TanStack React Query 5 (server state)
- **UI**: Shadcn UI + Radix + Tailwind CSS 4 + Lucide icons + Sonner toasts
- **Real-time**: Socket.io client для WebSocket стриминга сообщений агентов
- **Auth**: JWT в localStorage, auto-inject в API client
- Functional components с TypeScript interfaces
- Prefer interfaces over types; avoid enums (use maps)
- Dark theme по умолчанию (внутренний инструмент)
- Named exports для компонентов
- Директории: lowercase-with-dashes (`components/session-config`)
- Error Boundaries для обработки ошибок
- i18n через context для локализации (en, ru)

### Key Admin Components

| Компонент | Описание | Расположение |
|-----------|----------|-------------|
| `SessionList` | Список сессий с фильтрами, статусами, стоимостью | `components/sessions` |
| `SessionConfigForm` | Форма создания: режим, промпт, агенты, фильтры, лимиты | `components/session-config` |
| `AgentConfigurator` | Карточка агента: выбор модели + промпта + настройки | `components/session-config` |
| `ModelSelector` | Выпадающий список моделей, группировка по family | `components/session-config` |
| `PromptEditor` | Выбор шаблона + inline-редактирование; авто-смена при смене модели | `components/session-config` |
| `FiltersConfig` | Слайдеры и селекты для фильтров сессии | `components/session-config` |
| `SessionChat` | Основной чат-контейнер с WebSocket стримингом | `components/chat` |
| `MessageBubble` | Одно сообщение: цвет по роли, имя+модель, время, стоимость, tool calls | `components/chat` |
| `RoundDivider` | Горизонтальный разделитель раундов (номер + тип + цвет) | `components/chat` |
| `SessionControls` | Pause/Resume/Stop, индикатор раундов, кнопка [+], поле ввода | `components/chat` |
| `ToolCallDisplay` | Сворачиваемый блок: запрос и результат web_search/call_researcher | `components/chat` |
| `AgentStatusBar` | Индикатор «думает» для каждого агента | `components/chat` |
| `ReportView` | Вкладка «Отчёт»: таблица идей + скоринг + отброшенные + экспорт | `components/report` |
| `IdeaTable` | Таблица финальных идей с ICE/RICE, клик → раскрытие деталей | `components/report` |
| `ScoringChart` | Bar chart сравнения оценок аналитиков (recharts) | `components/report` |
| `RejectedIdeasList` | Сворачиваемый список отброшенных идей с причинами | `components/report` |
| `ExportButtons` | Кнопки экспорта CSV/JSON | `components/report` |
| `TokenCounter` | Отображение потраченных токенов и стоимости (на сообщение + суммарно) | `components/ui` |
| `ApiKeysForm` | Управление API-ключами провайдеров | `components/admin` |
| `PromptTemplateList` | Список шаблонов с фильтрами по роли/модели | `components/admin` |
| `PromptTemplateEditor` | Редактор промпта с syntax highlighting | `components/admin` |

---

## ✅ DEFINITION OF DONE

- [ ] TS компиляция без ошибок
- [ ] использован `yarn lint:fix`
- [ ] `yarn lint:errors` проходит
- [ ] Миграции не ломают данные
- [ ] DTO/types/interfaces обновлены
- [ ] Providers добавлены в modules
- [ ] Локали обновлены (en, ru)
- [ ] Swagger актуален
- [ ] Нет технического долга
- [ ] Unit тесты для критических путей
- [ ] Документация модуля в apps/docs/ обновлена
