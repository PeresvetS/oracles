# Oracle — LLM Gateway (`@integrations/llm`)

## Обзор

Слой абстракции между агентами и LLM-провайдерами. Единый интерфейс `LlmProvider` для вызова любой модели через любого провайдера. Все провайдеры — в `@integrations/llm/providers/`.

## Архитектура

```
AgentRunnerService (@core/orchestrator)
       │
       ▼
  LlmGatewayService (@integrations/llm)
       │ resolveProvider(agent.provider)
       │
       ├── OpenRouterProvider     (anthropic/*, openai/*, google/*)
       ├── PerplexityProvider     (sonar-*, sonar-reasoning-*)
       ├── AnthropicDirectProvider   (будущее — заглушка)
       ├── OpenAIDirectProvider      (будущее — заглушка)
       ├── GoogleDirectProvider      (будущее — заглушка)
       └── ClaudeCodeSdkProvider     (будущее — заглушка)
```

**Правила:**
- OrchestratorService НЕ вызывает провайдеры напрямую — только через LlmGatewayService
- API-ключи читаются из `SettingsService` (БД) с fallback на `process.env`
- Lazy-инициализация клиентов (ключ может быть обновлён в runtime)

## Расположение файлов

```
apps/api/src/integrations/llm/
├── llm.module.ts
├── llm-gateway.service.ts
├── providers/
│   ├── openrouter.provider.ts
│   ├── perplexity.provider.ts
│   ├── anthropic-direct.provider.ts     // throw NotImplementedError
│   ├── openai-direct.provider.ts        // throw NotImplementedError
│   ├── google-direct.provider.ts        // throw NotImplementedError
│   └── claude-code-sdk.provider.ts      // throw NotImplementedError
└── tools/
    └── web-search.tool.ts
```

## Интерфейсы

Все типы — в `packages/shared/src/types/`:

```typescript
// packages/shared/src/types/llm.types.ts

export interface LlmChatParams {
  provider: string;            // "openrouter" | "perplexity" | …
  modelId: string;             // "anthropic/claude-sonnet-4-5" | "sonar-pro" | …
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;        // default: LLM_DEFAULTS.TEMPERATURE
  maxTokens?: number;          // default: LLM_DEFAULTS.MAX_TOKENS
  stream?: boolean;            // default: true
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface LlmChatResponse {
  content: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  latencyMs: number;
  toolCalls?: ToolCall[];
  model: string;               // Фактически использованная модель
}

export interface LlmStreamChunk {
  type: 'text' | 'tool_call' | 'usage' | 'done';
  text?: string;
  toolCall?: ToolCall;
  usage?: {
    tokensInput: number;
    tokensOutput: number;
    costUsd: number;
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;  // JSON Schema
  };
}

export interface ToolCallResult {
  tool: string;
  query: string;
  result: string;
}
```

## LlmGatewayService

```typescript
// @integrations/llm/llm-gateway.service.ts
import { LLM_DEFAULTS } from '@shared/constants/llm.constants';

@Injectable()
export class LlmGatewayService {
  constructor(
    private readonly openRouter: OpenRouterProvider,
    private readonly perplexity: PerplexityProvider,
    private readonly settings: SettingsService,
  ) {}

  /** Вызов модели (без стриминга) */
  async chat(params: LlmChatParams): Promise<LlmChatResponse> {
    const provider = this.resolveProvider(params.provider);
    return provider.chat(params);
  }

  /** Стриминг: AsyncGenerator чанков */
  async *chatStream(params: LlmChatParams): AsyncGenerator<LlmStreamChunk> {
    const provider = this.resolveProvider(params.provider);
    yield* provider.chatStream(params);
  }

  private resolveProvider(providerName: string): LlmProvider {
    switch (providerName) {
      case 'openrouter':
        return this.openRouter;
      case 'perplexity':
        return this.perplexity;
      // Будущие провайдеры:
      // case 'anthropic': return this.anthropicDirect;
      // case 'openai': return this.openaiDirect;
      // case 'google': return this.googleDirect;
      // case 'claude-code-sdk': return this.claudeCodeSdk;
      default:
        throw new Error(`Unknown LLM provider: ${providerName}`);
    }
  }
}
```

## OpenRouterProvider

