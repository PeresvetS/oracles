import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/** DTO для возобновления сессии */
export class ResumeSessionDto {
  @ApiPropertyOptional({
    description: 'Необязательное сообщение при возобновлении',
  })
  @IsOptional()
  @IsString()
  message?: string;
}
