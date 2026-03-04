# Oracle — Backend (`apps/api`, NestJS)

## Структура проекта

```
apps/api/src/
├── main.ts
├── app.module.ts
├── core/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts        // POST /api/auth/login, GET /api/auth/me
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts
│   │   └── dto/
│   │       └── login.dto.ts
│   ├── sessions/
│   │   ├── sessions.module.ts
│   │   ├── sessions.controller.ts
│   │   ├── sessions.service.ts
│   │   └── dto/
│   │       ├── create-session.dto.ts
│   │       ├── update-session.dto.ts
│   │       ├── send-message.dto.ts
│   │       └── update-max-rounds.dto.ts
│   ├── orchestrator/
│   │   ├── orchestrator.module.ts
│   │   ├── orchestrator.service.ts       // Основная логика: start, pause, resume, handleUserMessage
│   │   ├── round-manager.service.ts      // Управление раундами и контекстом
│   │   └── agent-runner.service.ts       // Запуск агента (LLM-вызов + tool calls)
│   ├── agents/
│   │   ├── agents.module.ts
│   │   └── agents.service.ts
│   ├── ideas/
│   │   ├── ideas.module.ts
│   │   ├── ideas.controller.ts
│   │   └── ideas.service.ts
│   ├── reports/
│   │   ├── reports.module.ts
│   │   ├── reports.controller.ts         // GET report, export CSV/JSON
│   │   └── reports.service.ts
│   └── prompts/
│       ├── prompts.module.ts
│       ├── prompts.controller.ts
│       ├── prompts.service.ts
│       └── defaults/                     // Дефолтные промпты для seed
│           ├── director.prompt.ts
│           ├── analyst-claude.prompt.ts
│           ├── analyst-gpt.prompt.ts
│           ├── analyst-gemini.prompt.ts
│           └── researcher.prompt.ts
├── integrations/
│   └── llm/
│       ├── llm.module.ts
│       ├── llm-gateway.service.ts        // Абстракция над провайдерами
│       ├── providers/
│       │   ├── openrouter.provider.ts
│       │   ├── perplexity.provider.ts
│       │   ├── anthropic-direct.provider.ts   // (будущее — заглушка)
│       │   ├── openai-direct.provider.ts      // (будущее — заглушка)
│       │   ├── google-direct.provider.ts      // (будущее — заглушка)
│       │   └── claude-code-sdk.provider.ts    // (будущее — заглушка)
│       └── tools/
│           └── web-search.tool.ts
├── transport/
│   └── gateway/
│       └── session.gateway.ts            // WebSocket: только emit, без логики
├── shared/
│   ├── guards/
│   │   └── jwt-auth.guard.ts
│   ├── decorators/
│   │   └── current-user.decorator.ts
│   ├── filters/
│   │   └── global-exception.filter.ts
│   ├── constants/
│   │   ├── session.constants.ts          // SESSION_LIMITS
│   │   ├── agent.constants.ts            // AGENT_DEFAULTS, AGENT_COLORS
│   │   ├── llm.constants.ts              // LLM_DEFAULTS
│   │   ├── pagination.constants.ts       // PAGINATION
│   │   └── auth.constants.ts             // AUTH
│   └── interfaces/
│       └── index.ts                      // Единственный допустимый barrel — для типов
├── config/
│   ├── models.registry.ts                // MODEL_REGISTRY: все доступные модели
│   └── env.validation.ts                 // Joi/Zod валидация env
├── prisma/
│   ├── prisma.module.ts                  // Global: true
│   └── prisma.service.ts
└── settings/
    ├── settings.module.ts                // Global: true
    ├── settings.controller.ts
    └── settings.service.ts               // get/set с fallback на process.env
```

## REST API

Все endpoints имеют Swagger-декораторы: `@ApiTags`, `@ApiOperation`, `@ApiResponse` на русском.
Все endpoints (кроме auth/login) защищены `JwtAuthGuard`.
Swagger UI доступен: `/api/docs`.

