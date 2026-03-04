import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { AGENT_ROLE, type AgentRole } from '@oracle/shared';

/** DTO для создания шаблона промпта */
export class CreatePromptDto {
  @ApiProperty({ description: 'Роль агента', enum: Object.values(AGENT_ROLE) })
  @IsEnum(AGENT_ROLE, { message: 'Роль должна быть DIRECTOR, ANALYST или RESEARCHER' })
  role!: AgentRole;

  @ApiPropertyOptional({
    description: 'ID модели (null = универсальный)',
    example: 'anthropic/claude-sonnet-4-6',
  })
  @IsOptional()
  @IsString()
  modelId?: string;

  @ApiProperty({ description: 'Название шаблона' })
  @IsString()
  @MinLength(1, { message: 'Название не может быть пустым' })
  name!: string;

  @ApiProperty({ description: 'Текст промпта' })
  @IsString()
  @MinLength(10, { message: 'Промпт слишком короткий (минимум 10 символов)' })
  content!: string;

  @ApiPropertyOptional({ description: 'Установить как дефолтный', default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
