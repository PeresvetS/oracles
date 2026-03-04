import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * DTO для обновления глобальных настроек.
 * Все поля необязательны — передаются только изменяемые ключи.
 */
export class UpdateSettingsDto {
  @ApiPropertyOptional({ description: 'API-ключ OpenRouter' })
  @IsOptional()
  @IsString()
  openrouter_api_key?: string;

  @ApiPropertyOptional({ description: 'API-ключ Perplexity' })
  @IsOptional()
  @IsString()
  perplexity_api_key?: string;

  @ApiPropertyOptional({ description: 'API-ключ Anthropic (прямой)' })
  @IsOptional()
  @IsString()
  anthropic_api_key?: string;

  @ApiPropertyOptional({ description: 'API-ключ OpenAI (прямой)' })
  @IsOptional()
  @IsString()
  openai_api_key?: string;

  @ApiPropertyOptional({ description: 'API-ключ Google (прямой)' })
  @IsOptional()
  @IsString()
  google_api_key?: string;

  @ApiPropertyOptional({ description: 'API-ключ Serper (web search)' })
  @IsOptional()
  @IsString()
  serper_api_key?: string;

  @ApiPropertyOptional({ description: 'Дефолтное кол-во раундов' })
  @IsOptional()
  @IsString()
  default_max_rounds?: string;

  @ApiPropertyOptional({ description: 'Дефолтное кол-во аналитиков' })
  @IsOptional()
  @IsString()
  default_analyst_count?: string;

  @ApiPropertyOptional({ description: 'Дефолтная модель директора' })
  @IsOptional()
  @IsString()
  default_director_model?: string;

  @ApiPropertyOptional({ description: 'Дефолтная модель ресерчера' })
  @IsOptional()
  @IsString()
  default_researcher_model?: string;
}
