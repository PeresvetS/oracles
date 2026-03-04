import { Global, Module } from '@nestjs/common';
import { SettingsController } from '@settings/settings.controller';
import { SettingsService } from '@settings/settings.service';

/**
 * Глобальный модуль настроек.
 * SettingsService доступен всем модулям без явного импорта.
 * Хранит API-ключи и параметры конфигурации в таблице Setting.
 */
@Global()
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