### Auth

```
POST /api/auth/login
  Body: LoginDto { email: string, password: string }
  Response: { accessToken: string, user: { id, name, email } }
  @ApiTags('Авторизация')
  @ApiOperation({ summary: 'Вход в систему' })

GET /api/auth/me
  Headers: Authorization: Bearer <token>
  Response: { id, name, email }
  @ApiOperation({ summary: 'Текущий пользователь' })
```

### Sessions

```
GET /api/sessions
  Query: ?page=1&limit=20&status=COMPLETED
  Response: { items: Session[], total: number, page: number }
  Пагинация: PAGINATION.DEFAULT_LIMIT, макс PAGINATION.MAX_LIMIT
  Сортировка: updatedAt desc
  @ApiTags('Сессии')
  @ApiOperation({ summary: 'Список сессий текущего пользователя' })

POST /api/sessions
  Body: CreateSessionDto
  Response: Session (со всеми agents)
  Статус начальный: CONFIGURING
  @ApiOperation({ summary: 'Создание новой сессии' })

GET /api/sessions/:id
  Response: Session + agents + counts (rounds, messages, ideas) + totalCost
  @ApiOperation({ summary: 'Детали сессии' })

PATCH /api/sessions/:id
  Body: UpdateSessionDto { title?, filters? }
  @ApiOperation({ summary: 'Обновление настроек сессии' })

DELETE /api/sessions/:id
  Response: { success: true }
  Cascade: все agents, rounds, messages, ideas, report
  @ApiOperation({ summary: 'Удаление сессии' })

POST /api/sessions/:id/start
  Response: Session
  Переход: CONFIGURING → RUNNING
  Запускает OrchestratorService.startSession()
  @ApiOperation({ summary: 'Запуск сессии' })

POST /api/sessions/:id/pause
  Response: Session
  Переход: RUNNING → PAUSED
  Текущий агент дозавершает ответ. currentRound НЕ инкрементируется.
  @ApiOperation({ summary: 'Пауза сессии' })

POST /api/sessions/:id/resume
  Body: { message?: string }
  Переход: PAUSED → RUNNING
  Если message — сначала отправляется Директору, потом продолжение.
  Оставшиеся раунды сохраняются.
  @ApiOperation({ summary: 'Возобновление сессии' })

POST /api/sessions/:id/message
  Body: SendMessageDto { content: string }
  Создаёт USER_INITIATED раунд.
  Работает в любом статусе кроме CONFIGURING.
  Сообщение → Директор → Аналитики по кругу → Директор суммаризирует.
  НЕ уменьшает оставшиеся раунды (maxRounds/currentRound не меняются).
  @ApiOperation({ summary: 'Отправка сообщения — создаёт доп. раунд' })

PATCH /api/sessions/:id/max-rounds
  Body: UpdateMaxRoundsDto { maxRounds: number }
  Только увеличение (не ниже текущего currentRound).
  Макс: SESSION_LIMITS.MAX_ROUNDS
  @ApiOperation({ summary: 'Увеличение лимита раундов' })
```

### CreateSessionDto

