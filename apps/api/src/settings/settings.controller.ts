import { Body, Controller, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { UpdateSettingsDto } from '@settings/dto/update-settings.dto';
import { SettingsService } from '@settings/settings.service';

/**
 * Контроллер управления глобальными настройками.
 * API-ключи провайдеров хранятся в БД и маскируются при отдаче.
 */
@ApiTags('Настройки')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Получить все настройки.
   * API-ключи возвращаются маскированными (только последние 4 символа).
   */
  @Get()
  @ApiOperation({ summary: 'Получить все настройки (API-ключи маскированы)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Настройки получены' })
  async getAll(): Promise<Record<string, string>> {
    return this.settingsService.getAllMasked();
  }

  /**
   * Обновить одну или несколько настроек.
   * Для обновления API-ключей передать полное значение ключа.
   */
  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Обновить настройки' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Настройки обновлены' })
  async update(@Body() dto: UpdateSettingsDto): Promise<void> {
    const entries = Object.entries(dto).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    );

    await Promise.all(entries.map(([key, value]) => this.settingsService.set(key, value)));
  }
}
