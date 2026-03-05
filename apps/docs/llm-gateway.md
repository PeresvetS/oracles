# LLM Gateway (LlmModule)

## Что это / зачем

LLM Gateway — слой абстракции между бизнес-логикой Oracle (OrchestratorService, AgentRunnerService, RoundManagerService) и внешними LLM-провайдерами.

**Принцип:** весь остальной код обращается к LLM исключительно через `LlmGatewayService`. Провайдер-специфичная логика инкапсулирована внутри соответствующего Provider-класса.

## Структура файлов

```
src/integrations/llm/
├── llm.module.ts                               # NestJS модуль
├── llm-gateway.service.ts                      # Маршрутизатор: Map<string, LlmProvider>
├── providers/
│   ├── llm-provider.interface.ts               # Интерфейс LlmProvider (chat + chatStream)
│   ├── openrouter.provider.ts                  # OpenRouter: Claude, GPT, Gemini
│   ├── perplexity.provider.ts                  # Perplexity: Sonar, Sonar Reasoning
│   ├── anthropic-direct.provider.ts            # Заглушка
│   ├── openai-direct.provider.ts               # Заглушка
│   ├── google-direct.provider.ts               # Заглушка
│   └── claude-code-sdk.provider.ts             # Заглушка
└── tools/
    └── web-search.tool.ts                      # Legacy Serper tool (файл сохранён, в runtime не используется)

Тесты:
├── llm-gateway.service.spec.ts
├── providers/openrouter.provider.spec.ts
└── providers/perplexity.provider.spec.ts
```

## Архитектура

```
OrchestratorService / AgentRunnerService / RoundManagerService
    │
    ▼
LlmGatewayService (маршрутизатор)
    │
    ├── "openrouter"  → OpenRouterProvider  → Claude, GPT, Gemini (via OpenRouter)
    │                   + Web Plugin (встроенный поиск при webSearchEnabled=true)
    ├── "perplexity"  → PerplexityProvider  → Sonar, Sonar Reasoning Pro
    │                   + встроенный веб-поиск (citations)
    ├── "anthropic-direct"   → заглушка
    ├── "openai-direct"      → заглушка
    ├── "google-direct"      → заглушка
    └── "claude-code-sdk"    → заглушка

WebSearchTool (legacy) не подключён к DI и не участвует в execution path.
```

## API Endpoints

LlmModule не предоставляет REST endpoints напрямую. Модели доступны через `ModelsModule`:

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/models` | Список всех моделей с флагом `available` |

## Ключевые сервисы и методы

### LlmGatewayService

Единая точка входа для всех LLM-вызовов.

| Метод | Возвращает | Описание |
|-------|-----------|----------|
| `chat(params)` | `Promise<LlmChatResponse>` | Синхронный вызов, ждёт полного ответа |
| `chatStream(params)` | `AsyncGenerator<LlmStreamChunk>` | Стриминг по чанкам |
| `getRegisteredProviders()` | `string[]` | Имена всех зарегистрированных провайдеров |

Маршрутизация по полю `params.provider` — ищет в `Map<string, LlmProvider>`.

### LlmProvider Interface

Контракт, который должен реализовать каждый провайдер:

```typescript
export interface LlmProvider {
  readonly providerName: string;
  chat(params: LlmChatParams): Promise<LlmChatResponse>;
  chatStream(params: LlmChatParams): AsyncGenerator<LlmStreamChunk>;
}
```

### OpenRouterProvider

Доступ к Claude (Anthropic), GPT (OpenAI), Gemini (Google) через единый OpenRouter API.

| Возможность | Описание |
|-------------|----------|
| Tool calls | Поддерживаются: `call_researcher` (только Директор) |
| **Web Plugin** | `plugins: [{ id: 'web' }]` — нативный веб-поиск при `webSearchEnabled=true` (см. ниже) |
| Стриминг | `stream: true` + `stream_options: { include_usage: true }` |
| Lazy client | Клиент создаётся при первом вызове, пересоздаётся при смене ключа |
| Расчёт стоимости | По MODEL_REGISTRY: `(input/1000)*costPer1kInput + (output/1000)*costPer1kOutput` |
| **Extended Thinking** | `reasoning: { enabled: true, effort? }` — reasoning включается для всех моделей, effort задаётся для thinking-моделей |

**HTTP заголовки OpenRouter:**
- `HTTP-Referer: https://oracle.besales.app`
- `X-Title: Oracle AI Board`

