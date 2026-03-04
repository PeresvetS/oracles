import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SessionFiltersDto } from '@core/sessions/dto/session-filters.dto';

/** DTO для обновления сессии */
export class UpdateSessionDto {
  @ApiPropertyOptional({ description: 'Новое название' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Обновлённые фильтры' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionFiltersDto)
  filters?: SessionFiltersDto;
}
