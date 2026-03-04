# Oracle — Схема базы данных

## Расположение

```
apps/api/prisma/
├── schema.prisma
├── migrations/
└── seed.ts
```

## ORM

Prisma (PostgreSQL). Миграции строго через `yarn prisma migrate dev --name {name}`.

**Запреты:**
- ❌ `prisma db push --accept-data-loss`
- ❌ `--reset` в командах миграции

## Схема

### users

Простая авторизация. Все пользователи — равноправные админы. Редактирование пароля и email — только через БД напрямую. Регистрация через UI отсутствует.

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String   // bcrypt hash, AUTH.BCRYPT_SALT_ROUNDS раундов
  name      String
  createdAt DateTime @default(now())

  sessions  Session[]
}
```

### sessions

Основная сущность. Каждая сессия = один «чат» с агентами.

```prisma
model Session {
  id              String        @id @default(uuid())
  userId          String
  user            User          @relation(fields: [userId], references: [id])
  
  title           String
  mode            SessionMode   // GENERATE | VALIDATE
  status          SessionStatus // CONFIGURING | RUNNING | PAUSED | COMPLETED | ERROR
  
  /// Основной промпт/задание от пользователя
  inputPrompt     String        @db.Text
  /// JSON-массив идей для режима VALIDATE (nullable)
  existingIdeas   String?       @db.Text
  
  /// Настройки фильтров: { maxComplexity, maxBudget, timeToRevenue, … }
  filters         Json
  
  /// Лимиты раундов (используются константы SESSION_LIMITS)
  maxRounds       Int           @default(5)   // SESSION_LIMITS.DEFAULT_MAX_ROUNDS
  currentRound    Int           @default(0)
  maxResearchCalls Int          @default(5)   // SESSION_LIMITS.DEFAULT_MAX_RESEARCH_CALLS
  researchCallsUsed Int         @default(0)
  
  /// Token tracking
  totalTokensInput  Int         @default(0)
  totalTokensOutput Int         @default(0)
  totalCostUsd      Float       @default(0)
  
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  completedAt     DateTime?
  
  agents          Agent[]
  rounds          Round[]
  messages        Message[]
  ideas           Idea[]
  report          Report?

  @@index([userId, createdAt])
}

enum SessionMode {
  GENERATE
  VALIDATE
}

enum SessionStatus {
  CONFIGURING
  RUNNING
  PAUSED
  COMPLETED
  ERROR
}
```

### agents

Конфигурация каждого агента в сессии. Каждый агент привязан к конкретной сессии с конкретной моделью и промптом.

```prisma
model Agent {
  id            String    @id @default(uuid())
  sessionId     String
  session       Session   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  
  role          AgentRole // DIRECTOR | ANALYST | RESEARCHER
  /// Отображаемое имя: "Аналитик 1 (Claude)", "Директор" и т.д.
  name          String
  
  /// LLM-конфигурация
  provider      String    // "openrouter" | "perplexity" | "anthropic" | "openai" | "google"
  modelId       String    // "anthropic/claude-sonnet-4-5" | "openai/gpt-5" | …
  systemPrompt  String    @db.Text
  
  /// Тулзы
  webSearchEnabled Boolean @default(true)
  
  /// Token tracking (агрегация)
  totalTokensInput  Int   @default(0)
  totalTokensOutput Int   @default(0)
  totalCostUsd      Float @default(0)
  
  messages      Message[]
  
  createdAt     DateTime  @default(now())
}

enum AgentRole {
  DIRECTOR
  ANALYST
  RESEARCHER
}
```

### rounds

Раунды обсуждения. Нужны для чёткой визуальной разметки в UI.

```prisma
model Round {
  id          String      @id @default(uuid())
  sessionId   String
  session     Session     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  
  number      Int
  type        RoundType
  status      RoundStatus // IN_PROGRESS | COMPLETED | CANCELLED
  
  /// Если раунд инициирован пользователем — его сообщение
  userMessage String?     @db.Text
  
  startedAt   DateTime    @default(now())
  completedAt DateTime?
  
  messages    Message[]

  @@index([sessionId, number])
}

enum RoundType {
  INITIAL          // Первый раунд: аналитики генерируют идеи
  DISCUSSION       // Раунды обсуждения
  RESEARCH         // Раунд с участием ресерчера
  SCORING          // Финальный скоринг
  USER_INITIATED   // Раунд от пользователя (не расходует лимит)
  FINAL            // Финализация директором
}

