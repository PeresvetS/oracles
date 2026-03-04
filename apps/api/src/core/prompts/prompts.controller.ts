import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AgentRole, PromptTemplate } from '@prisma/client';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { PromptsService } from '@core/prompts/prompts.service';
import { CreatePromptDto } from '@core/prompts/dto/create-prompt.dto';
import { UpdatePromptDto } from '@core/prompts/dto/update-prompt.dto';

/**
 * Контроллер шаблонов промптов.
 * CRUD для управления системными промптами агентов.
 */
@ApiTags('Промпт-шаблоны')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('prompts')
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  /**
   * Список шаблонов промптов с фильтрацией.
   */
  @Get()
  @ApiOperation({ summary: 'Список промпт-шаблонов' })
  @ApiQuery({ name: 'role', required: false, enum: AgentRole, description: 'Фильтр по роли' })
  @ApiQuery({ name: 'modelId', required: false, description: 'Фильтр по ID модели' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Список шаблонов' })
  async findAll(
    @Query('role') role?: AgentRole,
    @Query('modelId') modelId?: string,
  ): Promise<PromptTemplate[]> {
    return this.promptsService.findAll({ role, modelId });
  }

  /**
   * Создать новый шаблон промпта.
   */
  @Post()
  @ApiOperation({ summary: 'Создать промпт-шаблон' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Шаблон создан' })
  async create(@Body() dto: CreatePromptDto): Promise<PromptTemplate> {
    return this.promptsService.create(dto);
  }

  /**
   * Обновить шаблон промпта.
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Обновить промпт-шаблон' })
  @ApiParam({ name: 'id', description: 'ID шаблона' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Шаблон обновлён' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Шаблон не найден' })
  async update(@Param('id') id: string, @Body() dto: UpdatePromptDto): Promise<PromptTemplate> {
    return this.promptsService.update(id, dto);
  }

  /**
   * Удалить шаблон промпта.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удалить промпт-шаблон' })
  @ApiParam({ name: 'id', description: 'ID шаблона' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Шаблон удалён' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Шаблон не найден' })
  async delete(@Param('id') id: string): Promise<void> {
    return this.promptsService.delete(id);
  }
}
