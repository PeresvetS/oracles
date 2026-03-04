import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

/** DTO для обновления шаблона промпта */
export class UpdatePromptDto {
  @ApiPropertyOptional({ description: 'Название шаблона' })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Название не может быть пустым' })
  name?: string;

  @ApiPropertyOptional({ description: 'Текст промпта' })
  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Промпт слишком короткий (минимум 10 символов)' })
  content?: string;

  @ApiPropertyOptional({ description: 'Установить как дефолтный' })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