```typescript
// @integrations/llm/providers/openrouter.provider.ts
import OpenAI from 'openai';
import { LLM_DEFAULTS } from '@shared/constants/llm.constants';
import { MODEL_REGISTRY } from '@config/models.registry';

@Injectable()
export class OpenRouterProvider implements LlmProvider {
  constructor(private readonly settings: SettingsService) {}

  /** Lazy client — API-ключ может обновиться в runtime */
  private getClient(): OpenAI {
    const apiKey = this.settings.get('openrouter_api_key')
      ?? process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured');
    }
    return new OpenAI({
      baseURL: LLM_DEFAULTS.OPENROUTER_BASE_URL,
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://oracle.besales.app',
        'X-Title': 'Oracle AI Board',
      },
    });
  }

  async chat(params: LlmChatParams): Promise<LlmChatResponse> {
    const client = this.getClient();
    const start = Date.now();

    const response = await client.chat.completions.create({
      model: params.modelId,
      messages: params.messages,
      tools: params.tools,
      temperature: params.temperature ?? LLM_DEFAULTS.TEMPERATURE,
      max_tokens: params.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS,
    });

    const choice = response.choices[0];
    const usage = response.usage;

    return {
      content: choice.message.content ?? '',
      tokensInput: usage?.prompt_tokens ?? 0,
      tokensOutput: usage?.completion_tokens ?? 0,
      costUsd: this.calculateCost(params.modelId, usage),
      latencyMs: Date.now() - start,
      toolCalls: choice.message.tool_calls,
      model: response.model,
    };
  }

  async *chatStream(params: LlmChatParams): AsyncGenerator<LlmStreamChunk> {
    const client = this.getClient();

    const stream = await client.chat.completions.create({
      model: params.modelId,
      messages: params.messages,
      tools: params.tools,
      temperature: params.temperature ?? LLM_DEFAULTS.TEMPERATURE,
      max_tokens: params.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;

      if (delta?.content) {
        yield { type: 'text', text: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          yield { type: 'tool_call', toolCall: tc };
        }
      }

      if (chunk.usage) {
        yield {
          type: 'done',
          usage: {
            tokensInput: chunk.usage.prompt_tokens,
            tokensOutput: chunk.usage.completion_tokens,
            costUsd: this.calculateCost(params.modelId, chunk.usage),
          },
        };
      }
    }
  }

  private calculateCost(
    modelId: string,
    usage: { prompt_tokens: number; completion_tokens: number } | undefined,
  ): number {
    const model = MODEL_REGISTRY.find((m) => m.id === modelId);
    if (!model || !usage) return 0;
    return (
      (usage.prompt_tokens / 1000) * model.costPer1kInput +
      (usage.completion_tokens / 1000) * model.costPer1kOutput
    );
  }
}
```

## PerplexityProvider

```typescript
// @integrations/llm/providers/perplexity.provider.ts
import OpenAI from 'openai';
import { LLM_DEFAULTS } from '@shared/constants/llm.constants';

@Injectable()
export class PerplexityProvider implements LlmProvider {
  constructor(private readonly settings: SettingsService) {}

  private getClient(): OpenAI {
    const apiKey = this.settings.get('perplexity_api_key')
      ?? process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      throw new Error('Perplexity API key not configured');
    }
    return new OpenAI({
      baseURL: LLM_DEFAULTS.PERPLEXITY_BASE_URL,
      apiKey,
    });
  }

  async chat(params: LlmChatParams): Promise<LlmChatResponse> {
    const client = this.getClient();
    const start = Date.now();

    // Perplexity: поиск встроен, tools не поддерживаются
    const response = await client.chat.completions.create({
      model: params.modelId,
      messages: params.messages,
      temperature: params.temperature ?? LLM_DEFAULTS.TEMPERATURE,
      max_tokens: params.maxTokens ?? LLM_DEFAULTS.MAX_TOKENS,
    });

    const choice = response.choices[0];
    // Citations из ответа Perplexity (нестандартное поле)
    const citations = (response as unknown as { citations?: string[] }).citations ?? [];

    return {
      content: choice.message.content ?? '',
      tokensInput: response.usage?.prompt_tokens ?? 0,
      tokensOutput: response.usage?.completion_tokens ?? 0,
      costUsd: this.calculateCost(params.modelId, response.usage),
      latencyMs: Date.now() - start,
      model: response.model,
    };
  }

  // chatStream — аналогично OpenRouter, но без tools
}
```

