import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Session } from '@prisma/client';
import { SESSION_STATUS, type SessionStatus } from '@oracle/shared';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@core/auth/interfaces/authenticated-user.interface';
import {
  SessionsService,
  type SessionWithDetails,
  type SessionMessagesResult,
} from '@core/sessions/sessions.service';
import { CreateSessionDto } from '@core/sessions/dto/create-session.dto';
import { UpdateSessionDto } from '@core/sessions/dto/update-session.dto';
import { SendMessageDto } from '@core/sessions/dto/send-message.dto';
import { UpdateMaxRoundsDto } from '@core/sessions/dto/update-max-rounds.dto';
import { ResumeSessionDto } from '@core/sessions/dto/resume-session.dto';
import type { PaginatedResult } from '@shared/interfaces/paginated-result.interface';

/**
 * Контроллер сессий.
 *
 * CRUD + управление жизненным циклом (start/pause/resume/message/updateMaxRounds).
 */
@ApiTags('Сессии')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  /** Список сессий текущего пользователя */
  @Get()
  @ApiOperation({ summary: 'Список сессий текущего пользователя' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Номер страницы',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Записей на странице',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: Object.values(SESSION_STATUS),
    description: 'Фильтр по статусу',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Пагинированный список сессий',
  })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: SessionStatus,
  ): Promise<PaginatedResult<Session>> {
    return this.sessionsService.findAll(user.id, {
      page,
      limit,
      status,
    });
  }

  /** Создание новой сессии с агентами */
  @Post()
  @ApiOperation({ summary: 'Создание новой сессии' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Сессия создана с агентами',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Ошибка валидации',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSessionDto,
  ): Promise<SessionWithDetails> {
    return this.sessionsService.create(user.id, dto);
  }

  /** Детали сессии */
  @Get(':id')
  @ApiOperation({ summary: 'Детали сессии' })
  @ApiParam({ name: 'id', description: 'ID сессии' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Сессия с агентами и счётчиками',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Сессия не найдена',
  })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SessionWithDetails> {
    return this.sessionsService.findOne(user.id, id);
  }

  /** Сообщения сессии */
  @Get(':id/messages')
  @ApiOperation({ summary: 'Все сообщения сессии' })
  @ApiParam({ name: 'id', description: 'ID сессии' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Список сообщений сессии',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Сессия не найдена',
  })
  async findMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<SessionMessagesResult> {
    return this.sessionsService.findMessages(user.id, id);
  }

  /** Обновление настроек сессии */
  @Patch(':id')
  @ApiOperation({ summary: 'Обновление настроек сессии' })
  @ApiParam({ name: 'id', description: 'ID сессии' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Сессия обновлена',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Сессия не найдена',
  })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ): Promise<Session> {
    return this.sessionsService.update(user.id, id, dto);
  }

  /** Удаление сессии */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Удаление сессии' })
  @ApiParam({ name: 'id', description: 'ID сессии' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Сессия удалена',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Сессия не найдена',
  })
  async delete(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.sessionsService.delete(user.id, id);
  }

  /** Запуск сессии */
  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Запуск сессии' })
  @ApiParam({ name: 'id', description: 'ID сессии' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Сессия запущена',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Неверный статус сессии',
  })
  async start(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Session> {
    return this.sessionsService.start(user.id, id);
  }

  /** Пауза сессии */
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Пауза сессии' })
  @ApiParam({ name: 'id', description: 'ID сессии' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Сессия поставлена на паузу',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Неверный статус сессии',
  })
  async pause(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Session> {
    return this.sessionsService.pause(user.id, id);
  }

  /** Возобновление сессии */
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Возобновление сессии' })
  @ApiParam({ name: 'id', description: 'ID сессии' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Сессия возобновлена',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Неверный статус сессии',
  })
  async resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResumeSessionDto,
  ): Promise<Session> {
    return this.sessionsService.resume(user.id, id, dto.message);
  }

  /** Отправка сообщения — создаёт дополнительный раунд */
  @Post(':id/message')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Отправка сообщения — создаёт доп. раунд',
  })
  @ApiParam({ name: 'id', description: 'ID сессии' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Сообщение принято',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Сессия ещё не запущена',
  })
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<{ success: boolean }> {
    await this.sessionsService.sendMessage(user.id, id, dto.content);
    return { success: true };
  }

  /** Обновление лимита раундов */
  @Patch(':id/max-rounds')
  @ApiOperation({ summary: 'Увеличение лимита раундов' })
  @ApiParam({ name: 'id', description: 'ID сессии' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Лимит раундов обновлён',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Невалидное значение',
  })
  async updateMaxRounds(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateMaxRoundsDto,
  ): Promise<Session> {
    return this.sessionsService.updateMaxRounds(user.id, id, dto.maxRounds);
  }
}
