import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import type { Report } from '@prisma/client';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import type { AuthenticatedUser } from '@core/auth/interfaces/authenticated-user.interface';
import { ReportsService } from '@core/reports/reports.service';
import { ExportReportDto } from '@core/reports/dto/export-report.dto';
import { EXPORT_FORMAT } from '@core/reports/constants/reports.constants';

/**
 * REST-контроллер финальных отчётов сессии.
 *
 * Базовый путь: /api/sessions/:sessionId/report
 */
@ApiTags('Отчёты')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('sessions/:sessionId/report')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Получить финальный отчёт сессии.
   *
   * @param sessionId - ID сессии
   * @returns Отчёт с финальными и отклонёнными идеями
   */
  @Get()
  @ApiOperation({ summary: 'Получить финальный отчёт сессии' })
  @ApiParam({ name: 'sessionId', description: 'ID сессии' })
  @ApiResponse({ status: 200, description: 'Финальный отчёт' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 404, description: 'Отчёт не найден' })
  async findBySession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ): Promise<Report> {
    return this.reportsService.findBySession(sessionId, user.id);
  }

  /**
   * Экспортировать отчёт в CSV или JSON.
   *
   * @param sessionId - ID сессии
   * @param query - Параметры экспорта (format=csv|json)
   * @param res - Express Response для установки заголовков
   */
  @Get('export')
  @ApiOperation({ summary: 'Экспортировать отчёт (CSV или JSON)' })
  @ApiParam({ name: 'sessionId', description: 'ID сессии' })
  @ApiQuery({
    name: 'format',
    enum: EXPORT_FORMAT,
    description: 'Формат экспорта',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Файл отчёта' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  @ApiResponse({ status: 404, description: 'Отчёт не найден' })
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Query() query: ExportReportDto,
    @Res() res: Response,
  ): Promise<void> {
    if (query.format === EXPORT_FORMAT.CSV) {
      const csv = await this.reportsService.exportCsv(sessionId, user.id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="report-${sessionId}.csv"`);
      res.send(csv);
      return;
    }

    const json = await this.reportsService.exportJson(sessionId, user.id);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="report-${sessionId}.json"`);
    res.send(JSON.stringify(json, null, 2));
  }
}
