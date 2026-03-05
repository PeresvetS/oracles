import { Injectable } from '@nestjs/common';
import type { ModelInfo } from '@oracle/shared';
import { SettingsService } from '@settings/settings.service';
import { MODEL_REGISTRY, PROVIDER_API_KEY_MAP } from '@config/models.registry';

/**
 * Сервис реестра моделей.
 *
 * Возвращает список моделей с полем `available`,
 * которое определяется наличием API-ключа провайдера в SettingsService.
 */
@Injectable()
export class ModelsService {
  constructor(private readonly settingsService: SettingsService) {}

  /** Список всех моделей с флагом доступности */
  findAll(): ModelInfo[] {
    return MODEL_REGISTRY.map((model) => ({
      ...model,
      available: this.isProviderAvailable(model.provider),
    }));
  }

  /** Модели, отфильтрованные по семейству */
  findByFamily(family: string): ModelInfo[] {
    return this.findAll().filter((model) => model.family === family);
  }

  /** Модели, отфильтрованные по провайдеру */
  findByProvider(provider: string): ModelInfo[] {
    return this.findAll().filter((model) => model.provider === provider);
  }

  /** Найти модель по ID */
  findById(id: string): ModelInfo | null {
    const entry = MODEL_REGISTRY.find((model) => model.id === id);
    if (!entry) return null;

    return {
      ...entry,
      available: this.isProviderAvailable(entry.provider),
    };
  }

  /** Проверить доступность провайдера по наличию API-ключа */
  private isProviderAvailable(provider: string): boolean {
    const settingKey = PROVIDER_API_KEY_MAP[provider];
    if (!settingKey) return false;

    const apiKey = this.settingsService.get(settingKey);
    return apiKey !== null && apiKey.trim().length > 0;
  }
}
