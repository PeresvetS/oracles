import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';
import { SESSION_LIMITS } from '@oracle/shared';

/** DTO для обновления лимита раундов */
export class UpdateMaxRoundsDto {
  @ApiProperty({
    description: `Новый лимит раундов (${SESSION_LIMITS.MIN_ROUNDS}-${SESSION_LIMITS.MAX_ROUNDS})`,
  })
  @IsInt()
  @Min(SESSION_LIMITS.MIN_ROUNDS)
  @Max(SESSION_LIMITS.MAX_ROUNDS)
  maxRounds!: number;
}