## Обработка Tool Calls в AgentRunnerService

```typescript
// @core/orchestrator/agent-runner.service.ts (фрагмент)
import { AGENT_DEFAULTS } from '@shared/constants/agent.constants';

async runAgent(params: RunAgentParams): Promise<AgentResponse> {
  let messages = [...params.messages];
  let fullContent = '';
  const totalToolCalls: ToolCallResult[] = [];

  // Цикл tool calls (макс AGENT_DEFAULTS.MAX_TOOL_CALLS_PER_TURN)
  while (totalToolCalls.length < AGENT_DEFAULTS.MAX_TOOL_CALLS_PER_TURN) {
    const response = await this.llmGateway.chat({
      provider: params.agent.provider,
      modelId: params.agent.modelId,
      messages,
      tools: params.tools,
    });

    // Нет tool calls → финальный ответ
    if (!response.toolCalls?.length) {
      fullContent = response.content;
      break;
    }

    // Обработка каждого tool call
    for (const toolCall of response.toolCalls) {
      const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      let toolResult: string;

      // WebSocket: tool начался
      this.sessionGateway.emitToolStart(params.sessionId, params.agent.id, toolCall.function.name, args);

      switch (toolCall.function.name) {
        case 'web_search':
          toolResult = await this.webSearchTool.search(args.query as string);
          break;
        case 'call_researcher':
          toolResult = await this.callResearcher(params.sessionId, args.query as string);
          break;
        default:
          toolResult = `Unknown tool: ${toolCall.function.name}`;
      }

      // WebSocket: tool завершился
      this.sessionGateway.emitToolResult(params.sessionId, toolCall.function.name, toolResult);

      totalToolCalls.push({
        tool: toolCall.function.name,
        query: (args.query as string) ?? JSON.stringify(args),
        result: toolResult,
      });

      // Добавляем в историю для следующей итерации
      messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.toolCalls,
      });
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }
  }

  return { content: fullContent, /* … суммарные метрики … */ toolCalls: totalToolCalls };
}
```

## Будущие провайдеры (заглушки)

Все будущие провайдеры реализуют интерфейс `LlmProvider` и выбрасывают `NotImplementedError`:

```typescript
// @integrations/llm/providers/anthropic-direct.provider.ts
@Injectable()
export class AnthropicDirectProvider implements LlmProvider {
  async chat(): Promise<LlmChatResponse> {
    throw new Error('Anthropic Direct provider not implemented. Use OpenRouter.');
  }
  async *chatStream(): AsyncGenerator<LlmStreamChunk> {
    throw new Error('Anthropic Direct provider not implemented. Use OpenRouter.');
  }
}
```

Аналогично: `OpenAIDirectProvider`, `GoogleDirectProvider`, `ClaudeCodeSdkProvider`.

Подключаются в `LlmModule` как провайдеры. Активируются через добавление `case` в `resolveProvider()`.

## npm-зависимость

```json
{
  "openai": "^4.x"
}
```

Единый SDK для OpenRouter и Perplexity (оба OpenAI-совместимые). Устанавливается через `yarn add openai`.

Будущие зависимости (не устанавливать на MVP):
- `@anthropic-ai/sdk` — для AnthropicDirectProvider
- `@google/generative-ai` — для GoogleDirectProvider

## Web Search Tool — реализация

MVP: собственный function tool через Serper API. Даёт контроль над форматом и работает одинаково для всех моделей.

```typescript
// @integrations/llm/tools/web-search.tool.ts
@Injectable()
export class WebSearchTool {
  constructor(private readonly settings: SettingsService) {}

  async search(query: string): Promise<string> {
    const apiKey = this.settings.get('serper_api_key')
      ?? process.env.SERPER_API_KEY;
    if (!apiKey) {
      return 'Web search unavailable: Serper API key not configured';
    }

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: 5 }),
    });

    const data = (await response.json()) as { organic: SearchResult[] };
    return this.formatResults(data.organic);
  }

  private formatResults(results: SearchResult[]): string {
    return results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`)
      .join('\n\n');
  }
}
```
