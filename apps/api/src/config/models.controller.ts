import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { ModelsService } from '@config/models.service';
import type { ModelInfo } from '@oracle/shared';

/**
 * Контроллер реестра моделей.
 * Возвращает список доступных LLM-моделей с флагом доступности.
 */
@ApiTags('Модели')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('models')
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  /**
   * Список всех моделей из реестра.
   * Поле `available` указывает, настроен ли API-ключ для провайдера модели.
   */
  @Get()
  @ApiOperation({ summary: 'Список доступных моделей' })
  @ApiQuery({
    name: 'family',
    required: false,
    description: 'Фильтр по семейству: claude, gpt, gemini, sonar',
  })
  @ApiQuery({
    name: 'provider',
    required: false,
    description: 'Фильтр по провайдеру: openrouter, perplexity',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Список моделей с флагом доступности' })
  findAll(@Query('family') family?: string, @Query('provider') provider?: string): ModelInfo[] {
    if (family) {
      return this.modelsService.findByFamily(family);
    }
    if (provider) {
      return this.modelsService.findByProvider(provider);
    }
    return this.modelsService.findAll();
  }
}