#### Web Search Plugin (OpenRouter Native)

Веб-поиск реализован через встроенный плагин OpenRouter — **не требует Serper API-ключа**.

**Как включить:** передать `webSearchEnabled: true` в `LlmChatParams`.

**Как работает:**

1. `OpenRouterProvider` добавляет `plugins: [{ id: 'web' }]` в тело запроса к OpenRouter API.
2. OpenRouter автоматически выполняет веб-поиск (нативный от провайдера модели для Claude/GPT/Perplexity/xAI, иначе через Exa ~$0.02/запрос).
3. В ответе: `message.annotations[]` содержит `url_citation` объекты с URL, заголовком и контентом.
4. В стриминге: annotations накапливаются из `delta.annotations` и отдаются единым чанком `{ type: 'annotations', annotations: UrlCitation[] }` перед `done`.
5. `AgentRunnerService` при получении `'annotations'` чанка:
   - Эмитит WS-событие `agent:tool:result` (прозрачность для UI — пользователь видит цитаты)
   - Сохраняет цитаты в `Message.toolCalls` в БД с `query: 'openrouter:web_plugin'`

**WebSocket событие `agent:tool:result` (из annotations):**
```json
{
  "sessionId": "...",
  "messageId": "...",
  "agentId": "...",
  "toolName": "web_search",
  "result": "1. Заголовок страницы\n   https://example.com\n   Краткое описание..."
}
```

**Ограничения:**
- Нет `agent:tool:start` события (поиск происходит внутри OpenRouter, мы не знаем о нём заранее)
- Только для OpenRouter провайдера (Perplexity имеет встроенный поиск без плагина)
- `agent.webSearchEnabled` — флаг на агенте в БД (по умолчанию `false`)

#### Extended Thinking (Reasoning)

Для моделей с extended thinking OpenRouter поддерживает поле `reasoning`. В проекте reasoning включён для всех запросов OpenRouter (`enabled: true`), а для thinking-моделей дополнительно передаётся `effort`.

**Как работает:**

1. `OpenRouterProvider.resolveReasoningEffort(params)` определяет уровень effort:
   - Сначала из `params.reasoningEffort` (явное переопределение)
   - Затем из `MODEL_REGISTRY[modelId].reasoningEffort` (дефолт по модели)
   - `undefined` — отправляется `reasoning: { enabled: true }` без effort

2. В запрос всегда добавляется `reasoning: { enabled: true }`.
   Если effort определён — добавляется `reasoning: { enabled: true, effort }` (через type casting, т.к. OpenAI SDK не типизирует это поле).

3. В стриминге ответа: `delta.reasoning_details[]` → чанки типа `'reasoning'` в `AsyncGenerator<LlmStreamChunk>`.

4. `AgentRunnerService` при получении `chunk.type === 'reasoning'` вызывает `eventEmitter.emitThinkingChunk(sessionId, { messageId, thinking })` → WebSocket событие `agent:thinking:chunk`.

5. **Multi-turn continuity**: `reasoning_details` из предыдущего ответа сохраняются в `ChatMessage.reasoning_details` и передаются обратно в следующем запросе (OpenRouter требует это для корректной работы в tool call loop).

**Модели с reasoning:**

| Модель | reasoningEffort | capabilities |
|--------|----------------|-------------|
| `openai/gpt-5.2` | `'xhigh'` | `['chat', 'reasoning', 'thinking', 'web_search']` |
| `openai/gpt-5.3-codex` | `'xhigh'` | `['chat', 'code', 'reasoning', 'thinking', 'web_search']` |

**WebSocket событие `agent:thinking:chunk`:**
```json
{
  "sessionId": "...",
  "messageId": "...",
  "thinking": "Анализирую рынок..."
}
```

### PerplexityProvider

Для роли Ресерчера — глубокий поиск с citations.

| Особенность | Описание |
|-------------|----------|
| Tools | **Не поддерживаются** — web-search встроен в Perplexity |
| Citations | Добавляются к content как блок «**Источники:**» с нумерованным списком URL |
| Tool messages | Фильтруются перед отправкой (Perplexity не поддерживает роль `tool`) |
| Рекомендованные модели | `sonar-pro`, `sonar-reasoning-pro` |

