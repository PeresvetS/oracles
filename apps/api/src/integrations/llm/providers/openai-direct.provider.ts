import { Injectable, Logger } from '@nestjs/common';
import type { LlmChatParams, LlmChatResponse, LlmStreamChunk } from '@oracle/shared';
import type { LlmProvider } from '@integrations/llm/providers/llm-provider.interface';

const PROVIDER_NAME = 'openai-direct';
const NOT_IMPLEMENTED_MESSAGE = `Провайдер ${PROVIDER_NAME} не реализован. Используйте OpenRouter для доступа к моделям OpenAI.`;

/**
 * Заглушка для прямого OpenAI API.
 * Будет реализована при необходимости обхода OpenRouter.
 */
@Injectable()
export class OpenAIDirectProvider implements LlmProvider {
  private readonly logger = new Logger(OpenAIDirectProvider.name);
  readonly providerName = PROVIDER_NAME;

  async chat(_params: LlmChatParams): Promise<LlmChatResponse> {
    this.logger.warn(NOT_IMPLEMENTED_MESSAGE);
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }

  async *chatStream(_params: LlmChatParams): AsyncGenerator<LlmStreamChunk> {
    this.logger.warn(NOT_IMPLEMENTED_MESSAGE);
    throw new Error(NOT_IMPLEMENTED_MESSAGE);
  }
}
