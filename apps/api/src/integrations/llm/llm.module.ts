import { Module } from '@nestjs/common';
import { LlmGatewayService } from '@integrations/llm/llm-gateway.service';
import { OpenRouterProvider } from '@integrations/llm/providers/openrouter.provider';
import { PerplexityProvider } from '@integrations/llm/providers/perplexity.provider';
import { AnthropicDirectProvider } from '@integrations/llm/providers/anthropic-direct.provider';
import { OpenAIDirectProvider } from '@integrations/llm/providers/openai-direct.provider';
import { GoogleDirectProvider } from '@integrations/llm/providers/google-direct.provider';
import { ClaudeCodeSdkProvider } from '@integrations/llm/providers/claude-code-sdk.provider';

/**
 * Модуль LLM-интеграции.
 *
 * Предоставляет:
 * - LlmGatewayService — единая точка входа для всех LLM-вызовов
 *
 * Веб-поиск в агентах работает через OpenRouter plugin (plugins:[{id:"web"}]),
 * который активируется полем webSearchEnabled в LlmChatParams. Serper не требуется.
 *
 * Зависимости:
 * - SettingsModule (global) — API-ключи провайдеров
 *
 * Все провайдеры регистрируются как NestJS providers,
 * экспортируется только LlmGatewayService.
 * Провайдеры инжектируются в gateway автоматически.
 */
@Module({
  providers: [
    LlmGatewayService,
    OpenRouterProvider,
    PerplexityProvider,
    AnthropicDirectProvider,
    OpenAIDirectProvider,
    GoogleDirectProvider,
    ClaudeCodeSdkProvider,
  ],
  exports: [LlmGatewayService],
})
export class LlmModule {}
