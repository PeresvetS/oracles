import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IDEA_STATUS, type IdeaStatus } from '@oracle/shared';

/**
 * DTO фильтрации идей по статусу.
 */
export class IdeaQueryDto {
  @ApiPropertyOptional({
    enum: IDEA_STATUS,
    description: 'Фильтр по статусу идеи',
    example: IDEA_STATUS.FINAL,
  })
  @IsOptional()
  @IsEnum(IDEA_STATUS, {
    message: `Статус должен быть одним из: ${Object.values(IDEA_STATUS).join(', ')}`,
  })
  status?: IdeaStatus;
}
