import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import type { Idea } from '@prisma/client';
import { IDEA_STATUS } from '@oracle/shared';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@core/auth/interfaces/authenticated-user.interface';
import { IdeasService } from '@core/ideas/ideas.service';
import { IdeaQueryDto } from '@core/ideas/dto/idea-query.dto';

/**
 * REST-контроллер управления идеями сессии.
 *
 * Базовый путь: /api/sessions/:sessionId/ideas
 */
@ApiTags('Идеи')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('sessions/:sessionId/ideas')
export class IdeasController {
  constructor(private readonly ideasService: IdeasService) {}

  /**
   * Получить идеи сессии.
   *
   * @param sessionId - ID сессии
   * @param query - Фильтры (опциональный статус)
   * @returns Список идей
   */
  @Get()
  @ApiOperation({ summary: 'Получить идеи сессии' })
  @ApiParam({ name: 'sessionId', description: 'ID сессии' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: IDEA_STATUS,
    description: 'Фильтр по статусу',
  })
  @ApiResponse({ status: 200, description: 'Список идей сессии' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  async findBySession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Query() query: IdeaQueryDto,
  ): Promise<Idea[]> {
    return this.ideasService.findBySession(sessionId, query.status, user.id);
  }

  /**
   * Получить отклонённые идеи сессии.
   *
   * @param sessionId - ID сессии
   * @returns Список отклонённых идей
   */
  @Get('rejected')
  @ApiOperation({ summary: 'Получить отклонённые идеи сессии' })
  @ApiParam({ name: 'sessionId', description: 'ID сессии' })
  @ApiResponse({ status: 200, description: 'Список отклонённых идей' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  async findRejected(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ): Promise<Idea[]> {
    return this.ideasService.findRejected(sessionId, user.id);
  }
}
