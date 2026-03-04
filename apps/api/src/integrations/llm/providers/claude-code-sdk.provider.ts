import { Injectable, Logger } from '@nestjs/common';
import type { LlmChatParams, LlmChatResponse, LlmStreamChunk } from '@oracle/shared';
import type { LlmProvider } from '@integrations/llm/providers/llm-provider.interface';

const PROVIDER_NAME = 'claude-code-sdk';
const NOT_IMPLEMENTED_MESSAGE = `Провайдер ${PROVIDER_NAME} не реализован. Будет добавлен для интеграции с Claude Code SDK.`;

/**
 * Заглушка для Claude Code SDK.
 * Будет реализована для агентного взаимодействия через Claude Code.
 */
@Injectable()
export class ClaudeCodeSdkProvider implements LlmProvider {
  private readonly logger = new Logger(ClaudeCodeSdkProvider.name);
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
