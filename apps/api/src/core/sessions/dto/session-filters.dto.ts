import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, IsNumber, IsString, IsBoolean, Min, Max } from 'class-validator';

/** Лимиты сложности */
const COMPLEXITY_MIN = 1;
const COMPLEXITY_MAX = 10;
const BUDGET_MIN = 0;

/** DTO фильтров сессии */
export class SessionFiltersDto {
  @ApiPropertyOptional({
    description: 'Максимальная сложность (1-10)',
    minimum: COMPLEXITY_MIN,
    maximum: COMPLEXITY_MAX,
  })
  @IsOptional()
  @IsInt()
  @Min(COMPLEXITY_MIN)
  @Max(COMPLEXITY_MAX)
  maxComplexity?: number;

  @ApiPropertyOptional({
    description: 'Максимальный бюджет на запуск ($)',
    minimum: BUDGET_MIN,
  })
  @IsOptional()
  @IsNumber()
  @Min(BUDGET_MIN)
  maxBudget?: number;

  @ApiPropertyOptional({
    description: 'Время до первых денег: 1_month | 3_months | 6_months',
  })
  @IsOptional()
  @IsString()
  timeToRevenue?: string;

  @ApiPropertyOptional({
    description: 'Минимальный размер рынка: small | medium | large',
  })
  @IsOptional()
  @IsString()
  minMarketSize?: string;

  @ApiPropertyOptional({ description: 'Обязательны ли конкуренты' })
  @IsOptional()
  @IsBoolean()
  requireCompetitors?: boolean;

  @ApiPropertyOptional({
    description: 'Допустимый юридический риск: low | medium | high',
  })
  @IsOptional()
  @IsString()
  legalRiskTolerance?: string;

  @ApiPropertyOptional({ description: 'Проверка адекватности' })
  @IsOptional()
  @IsBoolean()
  operabilityCheck?: boolean;
}
