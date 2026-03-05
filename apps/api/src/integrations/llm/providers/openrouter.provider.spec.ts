import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from '@settings/settings.service';
import { OpenRouterProvider } from '@integrations/llm/providers/openrouter.provider';
import { LLM_DEFAULTS } from '@oracle/shared';
import type { LlmChatParams, ChatMessage } from '@oracle/shared';

/**
 * Мок OpenAI SDK.
 * Перехватываем конструктор и метод chat.completions.create.
 * jest.mock hoisted — используем require для доступа к мокам.
 */
jest.mock('openai', () => {
  const create = jest.fn();
  const constructor = jest.fn().mockImplementation(() => ({
    chat: { completions: { create } },
  }));
  return {
    __esModule: true,
    default: constructor,
    __mockCreate: create,
    __mockConstructor: constructor,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __mockCreate: mockCreate, __mockConstructor: mockOpenAIConstructor } = require('openai');

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;
  let settingsService: jest.Mocked<SettingsService>;

  const mockApiKey = 'test-openrouter-api-key';

  const baseParams: LlmChatParams = {
    provider: 'openrouter',
    modelId: 'anthropic/claude-sonnet-4-6',
    messages: [
      { role: 'system', content: 'Ты аналитик' },
      { role: 'user', content: 'Сгенерируй идею' },
    ],
  };

  const mockOpenAIResponse = {
    choices: [
      {
        message: {
          content: 'Вот идея: SaaS для анализа данных',
          tool_calls: undefined,
        },
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
    },
    model: 'anthropic/claude-sonnet-4-6',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    settingsService = {
      get: jest.fn().mockReturnValue(mockApiKey),
      set: jest.fn(),
      getAll: jest.fn(),
      getAllMasked: jest.fn(),
      reloadCache: jest.fn(),
    } as unknown as jest.Mocked<SettingsService>;

    mockCreate.mockResolvedValue(mockOpenAIResponse);

    const module: TestingModule = await Test.createTestingModule({
      providers: [OpenRouterProvider, { provide: SettingsService, useValue: settingsService }],
    }).compile();

    provider = module.get<OpenRouterProvider>(OpenRouterProvider);
  });

  describe('providerName', () => {
    it('должен вернуть "openrouter"', () => {
      expect(provider.providerName).toBe('openrouter');
    });
  });

  describe('getClient (через chat)', () => {
    it('должен создать OpenAI клиент с правильными параметрами', async () => {
      await provider.chat(baseParams);

      expect(mockOpenAIConstructor).toHaveBeenCalledWith({
        baseURL: LLM_DEFAULTS.OPENROUTER_BASE_URL,
        apiKey: mockApiKey,
        defaultHeaders: {
          'HTTP-Referer': 'https://oracle.besales.app',
          'X-Title': 'Oracle AI Board',
        },
      });
    });

    it('должен переиспользовать клиент при одном и том же ключе', async () => {
      await provider.chat(baseParams);
      await provider.chat(baseParams);

      expect(mockOpenAIConstructor).toHaveBeenCalledTimes(1);
    });

    it('должен пересоздать клиент при смене API-ключа', async () => {
      await provider.chat(baseParams);

      settingsService.get.mockReturnValue('new-api-key');
      await provider.chat(baseParams);

      expect(mockOpenAIConstructor).toHaveBeenCalledTimes(2);
    });

    it('должен бросить ошибку если API-ключ не настроен', async () => {
      settingsService.get.mockReturnValue(null);

      await expect(provider.chat(baseParams)).rejects.toThrow('API-ключ OpenRouter не настроен');
    });
  });

  describe('chat', () => {
    it('должен маппить ответ в LlmChatResponse', async () => {
      const result = await provider.chat(baseParams);

      expect(result.content).toBe('Вот идея: SaaS для анализа данных');
      expect(result.tokensInput).toBe(100);
      expect(result.tokensOutput).toBe(50);
      expect(result.model).toBe('anthropic/claude-sonnet-4-6');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('должен включать tool_calls в ответ', async () => {
      mockCreate.mockResolvedValue({
        ...mockOpenAIResponse,
        choices: [
          {
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'web_search',
                    arguments: '{"query":"SaaS рынок"}',
                  },
                },
              ],
            },
          },
        ],
      });

      const result = await provider.chat(baseParams);

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: 'call_123',
        type: 'function',
        function: { name: 'web_search', arguments: '{"query":"SaaS рынок"}' },
      });
    });

    it('должен бросить ошибку при пустом choices', async () => {
      mockCreate.mockResolvedValue({ choices: [], usage: {} });

      await expect(provider.chat(baseParams)).rejects.toThrow('OpenRouter вернул пустой ответ');
    });

    it('должен передавать tools в запрос если они есть', async () => {
      const paramsWithTools: LlmChatParams = {
        ...baseParams,
        tools: [
          {
            type: 'function',
            function: {
              name: 'web_search',
              description: 'Поиск в интернете',
              parameters: { type: 'object', properties: { query: { type: 'string' } } },
            },
          },
        ],
      };

      await provider.chat(paramsWithTools);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              type: 'function',
              function: {
                name: 'web_search',
                description: 'Поиск в интернете',
                parameters: { type: 'object', properties: { query: { type: 'string' } } },
              },
            },
          ],
        }),
      );
    });

    it('не должен передавать tools если массив пуст', async () => {
      const paramsNoTools: LlmChatParams = {
        ...baseParams,
        tools: [],
      };

      await provider.chat(paramsNoTools);

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty('tools');
    });

    it('должен использовать дефолтные temperature и maxTokens', async () => {
      await provider.chat(baseParams);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: LLM_DEFAULTS.TEMPERATURE,
          max_tokens: LLM_DEFAULTS.MAX_TOKENS,
        }),
      );
    });

    it('должен использовать кастомные temperature и maxTokens', async () => {
      const customParams: LlmChatParams = {
        ...baseParams,
        temperature: 0.2,
        maxTokens: 8192,
      };

      await provider.chat(customParams);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.2,
          max_tokens: 8192,
        }),
      );
    });
  });

  describe('mapMessages (через chat)', () => {
    it('должен маппить сообщения с разными ролями', async () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'Системный промпт' },
        { role: 'user', content: 'Запрос' },
        { role: 'assistant', content: 'Ответ' },
        { role: 'tool', content: '{"result":"ok"}', tool_call_id: 'call_1' },
      ];

      await provider.chat({ ...baseParams, messages });

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      const mappedMessages = callArgs['messages'] as Array<Record<string, unknown>>;

      expect(mappedMessages[0]).toEqual({ role: 'system', content: 'Системный промпт' });
      expect(mappedMessages[1]).toEqual({ role: 'user', content: 'Запрос' });
      expect(mappedMessages[2]).toEqual({ role: 'assistant', content: 'Ответ' });
      expect(mappedMessages[3]).toEqual({
        role: 'tool',
        content: '{"result":"ok"}',
        tool_call_id: 'call_1',
      });
    });

    it('должен маппить assistant сообщение с tool_calls', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'web_search', arguments: '{"q":"test"}' },
            },
          ],
        },
      ];

      await provider.chat({ ...baseParams, messages });

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      const mappedMessages = callArgs['messages'] as Array<Record<string, unknown>>;

      expect(mappedMessages[0]).toEqual({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'web_search', arguments: '{"q":"test"}' },
          },
        ],
      });
    });
  });

  describe('calculateCost', () => {
    // Метод приватный — доступ через (provider as any) для тестирования внутренней логики
    it('должен рассчитать стоимость для Claude Sonnet 4.6', () => {
      // costPer1kInput=0.003, costPer1kOutput=0.015
      const cost = (provider as any).calculateCost('anthropic/claude-sonnet-4-6', 1000, 500);

      // (1000/1000)*0.003 + (500/1000)*0.015 = 0.003 + 0.0075 = 0.0105
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it('должен вернуть 0 для неизвестной модели', () => {
      const cost = (provider as any).calculateCost('unknown/model', 1000, 500);

      expect(cost).toBe(0);
    });

    it('должен рассчитать стоимость для Claude Opus 4.6', () => {
      // costPer1kInput=0.015, costPer1kOutput=0.075
      const cost = (provider as any).calculateCost('anthropic/claude-opus-4-6', 2000, 1000);

      // (2000/1000)*0.015 + (1000/1000)*0.075 = 0.03 + 0.075 = 0.105
      expect(cost).toBeCloseTo(0.105, 6);
    });
  });
  describe('resolveReasoningEffort', () => {
    // Метод приватный — доступ через (provider as any) для тестирования внутренней логики
    it('должен вернуть reasoningEffort из params если указан явно', () => {
      const params = {
        ...baseParams,
        modelId: 'anthropic/claude-sonnet-4-6',
        reasoningEffort: 'high' as const,
      };

      const result = (provider as any).resolveReasoningEffort(params);

      expect(result).toBe('high');
    });

    it('должен вернуть reasoningEffort из MODEL_REGISTRY для gpt-5.2', () => {
      const params = { ...baseParams, modelId: 'openai/gpt-5.2' };

      const result = (provider as any).resolveReasoningEffort(params);

      expect(result).toBe('xhigh');
    });

    it('должен вернуть reasoningEffort из MODEL_REGISTRY для gpt-5.3-codex', () => {
      const params = { ...baseParams, modelId: 'openai/gpt-5.3-codex' };

      const result = (provider as any).resolveReasoningEffort(params);

      expect(result).toBe('xhigh');
    });

    it('должен вернуть undefined для модели без reasoning', () => {
      const params = { ...baseParams, modelId: 'anthropic/claude-sonnet-4-6' };

      const result = (provider as any).resolveReasoningEffort(params);

      expect(result).toBeUndefined();
    });

    it('должен добавлять reasoning: { enabled, effort } в запрос chat() для thinking-модели', async () => {
      const thinkingParams = { ...baseParams, modelId: 'openai/gpt-5.2' };

      await provider.chat(thinkingParams);

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs).toHaveProperty('reasoning', { enabled: true, effort: 'xhigh' });
    });

    it('должен добавлять reasoning: { enabled: true } для обычной модели', async () => {
      await provider.chat(baseParams);

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs).toHaveProperty('reasoning', { enabled: true });
    });
  });

  describe('web plugin (webSearchEnabled)', () => {
    it('должен добавлять plugins:[{id:"web"}] когда webSearchEnabled=true', async () => {
      const params = { ...baseParams, webSearchEnabled: true };
      await provider.chat(params);

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs).toHaveProperty('plugins', [{ id: 'web' }]);
    });

    it('не должен добавлять plugins когда webSearchEnabled не задан', async () => {
      await provider.chat(baseParams);

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty('plugins');
    });

    it('должен добавлять plugins в chatStream когда webSearchEnabled=true', async () => {
      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield { choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
        },
      });

      // drain stream
      const streamResults: unknown[] = [];
      for await (const chunk of provider.chatStream({ ...baseParams, webSearchEnabled: true })) {
        streamResults.push(chunk);
      }

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs).toHaveProperty('plugins', [{ id: 'web' }]);
    });

    it('должен возвращать annotations в LlmChatResponse при наличии message.annotations', async () => {
      mockCreate.mockResolvedValue({
        ...mockOpenAIResponse,
        choices: [
          {
            message: {
              content: 'Ответ с поиском',
              tool_calls: undefined,
              annotations: [
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://example.com',
                    title: 'Пример сайта',
                    content: 'Содержимое страницы',
                  },
                },
              ],
            },
          },
        ],
      });

      const result = await provider.chat({ ...baseParams, webSearchEnabled: true });

      expect(result.annotations).toHaveLength(1);
      expect(result.annotations![0]).toEqual({
        url: 'https://example.com',
        title: 'Пример сайта',
        content: 'Содержимое страницы',
      });
    });

    it('должен yield annotations чанк при delta.annotations в stream', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'Ответ с веб-поиском' } }], usage: null },
        {
          choices: [
            {
              delta: {
                content: null,
                annotations: [
                  {
                    type: 'url_citation',
                    url_citation: { url: 'https://test.com', title: 'Тест' },
                  },
                ],
              },
            },
          ],
          usage: null,
        },
        { choices: [{ delta: {} }], usage: { prompt_tokens: 100, completion_tokens: 50 } },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) yield chunk;
        },
      });

      const results: Array<{ type: string; annotations?: unknown[] }> = [];
      for await (const chunk of provider.chatStream({ ...baseParams, webSearchEnabled: true })) {
        results.push(chunk);
      }

      const annotationChunks = results.filter((c) => c.type === 'annotations');
      expect(annotationChunks).toHaveLength(1);
      expect(annotationChunks[0].annotations).toHaveLength(1);
      expect(annotationChunks[0].annotations![0]).toEqual(
        expect.objectContaining({ url: 'https://test.com', title: 'Тест' }),
      );
    });

    it('должен собирать annotations из fallback-полей stream-чанка', async () => {
      const chunks = [
        {
          choices: [
            {
              delta: {},
              message: {
                annotations: [
                  {
                    type: 'url_citation',
                    url_citation: { url: 'https://from-message.com', title: 'From message' },
                  },
                ],
              },
            },
          ],
          usage: null,
        },
        {
          annotations: [
            {
              type: 'url_citation',
              url_citation: { url: 'https://from-top-level.com', title: 'From top level' },
            },
          ],
          choices: [{ delta: {} }],
          usage: null,
        },
        { choices: [{ delta: {} }], usage: { prompt_tokens: 20, completion_tokens: 10 } },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) yield chunk;
        },
      });

      const results: Array<{ type: string; annotations?: unknown[] }> = [];
      for await (const chunk of provider.chatStream({ ...baseParams, webSearchEnabled: true })) {
        results.push(chunk);
      }

      const annotationChunks = results.filter((c) => c.type === 'annotations');
      expect(annotationChunks).toHaveLength(1);
      expect(annotationChunks[0].annotations).toHaveLength(2);
      expect(annotationChunks[0].annotations![0]).toEqual(
        expect.objectContaining({ url: 'https://from-message.com' }),
      );
      expect(annotationChunks[0].annotations![1]).toEqual(
        expect.objectContaining({ url: 'https://from-top-level.com' }),
      );
    });
  });

  describe('chatStream — reasoning chunks', () => {
    it('должен yield reasoning чанки из delta.reasoning_details', async () => {
      const chunks = [
        {
          choices: [
            {
              delta: {
                content: null,
                reasoning_details: [
                  { type: 'thinking', text: 'Анализирую...' },
                  { type: 'thinking', text: 'Думаю дальше.' },
                ],
              },
            },
          ],
          usage: null,
        },
        {
          choices: [{ delta: { content: 'Готово' } }],
          usage: null,
        },
        {
          choices: [{ delta: {} }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) yield chunk;
        },
      });

      const streamParams = { ...baseParams, stream: true };
      const results: Array<{ type: string; reasoning?: string; text?: string }> = [];
      for await (const chunk of provider.chatStream(streamParams)) {
        results.push(chunk);
      }

      const reasoningChunks = results.filter((c) => c.type === 'reasoning');
      expect(reasoningChunks).toHaveLength(2);
      expect(reasoningChunks[0]).toEqual({ type: 'reasoning', reasoning: 'Анализирую...' });
      expect(reasoningChunks[1]).toEqual({ type: 'reasoning', reasoning: 'Думаю дальше.' });
    });

    it('должен yield text чанки вместе с reasoning чанками', async () => {
      const chunks = [
        {
          choices: [
            {
              delta: {
                content: null,
                reasoning_details: [{ type: 'thinking', text: 'Мысль' }],
              },
            },
          ],
          usage: null,
        },
        {
          choices: [{ delta: { content: 'Ответ' } }],
          usage: null,
        },
        {
          choices: [{ delta: {} }],
          usage: { prompt_tokens: 50, completion_tokens: 20 },
        },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) yield chunk;
        },
      });

      const results: Array<{ type: string }> = [];
      for await (const chunk of provider.chatStream(baseParams)) {
        results.push(chunk);
      }

      const types = results.map((c) => c.type);
      expect(types).toContain('reasoning');
      expect(types).toContain('text');
      expect(types).toContain('done');
    });
  });
});
