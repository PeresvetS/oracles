import { Module } from '@nestjs/common';
import { ReportsService } from '@core/reports/reports.service';
import { ReportsController } from '@core/reports/reports.controller';

/**
 * Модуль финальных отчётов.
 *
 * Предоставляет ReportsService для использования в OrchestratorModule.
 * Регистрирует ReportsController для REST-эндпоинтов.
 * PrismaModule глобален — не нужно импортировать.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
