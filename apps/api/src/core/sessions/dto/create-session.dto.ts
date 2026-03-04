import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  MinLength,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SESSION_MODE, SESSION_LIMITS, type SessionMode } from '@oracle/shared';
import { CreateAgentDto } from '@core/agents/dto/create-agent.dto';
import { SessionFiltersDto } from '@core/sessions/dto/session-filters.dto';

/** Минимум агентов: 1 директор + MIN_ANALYSTS аналитиков + 1 ресерчер */
const MIN_AGENTS_COUNT = SESSION_LIMITS.MIN_ANALYSTS + 2;
const INPUT_PROMPT_MIN_LENGTH = 10;

/** DTO для создания сессии */
export class CreateSessionDto {
  @ApiPropertyOptional({
    description: 'Название сессии (автогенерация если не указано)',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    description: 'Режим: генерация или валидация',
    enum: Object.values(SESSION_MODE),
  })
  @IsEnum(SESSION_MODE, {
    message: 'Режим должен быть GENERATE или VALIDATE',
  })
  mode!: SessionMode;

  @ApiProperty({
    description: 'Основной промпт / задание (минимум 10 символов)',
  })
  @IsString()
  @MinLength(INPUT_PROMPT_MIN_LENGTH, {
    message: `Промпт слишком короткий (минимум ${INPUT_PROMPT_MIN_LENGTH} символов)`,
  })
  inputPrompt!: string;

  @ApiPropertyOptional({
    description: 'Существующие идеи (для режима VALIDATE)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  existingIdeas?: string[];

  @ApiProperty({
    description: 'Конфигурация агентов',
    type: [CreateAgentDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAgentDto)
  @ArrayMinSize(MIN_AGENTS_COUNT, {
    message: `Минимум ${MIN_AGENTS_COUNT} агентов (1 директор + ${SESSION_LIMITS.MIN_ANALYSTS} аналитика + 1 ресерчер)`,
  })
  agents!: CreateAgentDto[];

  @ApiPropertyOptional({ description: 'Фильтры сессии' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SessionFiltersDto)
  filters?: SessionFiltersDto;

  @ApiPropertyOptional({
    description: `Макс. раундов (${SESSION_LIMITS.MIN_ROUNDS}-${SESSION_LIMITS.MAX_ROUNDS})`,
    default: SESSION_LIMITS.DEFAULT_MAX_ROUNDS,
  })
  @IsOptional()
  @IsInt()
  @Min(SESSION_LIMITS.MIN_ROUNDS)
  @Max(SESSION_LIMITS.MAX_ROUNDS)
  maxRounds?: number;

  @ApiPropertyOptional({
    description: `Макс. вызовов ресерчера (0-${SESSION_LIMITS.MAX_RESEARCH_CALLS})`,
    default: SESSION_LIMITS.DEFAULT_MAX_RESEARCH_CALLS,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SESSION_LIMITS.MAX_RESEARCH_CALLS)
  maxResearchCalls?: number;
}
