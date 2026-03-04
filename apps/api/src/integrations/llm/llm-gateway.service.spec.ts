import { Test, TestingModule } from '@nestjs/testing';
import type { LlmChatParams, LlmChatResponse, LlmStreamChunk } from '@oracle/shared';
import { LlmGatewayService } from '@integrations/llm/llm-gateway.service';
import { OpenRouterProvider } from '@integrations/llm/providers/openrouter.provider';
import { PerplexityProvider } from '@integrations/llm/providers/perplexity.provider';

describe('LlmGatewayService', () => {
  let service: LlmGatewayService;
  let openRouterProvider: jest.Mocked<OpenRouterProvider>;
  let perplexityProvider: jest.Mocked<PerplexityProvider>;

  const mockChatResponse: LlmChatResponse = {
    content: 'Ответ модели',
    tokensInput: 100,
    tokensOutput: 50,
    costUsd: 0.001,
    latencyMs: 500,
    model: 'anthropic/claude-sonnet-4-6',
  };

  const mockParams: LlmChatParams = {
    provider: 'openrouter',
    modelId: 'anthropic/claude-sonnet-4-6',
    messages: [{ role: 'user', content: 'Привет' }],
  };

  beforeEach(async () => {
    openRouterProvider = {
      providerName: 'openrouter',
      chat: jest.fn().mockResolvedValue(mockChatResponse),
      chatStream: jest.fn(),
    } as unknown as jest.Mocked<OpenRouterProvider>;

    perplexityProvider = {
      providerName: 'perplexity',
      chat: jest.fn().mockResolvedValue({ ...mockChatResponse, model: 'sonar-pro' }),
      chatStream: jest.fn(),
    } as unknown as jest.Mocked<PerplexityProvider>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmGatewayService,
        { provide: OpenRouterProvider, useValue: openRouterProvider },
        { provide: PerplexityProvider, useValue: perplexityProvider },
      ],
    }).compile();

    service = module.get<LlmGatewayService>(LlmGatewayService);
  });

  describe('chat', () => {
    it('должен делегировать вызов в OpenRouterProvider', async () => {
      const result = await service.chat(mockParams);

      expect(openRouterProvider.chat).toHaveBeenCalledWith(mockParams);
      expect(result).toEqual(mockChatResponse);
    });

    it('должен делегировать вызов в PerplexityProvider', async () => {
      const perplexityParams: LlmChatParams = {
        ...mockParams,
        provider: 'perplexity',
        modelId: 'sonar-pro',
      };

      const result = await service.chat(perplexityParams);

      expect(perplexityProvider.chat).toHaveBeenCalledWith(perplexityParams);
      expect(result.model).toBe('sonar-pro');
    });

    it('должен бросить ошибку для неизвестного провайдера', async () => {
      const unknownParams: LlmChatParams = {
        ...mockParams,
        provider: 'unknown-provider',
      };

      await expect(service.chat(unknownParams)).rejects.toThrow(
        'Провайдер "unknown-provider" не зарегистрирован',
      );
    });

    it('должен передавать параметры без изменений', async () => {
      const paramsWithTools: LlmChatParams = {
        ...mockParams,
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
        temperature: 0.5,
        maxTokens: 2048,
      };

      await service.chat(paramsWithTools);

      expect(openRouterProvider.chat).toHaveBeenCalledWith(paramsWithTools);
    });
  });

  describe('chatStream', () => {
    it('должен делегировать стриминг в OpenRouterProvider', async () => {
      const chunks: LlmStreamChunk[] = [
        { type: 'text', text: 'Привет' },
        { type: 'done', usage: { tokensInput: 10, tokensOutput: 5, costUsd: 0.0001 } },
      ];

      async function* mockStream(): AsyncGenerator<LlmStreamChunk> {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      openRouterProvider.chatStream.mockReturnValue(mockStream());

      const result: LlmStreamChunk[] = [];
      for await (const chunk of service.chatStream(mockParams)) {
        result.push(chunk);
      }

      expect(result).toEqual(chunks);
      expect(openRouterProvider.chatStream).toHaveBeenCalledWith(mockParams);
    });

    it('должен бросить ошибку для неизвестного провайдера при стриминге', async () => {
      const unknownParams: LlmChatParams = {
        ...mockParams,
        provider: 'unknown',
      };

      const stream = service.chatStream(unknownParams);

      await expect(stream.next()).rejects.toThrow('Провайдер "unknown" не зарегистрирован');
    });
  });

  describe('getRegisteredProviders', () => {
    it('должен вернуть список зарегистрированных провайдеров', () => {
      const providers = service.getRegisteredProviders();

      expect(providers).toContain('openrouter');
      expect(providers).toContain('perplexity');
      expect(providers).toHaveLength(2);
    });
  });
});
