import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EXPORT_FORMAT, type ExportFormat } from '@core/reports/constants/reports.constants';

/**
 * DTO параметров экспорта отчёта.
 */
export class ExportReportDto {
  @ApiProperty({
    enum: EXPORT_FORMAT,
    description: 'Формат экспорта: csv или json',
    example: EXPORT_FORMAT.CSV,
  })
  @IsEnum(EXPORT_FORMAT, {
    message: `Формат должен быть одним из: ${Object.values(EXPORT_FORMAT).join(', ')}`,
  })
  format!: ExportFormat;
}