### Legacy WebSearchTool

Файлы `tools/web-search.tool.ts` и `tools/web-search.tool.spec.ts` сохранены в репозитории, но:
- не зарегистрированы в `LlmModule`;
- не инжектируются в `AgentRunnerService`;
- не используются в production execution path.

## Типы (из `@oracle/shared`)

| Тип | Описание |
|-----|----------|
| `LlmChatParams` | Параметры: `provider`, `modelId`, `messages`, `tools?`, `temperature?`, `maxTokens?`, `reasoningEffort?`, `webSearchEnabled?` |
| `LlmChatResponse` | Ответ: `content`, `tokensInput`, `tokensOutput`, `costUsd`, `latencyMs`, `toolCalls?`, `model`, `reasoning_details?`, `annotations?` |
| `LlmStreamChunk` | Чанк: `type` (text / reasoning / tool_call / annotations / done), `text?`, `reasoning?`, `toolCall?`, `annotations?`, `usage?` |
| `UrlCitation` | `{ url, title, content?, startIndex?, endIndex? }` — цитата из OpenRouter web plugin |
| `ChatMessage` | `{ role: system/user/assistant/tool, content, tool_call_id?, tool_calls?, reasoning_details? }` |
| `ToolDefinition` | `{ type: "function", function: { name, description, parameters } }` |
| `ToolCall` | `{ id, type: "function", function: { name, arguments } }` |
| `ReasoningEffort` | `'none' \| 'minimal' \| 'low' \| 'medium' \| 'high' \| 'xhigh'` |
| `ReasoningDetail` | `{ type: 'thinking' \| 'summary', text: string }` — блок reasoning из ответа |

## Конфигурация

### API-ключи (SettingsService, БД + env fallback)

| Ключ настройки | Env переменная | Провайдер |
|---------------|----------------|-----------|
| `openrouter_api_key` | `OPENROUTER_API_KEY` | OpenRouter (+ web plugin) |
| `perplexity_api_key` | `PERPLEXITY_API_KEY` | Perplexity |

Ключи читаются через `SettingsService.get(key)` — сначала из БД-кэша, затем из `process.env`. Задаются через `/api/settings` в UI или Railway Variables.

### Константы LLM (`LLM_DEFAULTS` из `@oracle/shared`)

| Константа | Значение | Описание |
|-----------|----------|----------|
| `TEMPERATURE` | 0.7 | Температура по умолчанию |
| `MAX_TOKENS` | 4096 | Максимум токенов |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Базовый URL OpenRouter |
| `PERPLEXITY_BASE_URL` | `https://api.perplexity.ai` | Базовый URL Perplexity |

## Пример использования

```typescript
// Синхронный вызов (без стриминга)
const response = await this.llmGateway.chat({
  provider: 'openrouter',
  modelId: 'anthropic/claude-sonnet-4-6',
  messages: [
    { role: 'system', content: 'Ты аналитик бизнес-идей.' },
    { role: 'user', content: 'Предложи 3 идеи SaaS-продукта для HR.' },
  ],
  tools: [webSearchToolDefinition, callResearcherToolDefinition],
  webSearchEnabled: true,  // включить OpenRouter web plugin (annotations)
  temperature: 0.7,
  maxTokens: 4096,
});
// response.content — строка с ответом
// response.toolCalls — вызовы тулз (call_researcher и т.д.)
// response.annotations — цитаты из веб-поиска (UrlCitation[])
// response.costUsd — стоимость вызова

// Стриминг (для WebSocket)
for await (const chunk of this.llmGateway.chatStream(params)) {
  if (chunk.type === 'text') {
    gateway.emit(sessionId, 'agent:stream', { text: chunk.text });
  }
  if (chunk.type === 'reasoning') {
    // Extended thinking: chunk.reasoning — текст блока размышлений
    gateway.emit(sessionId, 'agent:thinking:chunk', { thinking: chunk.reasoning });
  }
  if (chunk.type === 'annotations') {
    // Цитаты из OpenRouter web plugin: chunk.annotations — UrlCitation[]
    gateway.emit(sessionId, 'agent:tool:result', { toolName: 'web_search', result: ... });
  }
  if (chunk.type === 'tool_call') {
    // Обработать явный вызов тулзы (web_search / call_researcher)
  }
  if (chunk.type === 'done') {
    // chunk.usage.tokensInput, tokensOutput, costUsd
  }
}

// Extended thinking — активация для конкретного вызова
const thinkingParams = {
  provider: 'openrouter',
  modelId: 'openai/gpt-5.2',
  messages: [...],
  reasoningEffort: 'high', // переопределить дефолт 'xhigh' из MODEL_REGISTRY
};
```

