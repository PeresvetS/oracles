# Oracle — AI Board of Directors

Внутренний инструмент BeSales для автоматизированной генерации и валидации бизнес-идей. Мультиагентная система «совет директоров» из нескольких ИИ-агентов (Claude, GPT, Gemini), которые параллельно генерируют идеи, обсуждают их в раундах, привлекают ресерчера (Perplexity Sonar) и выдают структурированный отчёт с RICE/ICE-скорингом.

## Архитектура

```
apps/
├── api/         # NestJS backend (port 3001)
├── admin/       # Next.js 16 admin panel (port 3000)
└── docs/        # Документация модулей
packages/
└── shared/      # Общие типы между api и admin
```

Хостинг: Railway. Docker-compose и Dockerfile используются только для Railway-деплоя, **не** для локальной разработки.

## Быстрый старт

### 1. Переменные окружения

```bash
cp .env.example apps/api/.env
```

Заполните переменные (все значения получить из Railway проекта):

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Секрет для подписи JWT токенов |
| `OPENROUTER_API_KEY` | OpenRouter API ключ (fallback, основной — в Settings) |
| `PERPLEXITY_API_KEY` | Perplexity API ключ (для ресерчера) |
| `SERPER_API_KEY` | Serper API ключ (для веб-поиска) |
| `SEED_ADMIN_EMAIL` | Email первого администратора |
| `SEED_ADMIN_PASSWORD` | Пароль первого администратора |
| `PORT` | Порт API (default: 3001) |
| `NODE_ENV` | `development` / `production` |
| `ADMIN_URL` | URL admin-панели для CORS (default: http://localhost:3000) |

### 2. Установка зависимостей

```bash
yarn install
```

### 3. База данных

БД и Redis подключаются через Railway переменные (`DATABASE_URL`, `REDIS_URL`). Для локальной разработки используйте Railway development environment.

```bash
# Применить миграции
yarn db:migrate

# Создать первого администратора + seed промптов
yarn db:seed

# Открыть Prisma Studio (GUI для БД)
yarn db:studio
```

### 4. Запуск

```bash
# Все apps одновременно (Turborepo)
yarn dev

# Только API (port 3001)
cd apps/api && yarn dev

# Только Admin (port 3000)
cd apps/admin && yarn dev
```

## Команды

### Backend (`apps/api`)

```bash
yarn dev              # Dev сервер с hot-reload
yarn build            # Production сборка
yarn start:prod       # Запуск production-сборки

yarn test             # Все unit тесты
yarn test:watch       # Тесты в watch режиме
yarn test:cov         # Тесты с coverage-отчётом

yarn lint             # Проверка ESLint
yarn lint:fix         # Авто-исправление
yarn lint:errors      # Только ошибки (без warnings)
yarn format           # Prettier форматирование

yarn db:generate      # Генерация Prisma Client
yarn db:migrate       # Создание миграции
yarn db:migrate:prod  # Применение миграций (production)
yarn db:seed          # Seed данных
yarn db:studio        # Prisma Studio GUI
```

### Admin Panel (`apps/admin`)

```bash
yarn dev              # Dev сервер (port 3000)
yarn build            # Production сборка
yarn lint:fix         # Авто-исправление
```

### Monorepo (корень)

```bash
yarn dev              # Запуск всех apps (Turborepo)
yarn build            # Build всех apps
yarn db:migrate       # Proxy → apps/api db:migrate
```

## API

Swagger-документация: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)

Health check: `GET /api/health` → `{ status: 'ok', timestamp: '...' }`

### Основные эндпоинты

| Метод | Путь | Описание |
|---|---|---|
| `POST` | `/api/auth/login` | Авторизация → JWT |
| `GET` | `/api/sessions` | Список сессий |
| `POST` | `/api/sessions` | Создание сессии |
| `POST` | `/api/sessions/:id/start` | Запуск |
| `POST` | `/api/sessions/:id/pause` | Пауза |
| `POST` | `/api/sessions/:id/resume` | Возобновление |
| `GET` | `/api/sessions/:id/report` | Финальный отчёт |
| `GET` | `/api/sessions/:id/report/export?format=csv` | Экспорт CSV/JSON |
| `GET/PATCH` | `/api/settings` | API-ключи и настройки |
| `GET` | `/api/models` | Доступные LLM-модели |

## Два режима работы

- **Generate** — аналитики генерируют бизнес-идеи с нуля по вводным пользователя
- **Validate** — аналитики анализируют уже существующие идеи

## Документация модулей

| Файл | Модуль |
|---|---|
| [`docs/sessions.md`](apps/docs/sessions.md) | Сессии: lifecycle, API |
| [`docs/orchestrator.md`](apps/docs/orchestrator.md) | Оркестратор: агенты, раунды |
| [`docs/agents.md`](apps/docs/agents.md) | Агенты: роли, конфигурация |
| [`docs/llm-gateway.md`](apps/docs/llm-gateway.md) | LLM Gateway: провайдеры |
| [`docs/ideas-and-reports.md`](apps/docs/ideas-and-reports.md) | Идеи: скоринг ICE/RICE, отчёты |
| [`docs/auth.md`](apps/docs/auth.md) | Авторизация: JWT |
| [`docs/websocket-gateway.md`](apps/docs/websocket-gateway.md) | WebSocket: real-time события |
| [`docs/error-handling.md`](apps/docs/error-handling.md) | Ошибки, логирование, rate limiting |
| [`docs/settings.md`](apps/docs/settings.md) | Настройки и API-ключи |
| [`docs/prompts.md`](apps/docs/prompts.md) | Промпт-шаблоны |
| [`docs/models.md`](apps/docs/models.md) | Реестр LLM-моделей |
| [`docs/admin-frontend.md`](apps/docs/admin-frontend.md) | Admin-панель |

## Технологии

**Backend:**
- NestJS 11, TypeScript 5
- PostgreSQL + Prisma ORM
- Redis (сессии, кэш)
- Socket.io (WebSocket стриминг)
- OpenAI SDK (OpenRouter + Perplexity)
- nestjs-pino (структурированное логирование)
- @nestjs/throttler (rate limiting)

**Admin:**
- Next.js 16, React 19
- Zustand 5 + TanStack React Query 5
- Shadcn UI + Tailwind CSS 4
- Socket.io client

**Infra:**
- Turborepo (monorepo)
- Railway (хостинг)
- Yarn 4 (PnP)
