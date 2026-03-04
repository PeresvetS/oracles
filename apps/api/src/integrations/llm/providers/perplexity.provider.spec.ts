import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from '@settings/settings.service';
import { PerplexityProvider } from '@integrations/llm/providers/perplexity.provider';
import { LLM_DEFAULTS } from '@oracle/shared';
import type { LlmChatParams } from '@oracle/shared';

/**
 * Мок OpenAI SDK для Perplexity.
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

describe('PerplexityProvider', () => {
  let provider: PerplexityProvider;
  let settingsService: jest.Mocked<SettingsService>;

  const mockApiKey = 'test-perplexity-api-key';

  const baseParams: LlmChatParams = {
    provider: 'perplexity',
    modelId: 'sonar-pro',
    messages: [
      { role: 'system', content: 'Ты ресерчер' },
      { role: 'user', content: 'Найди конкурентов SaaS платформ' },
    ],
  };

  const mockPerplexityResponse = {
    choices: [
      {
        message: {
          content: 'Основные конкуренты: Salesforce, HubSpot, Zoho',
        },
      },
    ],
    usage: {
      prompt_tokens: 80,
      completion_tokens: 120,
    },
    model: 'sonar-pro',
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

    mockCreate.mockResolvedValue(mockPerplexityResponse);

    const module: TestingModule = await Test.createTestingModule({
      providers: [PerplexityProvider, { provide: SettingsService, useValue: settingsService }],
    }).compile();

    provider = module.get<PerplexityProvider>(PerplexityProvider);
  });

  describe('providerName', () => {
    it('должен вернуть "perplexity"', () => {
      expect(provider.providerName).toBe('perplexity');
    });
  });

  describe('getClient (через chat)', () => {
    it('должен создать клиент с PERPLEXITY_BASE_URL', async () => {
      await provider.chat(baseParams);

      expect(mockOpenAIConstructor).toHaveBeenCalledWith({
        baseURL: LLM_DEFAULTS.PERPLEXITY_BASE_URL,
        apiKey: mockApiKey,
      });
    });

    it('должен пересоздать клиент при смене API-ключа', async () => {
      await provider.chat(baseParams);

      settingsService.get.mockReturnValue('new-perplexity-key');
      await provider.chat(baseParams);

      expect(mockOpenAIConstructor).toHaveBeenCalledTimes(2);
    });

    it('должен бросить ошибку если API-ключ не настроен', async () => {
      settingsService.get.mockReturnValue(null);

      await expect(provider.chat(baseParams)).rejects.toThrow('API-ключ Perplexity не настроен');
    });
  });

  describe('chat', () => {
    it('должен маппить ответ без citations', async () => {
      const result = await provider.chat(baseParams);

      expect(result.content).toBe('Основные конкуренты: Salesforce, HubSpot, Zoho');
      expect(result.tokensInput).toBe(80);
      expect(result.tokensOutput).toBe(120);
      expect(result.model).toBe('sonar-pro');
      expect(result.toolCalls).toBeUndefined();
    });

    it('должен добавлять citations к content', async () => {
      mockCreate.mockResolvedValue({
        ...mockPerplexityResponse,
        citations: ['https://www.salesforce.com', 'https://www.hubspot.com'],
      });

      const result = await provider.chat(baseParams);

      expect(result.content).toContain('Основные конкуренты');
      expect(result.content).toContain('**Источники:**');
      expect(result.content).toContain('1. https://www.salesforce.com');
      expect(result.content).toContain('2. https://www.hubspot.com');
    });

    it('не должен передавать tools (Perplexity не поддерживает)', async () => {
      const paramsWithTools: LlmChatParams = {
        ...baseParams,
        tools: [
          {
            type: 'function',
            function: {
              name: 'web_search',
              description: 'Поиск',
              parameters: { type: 'object', properties: {} },
            },
          },
        ],
      };

      await provider.chat(paramsWithTools);

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs).not.toHaveProperty('tools');
    });

    it('должен фильтровать tool сообщения', async () => {
      const paramsWithToolMessages: LlmChatParams = {
        ...baseParams,
        messages: [
          { role: 'system', content: 'Системный' },
          { role: 'user', content: 'Запрос' },
          {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ws', arguments: '{}' } }],
          },
          { role: 'tool', content: 'результат', tool_call_id: 'c1' },
          { role: 'user', content: 'Продолжай' },
        ],
      };

      await provider.chat(paramsWithToolMessages);

      const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
      const messages = callArgs['messages'] as Array<Record<string, unknown>>;

      // tool сообщение должно быть отфильтровано
      expect(messages).toHaveLength(4);
      expect(messages.every((m) => m['role'] !== 'tool')).toBe(true);
    });

    it('должен бросить ошибку при пустом choices', async () => {
      mockCreate.mockResolvedValue({ choices: [], usage: {} });

      await expect(provider.chat(baseParams)).rejects.toThrow('Perplexity вернул пустой ответ');
    });
  });

  describe('calculateCost', () => {
    it('должен рассчитать стоимость для sonar-pro', () => {
      // costPer1kInput=0.0003, costPer1kOutput=0.0015
      const cost = provider.calculateCost('sonar-pro', 1000, 500);

      // (1000/1000)*0.0003 + (500/1000)*0.0015 = 0.0003 + 0.00075 = 0.00105
      expect(cost).toBeCloseTo(0.00105, 6);
    });

    it('должен вернуть 0 для неизвестной модели', () => {
      const cost = provider.calculateCost('unknown-model', 1000, 500);

      expect(cost).toBe(0);
    });

    it('должен рассчитать стоимость для sonar-reasoning-pro', () => {
      // costPer1kInput=0.001, costPer1kOutput=0.005
      const cost = provider.calculateCost('sonar-reasoning-pro', 2000, 1000);

      // (2000/1000)*0.001 + (1000/1000)*0.005 = 0.002 + 0.005 = 0.007
      expect(cost).toBeCloseTo(0.007, 6);
    });
  });
});