enum RoundStatus {
  IN_PROGRESS
  COMPLETED
  CANCELLED
}
```

### messages

Все сообщения всех агентов. Основа чат-интерфейса.

```prisma
model Message {
  id          String   @id @default(uuid())
  sessionId   String
  session     Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  roundId     String
  round       Round    @relation(fields: [roundId], references: [id], onDelete: Cascade)
  agentId     String?  // null для USER и SYSTEM сообщений
  agent       Agent?   @relation(fields: [agentId], references: [id])
  
  role        MessageRole // AGENT | USER | SYSTEM | DIRECTOR_DECISION
  content     String      @db.Text
  
  /// Метаданные LLM-вызова
  modelUsed       String?
  tokensInput     Int?
  tokensOutput    Int?
  costUsd         Float?
  latencyMs       Int?
  
  /// Tool calls: [{ tool, query, result }]
  toolCalls   Json?
  
  createdAt   DateTime  @default(now())

  @@index([sessionId, createdAt])
}

enum MessageRole {
  AGENT
  USER
  SYSTEM
  DIRECTOR_DECISION
}
```

### ideas

Все идеи сессии — финальные и отброшенные.

```prisma
model Idea {
  id              String    @id @default(uuid())
  sessionId       String
  session         Session   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  
  title           String
  summary         String    @db.Text
  status          IdeaStatus // PROPOSED | ACTIVE | REJECTED | FINAL
  
  /// Кто предложил
  proposedByAgentId String?
  proposedInRound   Int?
  
  /// Если отклонена
  rejectedInRound   Int?
  rejectionReason   String?   @db.Text
  
  /// Детали: { implementation, competitors, risks, opportunities,
  ///           budget, cpl, unitEconomics, investmentsInNiche, timeToRevenue }
  details         Json?
  
  /// Скоринг от каждого аналитика:
  /// { "agentId": { ice: { impact, confidence, ease, total }, rice: { reach, impact, confidence, effort, total } } }
  scores          Json?
  avgIce          Float?
  avgRice         Float?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([sessionId, status])
}

enum IdeaStatus {
  PROPOSED
  ACTIVE
  REJECTED
  FINAL
}
```

### report

Финальный отчёт сессии.

```prisma
model Report {
  id          String   @id @default(uuid())
  sessionId   String   @unique
  session     Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  
  /// Полный JSON: финальные идеи, скоринг, отброшенные, итоги
  content     Json
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### prompt_templates

Шаблоны системных промптов. Дефолтные для каждой комбинации роли и модели + пользовательские.

```prisma
model PromptTemplate {
  id          String   @id @default(uuid())
  
  role        AgentRole // DIRECTOR | ANALYST | RESEARCHER
  /// null = универсальный fallback; "anthropic/claude-*" = для конкретной модели
  modelId     String?
  
  name        String
  content     String    @db.Text
  isDefault   Boolean   @default(false)
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([role, modelId])
}
```

### settings

Глобальные настройки: API-ключи, дефолтные значения. Key-value.

```prisma
model Setting {
  key       String   @id
  value     String   @db.Text
  updatedAt DateTime @updatedAt
}
```

**Стандартные ключи:**

| Ключ | Описание |
|------|----------|
| `openrouter_api_key` | API-ключ OpenRouter |
| `perplexity_api_key` | API-ключ Perplexity |
| `anthropic_api_key` | (будущее) прямой API Anthropic |
| `openai_api_key` | (будущее) прямой API OpenAI |
| `google_api_key` | (будущее) прямой API Google |
| `serper_api_key` | Serper API для web search |
| `default_max_rounds` | Дефолтный макс. раундов |
| `default_analyst_count` | Дефолтное кол-во аналитиков |
| `default_director_model` | Дефолтная модель директора |
| `default_researcher_model` | Дефолтная модель ресерчера |

API-ключи читаются из `SettingsService` с fallback на env-переменные. В UI маскируются: `sk-or-...xxxx` (последние `AUTH.API_KEY_MASK_LENGTH` символов).

## Prisma Best Practices (из CLAUDE.md)

- Нет N+1: осознанно использовать `select`/`include`
- Batching: `createMany`, `updateMany`
- Пагинация по умолчанию для списков (константы `PAGINATION.DEFAULT_LIMIT`, `PAGINATION.MAX_LIMIT`)
- Nullable Json: `...(value && { field: value as unknown as Prisma.InputJsonValue })`
- pgvector: raw SQL для similarity search (`<=>`)

## Seed (`apps/api/prisma/seed.ts`)

Создаёт:
1. Админ-пользователя (email + bcrypt-пароль из env: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`)
2. Дефолтные промпт-шаблоны для каждой роли + модели (см. 04-AGENTS.md)
3. Дефолтные настройки (API-ключи = пустые строки, лимиты = значения из `SESSION_LIMITS`)

```bash
yarn db:seed
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