```typescript
import { SessionMode } from '@oracle/shared';

export class CreateSessionDto {
  @ApiPropertyOptional({ description: 'Название сессии (автогенерация если пусто)' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ description: 'Режим: генерация или валидация', enum: SessionMode })
  @IsEnum(SessionMode)
  mode: SessionMode;

  @ApiProperty({ description: 'Основной промпт / задание' })
  @IsString()
  @MinLength(10)
  inputPrompt: string;

  @ApiPropertyOptional({ description: 'Существующие идеи (для режима VALIDATE)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  existingIdeas?: string[];

  @ApiProperty({ description: 'Конфигурация агентов', type: [CreateAgentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAgentDto)
  @ArrayMinSize(SESSION_LIMITS.MIN_ANALYSTS + 2) // мин: 1 Директор + 2 Аналитика + 1 Ресерчер
  agents: CreateAgentDto[];

  @ApiPropertyOptional({ description: 'Фильтры сессии' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionFiltersDto)
  filters?: SessionFiltersDto;

  @ApiPropertyOptional({ description: 'Макс. раундов', default: SESSION_LIMITS.DEFAULT_MAX_ROUNDS })
  @IsOptional()
  @IsInt()
  @Min(SESSION_LIMITS.MIN_ROUNDS)
  @Max(SESSION_LIMITS.MAX_ROUNDS)
  maxRounds?: number;

  @ApiPropertyOptional({ description: 'Макс. вызовов ресерчера', default: SESSION_LIMITS.DEFAULT_MAX_RESEARCH_CALLS })
  @IsOptional()
  @IsInt()
  @Max(SESSION_LIMITS.MAX_RESEARCH_CALLS)
  maxResearchCalls?: number;
}

export class CreateAgentDto {
  @ApiProperty({ enum: AgentRole })
  @IsEnum(AgentRole)
  role: AgentRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Провайдер: openrouter | perplexity' })
  @IsString()
  provider: string;

  @ApiProperty({ description: 'ID модели из MODEL_REGISTRY' })
  @IsString()
  modelId: string;

  @ApiPropertyOptional({ description: 'ID шаблона промпта (если не указан — дефолтный для модели)' })
  @IsOptional()
  @IsUUID()
  promptTemplateId?: string;

  @ApiPropertyOptional({ description: 'Кастомный промпт (приоритет над шаблоном)' })
  @IsOptional()
  @IsString()
  customSystemPrompt?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  webSearchEnabled?: boolean;
}

export class SessionFiltersDto {
  @IsOptional() @IsInt() @Min(1) @Max(10)
  maxComplexity?: number;

  @IsOptional() @IsNumber()
  maxBudget?: number;

  @IsOptional() @IsString()
  timeToRevenue?: string;   // "1_month" | "3_months" | "6_months"

  @IsOptional() @IsString()
  minMarketSize?: string;   // "small" | "medium" | "large"

  @IsOptional() @IsBoolean()
  requireCompetitors?: boolean;

  @IsOptional() @IsString()
  legalRiskTolerance?: string; // "low" | "medium" | "high"

  @IsOptional() @IsBoolean()
  operabilityCheck?: boolean;
}
```

### Messages

```
GET /api/sessions/:id/messages
  Query: ?roundId=xxx&page=1&limit=100
  Response: { items: Message[], total: number }
  Каждое сообщение включает: content, agent { name, role, modelId },
  round { number, type }, tokensInput, tokensOutput, costUsd, latencyMs, toolCalls.
  @ApiTags('Сообщения')
  @ApiOperation({ summary: 'Все сообщения сессии' })
```

### Ideas

```
GET /api/sessions/:id/ideas
  Query: ?status=FINAL
  @ApiTags('Идеи')
  @ApiOperation({ summary: 'Идеи сессии' })

GET /api/sessions/:id/ideas/rejected
  @ApiOperation({ summary: 'Отброшенные идеи с причинами' })
```

### Report

```
GET /api/sessions/:id/report
  Response: Report (JSON)
  @ApiTags('Отчёты')
  @ApiOperation({ summary: 'Финальный отчёт' })

GET /api/sessions/:id/report/export
  Query: ?format=csv|json
  Response: файл для скачивания
  @ApiOperation({ summary: 'Экспорт отчёта' })
```

### Prompts

```
GET /api/prompts
  Query: ?role=ANALYST&modelId=anthropic/claude-*
  @ApiTags('Промпт-шаблоны')

POST /api/prompts
  Body: CreatePromptDto { role, modelId?, name, content, isDefault? }

PATCH /api/prompts/:id
  Body: UpdatePromptDto { name?, content?, isDefault? }

DELETE /api/prompts/:id
```

### Settings

