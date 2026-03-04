# Oracle — Мультиагентная система для генерации и валидации бизнес-идей

## Что это

Внутренний инструмент BeSales. «Совет директоров» из нескольких ИИ-агентов, которые параллельно генерируют идеи, обсуждают их в раундах, ищут конкурентов и рыночные данные, и выдают структурированный отчёт с RICE/ICE-скорингом.

## Философия

- **Дизрапт-логика**: «Найди готовую трубу, по которой текут деньги, вставь туда свой фильтр»
- **Мультимодельный консенсус**: Claude + GPT + Gemini дают разные перспективы
- **Быстрая реализация**: Вайб-кодинг, минимум оверинжиниринга, максимум полезности

## Стек

| Слой | Технология |
|------|-----------|
| Monorepo | Turborepo + Yarn workspaces |
| Backend | NestJS + TypeScript (`apps/api`, port 3001) |
| Frontend | Next.js 16 + React 19 + Shadcn UI + Radix + Tailwind CSS 4 (`apps/admin`, port 3000) |
| Shared Types | `packages/shared` (enums, interfaces, constants, utils) |
| Database | PostgreSQL + pgvector (Prisma ORM) |
| Cache/Queue | Redis |
| Real-time | Socket.io (WebSocket) |
| LLM Gateway | OpenAI SDK (единый для OpenRouter + Perplexity) |
| Auth | JWT (все пользователи — равные админы) |
| State (FE) | Zustand 5 + TanStack React Query 5 |
| Deploy | Railway |

## Структура монорепо

```
oracle/
├── apps/
│   ├── api/                      # NestJS backend
│   │   ├── src/
│   │   │   ├── core/             # Бизнес-логика
│   │   │   │   ├── sessions/
│   │   │   │   ├── orchestrator/
│   │   │   │   ├── agents/
│   │   │   │   ├── ideas/
│   │   │   │   ├── reports/
│   │   │   │   ├── prompts/
│   │   │   │   └── auth/
│   │   │   ├── integrations/     # Внешние сервисы
│   │   │   │   └── llm/
│   │   │   │       ├── providers/
│   │   │   │       └── tools/
│   │   │   ├── transport/        # WebSocket gateway (тонкая обёртка)
│   │   │   ├── shared/           # Guards, decorators, filters, constants, interfaces
│   │   │   ├── config/           # Env validation, model registry
│   │   │   ├── prisma/           # Prisma module + service
│   │   │   └── settings/         # API-ключи из БД + env fallback
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── test/
│   ├── admin/                    # Next.js 16 frontend
│   │   └── src/
│   │       ├── app/              # App Router pages
│   │       ├── components/       # Shadcn UI + Radix
│   │       ├── hooks/
│   │       ├── store/            # Zustand 5
│   │       ├── lib/              # API client, socket, utils
│   │       ├── types/
│   │       └── i18n/             # en.ts, ru.ts
│   └── docs/                     # Документация каждого модуля (MD)
├── packages/
│   └── shared/                   # Общие типы между api и admin
│       └── src/
│           ├── types/
│           ├── enums/
│           ├── constants/
│           └── utils/
├── docker-compose.yml            # PostgreSQL + Redis (dev)
├── turbo.json
├── package.json
├── CLAUDE.md
└── .env.example
```

## Clean Architecture

```
┌─────────────────────────────────────────────────┐
│  Transport    │ REST Controllers, WS Gateway     │
├─────────────────────────────────────────────────┤
│  Core         │ Orchestrator, Sessions, Ideas…   │
├─────────────────────────────────────────────────┤
│  Domain       │ Session, Agent, Round, Message…  │
├─────────────────────────────────────────────────┤
│  Infra        │ LlmGateway, Prisma, Redis        │
└─────────────────────────────────────────────────┘
```

**Правила слоёв:**
- Transport = тонкая обёртка (парсинг → вызов core → форматирование). Без бизнес-логики
- Прямой вызов Prisma/Redis из controllers/transport — запрещён
- Прямой вызов LLM-провайдеров из оркестратора — запрещён (только через LlmGatewayService)
- Каждый файл ≤ 1200 строк; разросся — выноси в под-сервисы
- Barrel exports запрещены — каждый импорт по прямому пути

## Роли агентов

| Роль | Кол-во | Модель (default) | Описание |
|------|--------|-----------------|----------|
| Директор | 1 | claude-sonnet-4-5 | Оркестратор. Ставит задачи, арбитражит, вызывает ресерчера, финалит отчёт |
| Аналитик | 2-6 (настр.) | claude / gpt / gemini | Генерация и критический анализ идей. Модель + промпт настраиваются в UI |
| Ресерчер | 1 | sonar-reasoning-pro | Глубокий поиск по запросу Директора |

## Два режима

1. **Generate** — аналитики генерируют идеи с нуля по вводным
2. **Validate** — аналитики анализируют уже существующие идеи

## Ключевые фичи

- Каждый агент настраивается: модель + системный промпт (дефолтные промпты зависят от модели)
- Сессия = чат, где видны все сообщения всех агентов с разметкой по раундам
- Pause/Resume: остановка и возобновление с коррективами (через Директора)
- Пользовательские сообщения в чат создают доп. раунд (не расходуют лимит основных раундов)
- Token tracking: токены + стоимость на каждый ответ и суммарно по сессии
- Финальный отчёт: таблица идей с RICE/ICE, вкладка в сессии
- У каждого агента есть доступ к веб-поиску через тулзу
- Экспорт отчёта в CSV/JSON
- Все строки UI через i18n (en, ru)
- Все endpoints покрыты Swagger-документацией (`@ApiTags`, `@ApiOperation`, `@ApiResponse`) на русском
- Документация каждого модуля в `apps/docs/`

## Команды (только yarn)

```bash
# Monorepo (root)
yarn dev                    # Все apps через Turborepo
yarn build                  # Build всех apps

# Backend (apps/api)
yarn dev                    # Port 3001
yarn db:generate            # Prisma Client
yarn db:migrate             # yarn prisma migrate dev --name {name}
yarn db:seed                # Пользователь + промпты + настройки
yarn lint:fix               # После каждой задачи
yarn test                   # Unit тесты

# Admin (apps/admin)
yarn dev                    # Port 3000
yarn build                  # Production
```

**Запреты Prisma:**
- ❌ `prisma db push --accept-data-loss`
- ❌ `--reset` в миграциях
- ✅ `yarn prisma migrate dev --name {name}`

## Path Aliases (apps/api)

```typescript
"@core/*":         ["src/core/*"]
"@transport/*":    ["src/transport/*"]
"@integrations/*": ["src/integrations/*"]
"@shared/*":       ["src/shared/*"]
"@prisma/*":       ["src/prisma/*"]
"@config/*":       ["src/config/*"]
"@settings/*":     ["src/settings/*"]
```