## Как расширять

### Добавить нового провайдера (пошагово)

**Шаг 1.** Создать файл `src/integrations/llm/providers/my-provider.provider.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';  // если провайдер OpenAI-совместим
import { LLM_DEFAULTS } from '@oracle/shared';
import type { LlmChatParams, LlmChatResponse, LlmStreamChunk } from '@oracle/shared';
import { SettingsService } from '@settings/settings.service';
import type { LlmProvider } from '@integrations/llm/providers/llm-provider.interface';

const PROVIDER_NAME = 'my-provider';

@Injectable()
export class MyProvider implements LlmProvider {
  private readonly logger = new Logger(MyProvider.name);
  readonly providerName = PROVIDER_NAME;

  private client: OpenAI | null = null;
  private lastApiKey: string | null = null;

  constructor(private readonly settingsService: SettingsService) {}

  async chat(params: LlmChatParams): Promise<LlmChatResponse> {
    const client = this.getClient();
    // ... реализация
  }

  async *chatStream(params: LlmChatParams): AsyncGenerator<LlmStreamChunk> {
    // ... реализация
  }

  private getClient(): OpenAI {
    const apiKey = this.settingsService.get('my_provider_api_key');
    if (!apiKey) throw new Error('API-ключ MyProvider не настроен');
    // lazy init + re-create on key change
    if (this.client && this.lastApiKey === apiKey) return this.client;
    this.client = new OpenAI({ baseURL: 'https://api.myprovider.ai/v1', apiKey });
    this.lastApiKey = apiKey;
    return this.client;
  }
}
```

**Шаг 2.** Добавить модель в `src/config/models.registry.ts`:

```typescript
{
  id: 'my-model-id',
  name: 'My Model Name',
  provider: 'my-provider',
  family: 'my-family',
  costPer1kInput: 0.001,
  costPer1kOutput: 0.005,
  contextWindow: 128_000,
  capabilities: ['chat'],
},
```

**Шаг 3.** Добавить в `PROVIDER_API_KEY_MAP` в `models.registry.ts`:

```typescript
export const PROVIDER_API_KEY_MAP: Record<string, string> = {
  // ...
  'my-provider': 'my_provider_api_key',  // добавить
};
```

**Шаг 4.** Добавить API-ключ в известные настройки `src/settings/settings.service.ts`:

```typescript
const KNOWN_SETTING_KEYS = [
  // ...
  'my_provider_api_key',  // добавить
] as const;
```

**Шаг 5.** Зарегистрировать в `llm.module.ts`:

```typescript
@Module({
  providers: [
    LlmGatewayService,
    OpenRouterProvider,
    PerplexityProvider,
    MyProvider,          // добавить
    // заглушки...
  ],
  exports: [LlmGatewayService],
})
```

**Шаг 6.** Добавить в `LlmGatewayService` (инжектировать + зарегистрировать в Map):

```typescript
constructor(
  private readonly openRouterProvider: OpenRouterProvider,
  private readonly perplexityProvider: PerplexityProvider,
  private readonly myProvider: MyProvider,  // добавить
) {
  this.providerMap = new Map<string, LlmProvider>([
    [openRouterProvider.providerName, openRouterProvider],
    [perplexityProvider.providerName, perplexityProvider],
    [myProvider.providerName, myProvider],  // добавить
  ]);
}
```

**Шаг 7.** Написать тесты в `providers/my-provider.provider.spec.ts`.

**Шаг 8.** Обновить эту документацию.

### Заменить заглушку реальной реализацией

Открыть файл заглушки (например `anthropic-direct.provider.ts`) и заменить методы реальной логикой. Всё остальное (регистрация в module и gateway) уже готово.

### Добавить новую тулзу

1. Создать `tools/my-tool.tool.ts` с `@Injectable()` классом
2. Зарегистрировать там, где реально нужен runtime-инжект (избегая неиспользуемых providers в `LlmModule`)
3. Инжектировать через конструктор в сервис исполнения (например `AgentRunnerService`)