```
GET /api/settings
  Response: { [key]: string } — API-ключи маскируются
  @ApiTags('Настройки')

PATCH /api/settings
  Body: UpdateSettingsDto { [key]: string }
```

### Models

```
GET /api/models
  Response: ModelInfo[] — из MODEL_REGISTRY + проверка доступности API-ключей
  @ApiTags('Модели')
  @ApiOperation({ summary: 'Список доступных моделей' })
```

```typescript
// packages/shared/src/types/model-info.ts
export interface ModelInfo {
  id: string;              // "anthropic/claude-sonnet-4-5"
  name: string;            // "Claude Sonnet 4.5"
  provider: string;        // "openrouter"
  family: string;          // "claude" | "gpt" | "gemini" | "sonar"
  available: boolean;      // true если API-ключ провайдера задан
  costPer1kInput: number;
  costPer1kOutput: number;
  contextWindow: number;
  capabilities: string[];  // ["chat", "web_search", "reasoning"]
}
```

## WebSocket Gateway (`@transport/gateway/session.gateway.ts`)

Namespace: `/session`. **Только emit, без бизнес-логики.**

OrchestratorService/AgentRunnerService вызывают SessionGateway для отправки событий.

### Events от сервера к клиенту

```typescript
// Стриминг сообщений агента
'agent:message:start'  → { sessionId, roundId, agentId, agentName, agentRole, messageId }
'agent:message:chunk'  → { sessionId, messageId, chunk: string }
'agent:message:end'    → { sessionId, messageId, tokensInput, tokensOutput, costUsd, latencyMs }

// Tool calls
'agent:tool:start'     → { sessionId, messageId, agentId, tool: string, query: string }
'agent:tool:result'    → { sessionId, messageId, tool: string, result: string }

// Раунды
'round:start'          → { sessionId, roundId, roundNumber, roundType }
'round:end'            → { sessionId, roundId, roundNumber }

// Статус сессии
'session:status'       → { sessionId, status, currentRound, totalCostUsd }

// Идеи
'idea:update'          → { sessionId, idea: Idea }

// Отчёт
'report:ready'         → { sessionId, reportId }

// Ошибки
'session:error'        → { sessionId, error: string, agentId? }
```

### Events от клиента к серверу

```typescript
'session:join'   → { sessionId: string }
'session:leave'  → { sessionId: string }
```

## Ключевые сервисы

### OrchestratorService (`@core/orchestrator/orchestrator.service.ts`)

```typescript
@Injectable()
export class OrchestratorService {
  /**
   * Запуск полного цикла сессии.
   * CONFIGURING → RUNNING → раунды → COMPLETED
   * @throws SessionNotFoundError, SessionInvalidStatusError
   */
  async startSession(sessionId: string): Promise<void>;
  
  /**
   * Пауза. RUNNING → PAUSED. Текущий агент дозавершает.
   */
  async pauseSession(sessionId: string): Promise<void>;
  
  /**
   * Возобновление. PAUSED → RUNNING. Опционально с сообщением.
   */
  async resumeSession(sessionId: string, userMessage?: string): Promise<void>;
  
  /**
   * Пользовательское сообщение → USER_INITIATED раунд.
   * Не расходует лимит основных раундов.
   */
  async handleUserMessage(sessionId: string, content: string): Promise<void>;
}
```

#### Алгоритм startSession

```
1. Загрузить сессию с агентами
2. Статус → RUNNING (WebSocket: session:status)
3. INITIAL раунд: Директор формирует задание → Аналитики параллельно (Promise.allSettled)
4. LOOP пока currentRound < maxRounds И статус === RUNNING:
   a. Инкрементировать currentRound
   b. Ответы аналитиков → Директору
   c. Директор решает:
      - call_researcher? → RESEARCH раунд → Ресерчер → результат в контекст
      - Продолжить? → DISCUSSION раунд → Аналитики
      - Финализировать? → break
   d. Проверить: PAUSED? → break
5. SCORING раунд: аналитики скорят по ICE/RICE
6. FINAL раунд: Директор агрегирует → Report
7. Статус → COMPLETED (WebSocket: session:status + report:ready)
```

