# OrchestratorModule

## Что это

Центральный модуль координации сессий Oracle. Управляет полным жизненным циклом сессии: от запуска до финального отчёта. Оркестрирует Директора, Аналитиков и Ресерчера через LLM-вызовы с поддержкой tool calls, таймаутов, pause/resume и пользовательских сообщений.

## Зачем нужен

SessionsService отвечает за CRUD и HTTP-слой. OrchestratorModule берёт на себя всю долгоживущую бизнес-логику: запуск раундов, вызов LLM для каждого агента, tool call loop, retry, token tracking, суммаризацию контекста, паузу и возобновление сессий.

## Архитектура

```
OrchestratorModule
├── OrchestratorService     — главный оркестратор (полный цикл + pause/resume/userMessage)
├── AgentRunnerService      — chatStream стриминг + tool call loop + retry + token tracking
├── RoundManagerService     — управление раундами + контекст + суммаризация с кэшем
├── ISessionEventEmitter    — интерфейс для WebSocket-событий (реализация: SessionGateway)
├── interfaces/
│   ├── orchestrator.types.ts           — SessionWithAgents, RunAgentParams, AgentRunnerResult, MessageStartEvent, MessageChunkEvent, MessageEndEvent, ...
│   └── session-event-emitter.interface.ts  — ISessionEventEmitter + LoggerSessionEventEmitter (dev-fallback)
└── constants/
    └── orchestrator.constants.ts       — FINALIZATION_SIGNALS, tool definitions, промпты
```

## Жизненный цикл сессии

```
SessionsService.start(id)
    │ setImmediate (fire-and-forget)
    ▼
OrchestratorService.startSession(sessionId)
    │
    ├── acquire run-lock (1 активный оркестраторный цикл на sessionId)
    │
    ├── Валидация: status=RUNNING, 1 Director + ≥2 Analysts
    │
    ├── INITIAL раунд:
    │   1. Директор формирует ТЗ аналитикам (без call_researcher на этом шаге)
    │   2. Аналитики параллельно (Promise.allSettled) генерируют идеи
    │   3. Идеи из ответов аналитиков парсятся и сохраняются в Idea (dedupe по title)
    │   3. Директор повторно синтезирует ответы аналитиков в том же раунде
    │   * Если первый ответ Директора пустой — сохраняется fallback-задача в историю и в контекст аналитиков
    │
    ├── DISCUSSION LOOP (while currentRound < maxRounds):
    │   1. Проверка флага паузы/статуса PAUSED перед каждым новым раундом
    │   2. Директор формулирует задание на раунд (без call_researcher на этом шаге)
    │   3. Аналитики параллельно (Promise.allSettled) дают ответы по текущему фокусу
    │   4. После ответов аналитиков идеи снова парсятся и добавляются в пул сессии
    │   5. Директор получает ответы аналитиков и принимает решение:
    │      - сигнал финализации? → break
    │      - вызван call_researcher? → раунд помечается как RESEARCH, переход к следующему раунду
    │      - иначе → CONTINUE (следующий DISCUSSION раунд)
    │   6. После каждого хода (Директор/Аналитики/Директор) повторная проверка паузы
    │   7. currentRound обновляется только после завершения раунда
    │   * В режиме VALIDATE аналитики всегда получают дополнительную guard-инструкцию «только existingIdeas»
    │   * На каждый ход аналитикам добавляется явная user-инструкция с заданием Директора; в VALIDATE туда принудительно подмешиваются inputPrompt + existingIdeas
    │
    ├── SCORING раунд:
    │   Каждый аналитик оценивает идеи по ICE/RICE
    │
    ├── FINAL раунд:
    │   Директор формирует итоговый отчёт
    │
    └── status → COMPLETED

Pause/Resume:
    SessionsService.pause() → DB status=PAUSED → OrchestratorService.pauseSession() выставляет флаг isPausing
    Loop проверяет флаг после каждого хода и завершает оркестрацию с результатом 'paused'

    SessionsService.resume() → DB status=RUNNING → OrchestratorService.resumeSession()
    → если есть message: Message(USER) в текущий раунд + отдельный ответ Директора
    → continueFromDiscussionLoop()
    → если для этой сессии уже есть активный run-loop, новый resume-loop не запускается (защита от дублей раундов)

User Message:
    SessionsService.sendMessage() → OrchestratorService.handleUserMessage()
    → USER_INITIATED раунд: saveUserMessage → Директор → Аналитики → Директор синтез
    → НЕ расходует лимит maxRounds
    → при ошибке: emitSessionError (не failSession)
```

## Ключевые сервисы

### OrchestratorService

| Метод | Описание |
|-------|----------|
| `startSession(sessionId)` | Полный цикл: INITIAL → DISCUSSION → SCORING → FINAL → COMPLETED |
| `pauseSession(sessionId)` | Выставляет in-memory флаг паузы и эмитит событие PAUSED |
| `resumeSession(sessionId, message?)` | Сбрасывает флаг паузы, опционально добавляет user message в текущий раунд, затем продолжает цикл (если не активен другой run-loop) |
| `handleUserMessage(sessionId, content)` | USER_INITIATED раунд, не расходует лимит раундов |
| `containsFinalizationSignal(content)` | Проверка ключевых слов финализации Директора |

