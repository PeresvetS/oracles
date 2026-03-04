import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { maskApiKey } from '@oracle/shared';
import { PrismaService } from '@prisma/prisma.service';

/** Все поддерживаемые ключи настроек с env fallback */
const KNOWN_SETTING_KEYS = [
  'openrouter_api_key',
  'perplexity_api_key',
  'anthropic_api_key',
  'openai_api_key',
  'google_api_key',
  'serper_api_key',
  'default_max_rounds',
  'default_analyst_count',
  'default_director_model',
  'default_researcher_model',
] as const;

/** Ключи настроек, являющихся API-ключами (маскируются при отдаче клиенту) */
const API_KEY_SETTING_KEYS = new Set<string>([
  'openrouter_api_key',
  'perplexity_api_key',
  'anthropic_api_key',
  'openai_api_key',
  'google_api_key',
  'serper_api_key',
]);

/**
 * Сервис глобальных настроек.
 *
 * Кэш в памяти (Map) загружается при старте приложения.
 * Синхронный get() всегда работает из кэша, асинхронный set() обновляет БД и кэш.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private readonly cache = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.loadCache();
  }

  /**
   * Получить значение настройки синхронно.
   * Порядок поиска: кэш → process.env[KEY_UPPER_CASE].
   */
  get(key: string): string | null {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const envValue = process.env[key.toUpperCase()];
    return envValue ?? null;
  }

  /**
   * Сохранить/обновить настройку.
   * Upsert в БД + обновление кэша.
   */
  async set(key: string, value: string): Promise<void> {
    await this.prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    this.cache.set(key, value);
  }

  /**
   * Все настройки из кэша с env fallback для известных ключей.
   */
  async getAll(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    for (const [key, value] of this.cache.entries()) {
      result[key] = value;
    }

    for (const key of KNOWN_SETTING_KEYS) {
      if (result[key] !== undefined) {
        continue;
      }

      const envValue = process.env[key.toUpperCase()];
      if (envValue !== undefined) {
        result[key] = envValue;
      }
    }

    return result;
  }

  /**
   * Все настройки с маскированием API-ключей.
   * API-ключи заменяются на `****xxxx` (последние 4 символа).
   */
  async getAllMasked(): Promise<Record<string, string>> {
    const all = await this.getAll();
    const masked: Record<string, string> = {};

    for (const [key, value] of Object.entries(all)) {
      masked[key] = API_KEY_SETTING_KEYS.has(key) && value ? maskApiKey(value) : value;
    }

    return masked;
  }

  /** Перезагрузить кэш из БД */
  async reloadCache(): Promise<void> {
    await this.loadCache();
  }

  private async loadCache(): Promise<void> {
    const settings = await this.prisma.setting.findMany();
    this.cache.clear();
    for (const { key, value } of settings) {
      this.cache.set(key, value);
    }
    this.logger.log(`Кэш настроек загружен: ${settings.length} записей`);
  }
}
