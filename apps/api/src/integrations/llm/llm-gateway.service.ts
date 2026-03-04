import { Injectable, Logger } from '@nestjs/common';
import type { LlmChatParams, LlmChatResponse, LlmStreamChunk } from '@oracle/shared';
import type { LlmProvider } from '@integrations/llm/providers/llm-provider.interface';
import { OpenRouterProvider } from '@integrations/llm/providers/openrouter.provider';
import { PerplexityProvider } from '@integrations/llm/providers/perplexity.provider';

/**
 * LLM Gateway — единая точка входа для всех LLM-вызовов.
 *
 * Маршрутизирует запросы к нужному провайдеру по полю `params.provider`.
 * Все остальные сервисы (OrchestratorService, AgentRunnerService, RoundManagerService)
 * должны вызывать LLM только через этот gateway.
 *
 * Зарегистрированные провайдеры:
 * - "openrouter" → OpenRouterProvider (Claude, GPT, Gemini)
 * - "perplexity" → PerplexityProvider (Sonar, Sonar Reasoning)
 */
@Injectable()
export class LlmGatewayService {
  private readonly logger = new Logger(LlmGatewayService.name);
  private readonly providerMap: Map<string, LlmProvider>;

  constructor(
    private readonly openRouterProvider: OpenRouterProvider,
    private readonly perplexityProvider: PerplexityProvider,
  ) {
    this.providerMap = new Map<string, LlmProvider>([
      [openRouterProvider.providerName, openRouterProvider],
      [perplexityProvider.providerName, perplexityProvider],
    ]);
  }

  /**
   * Синхронный вызов LLM.
   * Маршрутизирует к нужному провайдеру по `params.provider`.
   *
   * @throws Error если провайдер не зарегистрирован
   */
  async chat(params: LlmChatParams): Promise<LlmChatResponse> {
    const provider = this.resolveProvider(params.provider);

    this.logger.debug(
      `LLM chat: provider=${params.provider}, model=${params.modelId}, messages=${params.messages.length}`,
    );

    return provider.chat(params);
  }

  /**
   * Стриминг ответа LLM.
   * Маршрутизирует к нужному провайдеру по `params.provider`.
   *
   * @throws Error если провайдер не зарегистрирован
   */
  async *chatStream(params: LlmChatParams): AsyncGenerator<LlmStreamChunk> {
    const provider = this.resolveProvider(params.provider);

    this.logger.debug(
      `LLM stream: provider=${params.provider}, model=${params.modelId}, messages=${params.messages.length}`,
    );

    yield* provider.chatStream(params);
  }

  /**
   * Получить список зарегистрированных провайдеров.
   */
  getRegisteredProviders(): string[] {
    return Array.from(this.providerMap.keys());
  }

  /**
   * Найти провайдер по имени.
   *
   * @throws Error если провайдер не зарегистрирован
   */
  private resolveProvider(providerName: string): LlmProvider {
    const provider = this.providerMap.get(providerName);

    if (!provider) {
      const available = this.getRegisteredProviders().join(', ');
      throw new Error(`Провайдер "${providerName}" не зарегистрирован. Доступные: ${available}`);
    }

    return provider;
  }
}