### AgentRunnerService

| Метод | Описание |
|-------|----------|
| `runAgent(params)` | Tool call loop → Message → token aggregation. Retry 3x с exponential backoff |
| `buildToolDefinitions(agent, isDirector)` | Возвращает список ToolDefinition для агента |

**Алгоритм runAgent (streaming):**
1. Retry loop (3 попытки: 1s, 2s, 4s backoff)
2. `executeWithToolLoop()`:
   - Генерирует `messageId = randomUUID()` ДО начала стриминга
   - Вызывает `emitMessageStart(sessionId, { messageId, agentId, ... })`
   - Tool call loop (до MAX_TOOL_CALLS_PER_TURN=5 итераций):
     - `executeStreamWithTimeout()` → `llmGateway.chatStream()` → AbortController таймаут 120с
     - Каждый `text` чанк → `emitMessageChunk(sessionId, { messageId, chunk })`
     - `tool_call` чанки аккумулируются → `processToolCalls` → добавляются в messages
     - `done` чанк → сохраняет usage (tokens, cost)
   - Вызывает `emitMessageEnd(sessionId, { messageId, tokensInput, tokensOutput, costUsd, latencyMs })`
   - `prisma.message.create({ id: messageId, ... })` — тот же UUID
   - `$transaction([agent.update, session.update])` — инкремент токенов
3. При полном провале аналитика → пустой результат (не throws)
4. При полном провале Директора → сессия ставится в `PAUSED`, эмитятся `session:status` и `session:error`

**callResearcher остаётся НЕ-стриминговым** (`executeWithTimeout → llmGateway.chat()`), т.к. ответы ресерчера короткие.

**Tool call loop:**
- `web_search` → через OpenRouter web plugin (`plugins: [{ id: 'web' }]`) и `annotations` в ответе
- `call_researcher` → проверка лимита → PerplexityProvider → отдельное Message ресерчера → increment researchCallsUsed
- `annotations` от OpenRouter web plugin (`webSearchEnabled=true`) → эмит `agent:tool:result` + сохранение в `Message.toolCalls` с `query: "openrouter:web_plugin"`
- Токены суммируются по всем итерациям
- `call_researcher` ограничен до 1 вызова в рамках одного хода агента (на весь tool-loop, а не на одну итерацию)

**buildToolDefinitions:**
- `web_search` — НЕ добавляется как явный tool_call (включается через `webSearchEnabled` и OpenRouter plugin)
- `call_researcher` — добавляется только для Директора (`isDirector = true`)
- В OrchestratorService `call_researcher` отключён для фаз INITIAL/FINAL/RESUME/USER_INITIATED (роль Директора там — координация/синтез, не ресерч)

### RoundManagerService

| Метод | Описание |
|-------|----------|
| `createRound(sessionId, type, userMessage?)` | Создание раунда с автоинкрементом номера |
| `completeRound(roundId)` | Завершение раунда (COMPLETED + completedAt) |
| `buildAgentContext(agent, session, roundNumber)` | Полный контекст для агента по спецификации |
| `summarizePreviousRounds(messages, session)` | LLM-суммаризация старых раундов |
| `clearSummaryCache(sessionId)` | Очистка кэша суммаризации для сессии |

#### Формат контекста (04-AGENTS.md)

`buildAgentContext` всегда возвращает полный массив сообщений:

```
[0] system: обработанный системный промпт (processPrompt с {{SESSION_FILTERS}}, {{INPUT_PROMPT}}, etc.)
[1] system: контекст сессии (режим + вводные; в VALIDATE включает existingIdeas и запрет генерации нового пула)
[?] system: саммари предыдущих раундов (только если round >= 3)
[?] system: список активных идей PROPOSED/ACTIVE (если есть)
[...] chat:  история сообщений с маппингом ролей
```

**Стратегия сообщений:**
- **round 1-2**: полная история всех сообщений сессии
- **round 3+** (`AGENT_DEFAULTS.CONTEXT_SUMMARIZE_FROM_ROUND`): только сообщения текущего раунда

**Кэш суммаризации:**
- Хранится в `Map<sessionId, { roundNumber, summary }>`
- При повторном вызове с тем же `currentRoundNumber` LLM не вызывается повторно
- Сбрасывается через `clearSummaryCache(sessionId)` при завершении/сбросе сессии

## Модульные зависимости

```
SessionsModule (imports OrchestratorModule)
    └── SessionsService → OrchestratorService.startSession/pauseSession/resumeSession/handleUserMessage

OrchestratorModule (imports LlmModule, PromptsModule, SessionGatewayModule)
    ├── OrchestratorService → AgentRunnerService, RoundManagerService, PrismaService
    ├── AgentRunnerService → LlmGatewayService, PrismaService, ISessionEventEmitter
    ├── RoundManagerService → LlmGatewayService, PrismaService, PromptsService
    └── SESSION_EVENT_EMITTER → { useExisting: SessionGateway } (из SessionGatewayModule)
```