#### Алгоритм handleUserMessage

```
1. USER_INITIATED раунд (НЕ инкрементирует currentRound)
2. Сообщение пользователя → Message (role: USER)
3. Директору: "[Пользователь: ...]. Проанализируй и дай задание."
4. Директор → задание → Аналитики по кругу → Директор суммаризирует
5. Раунд COMPLETED
```

### RoundManagerService (`@core/orchestrator/round-manager.service.ts`)

```typescript
@Injectable()
export class RoundManagerService {
  /** Создать новый раунд */
  async createRound(sessionId: string, type: RoundType): Promise<Round>;
  
  /**
   * Контекст для агента. Стратегия:
   * Раунд 1-2: полная история
   * Раунд 3+:  системный промпт + вводные + суммари + текущий раунд + идеи
   * Порог: AGENT_DEFAULTS.CONTEXT_SUMMARIZE_FROM_ROUND
   */
  async buildAgentContext(agent: Agent, round: Round): Promise<ChatMessage[]>;
  
  /**
   * Суммаризация предыдущих раундов (отдельный LLM-вызов).
   * Макс: AGENT_DEFAULTS.SUMMARY_MAX_WORDS слов.
   */
  async summarizePreviousRounds(session: Session): Promise<string>;
}
```

### AgentRunnerService (`@core/orchestrator/agent-runner.service.ts`)

```typescript
@Injectable()
export class AgentRunnerService {
  /**
   * Вызвать агента: LLM + стриминг через WebSocket + обработка tool calls.
   * Таймаут: AGENT_DEFAULTS.TIMEOUT_MS
   * Retry: AGENT_DEFAULTS.RETRY_ATTEMPTS с exponential backoff
   * Макс tool calls за ход: AGENT_DEFAULTS.MAX_TOOL_CALLS_PER_TURN
   */
  async runAgent(params: RunAgentParams): Promise<AgentResponse>;
}

interface RunAgentParams {
  agent: Agent;
  messages: ChatMessage[];
  systemPrompt: string;
  tools?: ToolDefinition[];
  sessionId: string;
  roundId: string;
}

interface AgentResponse {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  latencyMs: number;
  toolCalls: ToolCallResult[];
}
```

## Обработка ошибок

```
Таймаут агента (AGENT_DEFAULTS.TIMEOUT_MS):
  1. Retry (AGENT_DEFAULTS.RETRY_ATTEMPTS раз, exponential backoff)
  2. Если не помогло + агент = Аналитик → пропустить, продолжить
  3. Если не помогло + агент = Директор → PAUSED, WebSocket: session:error

Rate limit от провайдера:
  1. Retry с exponential backoff (AGENT_DEFAULTS.RETRY_BASE_DELAY_MS * 2^attempt)
  2. Макс AGENT_DEFAULTS.RETRY_ATTEMPTS попыток
  3. Не помогло → пауза сессии

Неожиданная ошибка:
  1. Логировать (correlationId + sessionId)
  2. Статус → ERROR
  3. WebSocket: session:error
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/oracle

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key

# API Keys (fallback — приоритет у Settings из БД)
OPENROUTER_API_KEY=sk-or-...
PERPLEXITY_API_KEY=pplx-...
SERPER_API_KEY=...

# Seed
SEED_ADMIN_EMAIL=admin@besales.app
SEED_ADMIN_PASSWORD=...

# Server
PORT=3001
NODE_ENV=development
```

## Module Graph

```
AppModule
├── PrismaModule (global)
├── SettingsModule (global)
├── AuthModule
├── SessionsModule
│   └── OrchestratorModule
│       ├── LlmModule
│       │   ├── OpenRouterProvider
│       │   ├── PerplexityProvider
│       │   └── WebSearchTool
│       └── SessionGatewayModule
├── IdeasModule
├── ReportsModule
└── PromptsModule
```
