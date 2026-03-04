import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsOptional, IsUUID, IsBoolean } from 'class-validator';
import { AGENT_ROLE, type AgentRole } from '@oracle/shared';

/** DTO для конфигурации одного агента при создании сессии */
export class CreateAgentDto {
  @ApiProperty({
    description: 'Роль агента',
    enum: Object.values(AGENT_ROLE),
  })
  @IsEnum(AGENT_ROLE, {
    message: 'Роль должна быть DIRECTOR, ANALYST или RESEARCHER',
  })
  role!: AgentRole;

  @ApiPropertyOptional({
    description: 'Имя агента (автогенерация если не указано)',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ description: 'Провайдер: openrouter | perplexity' })
  @IsString()
  provider!: string;

  @ApiProperty({
    description: 'ID модели из реестра',
    example: 'anthropic/claude-sonnet-4-6',
  })
  @IsString()
  modelId!: string;

  @ApiPropertyOptional({
    description: 'ID шаблона промпта (если не указан — дефолтный)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'promptTemplateId должен быть UUID' })
  promptTemplateId?: string;

  @ApiPropertyOptional({
    description: 'Кастомный промпт (приоритет над шаблоном)',
  })
  @IsOptional()
  @IsString()
  customSystemPrompt?: string;

  @ApiPropertyOptional({
    description: 'Разрешён ли web_search',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  webSearchEnabled?: boolean;
}