**Важно:** OrchestratorModule НЕ импортирует SessionsModule (избежание circular dependency). Работает с Prisma напрямую для чтения/обновления Session.

**Зависимость на WebSocket:** `OrchestratorModule → SessionGatewayModule → AuthModule`. Односторонняя зависимость, циклов нет. SessionGateway только эмитит события, не вызывает оркестратор.

## Константы

```typescript
// Сигналы финализации (Директор использует для завершения discussion loop)
FINALIZATION_SIGNALS: ['ФИНАЛИЗИРУЮ', 'ФИНАЛЬНЫЙ ОТЧЁТ', 'ПЕРЕХОДИМ К СКОРИНГУ', ...]

// Tool definitions
CALL_RESEARCHER_TOOL_DEFINITION  — JSON Schema для call_researcher (параметр: query)
TOOL_NAMES = { WEB_SEARCH: 'web_search', CALL_RESEARCHER: 'call_researcher' }
DISCUSSION_DIRECTOR_TASK_INSTRUCTION — инструкция Директору на постановку задачи в DISCUSSION
DISCUSSION_DIRECTOR_DECISION_INSTRUCTION — короткая инструкция Директору в фазе арбитража (формат решения + ограничение на шум)

// Сообщения
AGENT_TIMEOUT_ERROR = 'Превышен таймаут ожидания ответа от LLM'
RESEARCH_LIMIT_REACHED_MESSAGE — текст при исчерпании лимита ресерчера

// Максимальная длина резюме идеи в списке активных идей
IDEA_SUMMARY_MAX_LENGTH = 200

// Используемые из @oracle/shared:
AGENT_DEFAULTS.RETRY_ATTEMPTS = 3
AGENT_DEFAULTS.RETRY_BASE_DELAY_MS = 1000
AGENT_DEFAULTS.TIMEOUT_MS = 120_000
AGENT_DEFAULTS.MAX_TOOL_CALLS_PER_TURN = 5
AGENT_DEFAULTS.CONTEXT_SUMMARIZE_FROM_ROUND = 3
AGENT_DEFAULTS.SUMMARY_MAX_WORDS = 500
SESSION_LIMITS.MIN_ANALYSTS = 2
```

## Событийная модель (ISessionEventEmitter)

Интерфейс для уведомлений в реальном времени. Реализован через `SessionGateway` (WebSocket).

| Метод | Когда | WebSocket событие |
|-------|-------|-------------------|
| `emitMessageStart` | Перед началом стриминга агента | `agent:message:start` |
| `emitMessageChunk` | Каждый текстовый чанк стрима | `agent:message:chunk` |
| `emitMessageEnd` | Завершение стриминга с метриками | `agent:message:end` |
| `emitAgentMessage` | **Deprecated** (no-op, заменён тройкой start/chunk/end) | — |
| `emitRoundStarted` | Начало каждого раунда | `round:start` |
| `emitRoundCompleted` | Завершение раунда | `round:end` |
| `emitSessionStatusChanged` | Смена статуса сессии | `session:status` |
| `emitSessionCompleted` | Сессия завершена | `session:status` (COMPLETED) |
| `emitSessionError` | Ошибка (критическая или в handleUserMessage) | `session:error` |
| `emitToolStart` | Агент начинает выполнять тулзу | `agent:tool:start` |
| `emitToolResult` | Агент получил результат тулзы (превью 200 символов) | `agent:tool:result` |

Реализация: `SessionGateway` (see `apps/docs/websocket-gateway.md`).
Dev-fallback: `LoggerSessionEventEmitter` (логирует через NestJS Logger).

## Как расширять

### Добавить новую тулзу
1. Добавить константу в `orchestrator.constants.ts`: `TOOL_NAMES.MY_TOOL`, `MY_TOOL_DEFINITION`
2. В `AgentRunnerService.executeTool()` добавить case в switch
3. В `buildToolDefinitions()` добавить условие для включения тулзы

## Файлы

| Файл | Строк | Описание |
|------|-------|----------|
| `orchestrator.service.ts` | ~380 | Главный оркестратор + pause/resume/userMessage |
| `agent-runner.service.ts` | ~470 | Tool call loop + retry + timeout + callResearcher |
| `round-manager.service.ts` | ~200 | Управление раундами + контекст + кэш суммаризации |
| `orchestrator.module.ts` | ~35 | NestJS модуль |
| `interfaces/orchestrator.types.ts` | ~75 | Типы данных + tool event types |
| `interfaces/session-event-emitter.interface.ts` | ~70 | Интерфейс событий + Logger стаб |
| `constants/orchestrator.constants.ts` | ~100 | Константы, промпты, tool definitions |
