import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, Min, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  @Min(1)
  @IsOptional()
  PORT: number = 3001;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  OPENROUTER_API_KEY: string = '';

  @IsString()
  @IsOptional()
  PERPLEXITY_API_KEY: string = '';

  @IsString()
  @IsOptional()
  SERPER_API_KEY: string = '';

  @IsString()
  @IsOptional()
  SEED_ADMIN_EMAIL: string = 'admin@besales.app';

  @IsString()
  @IsOptional()
  SEED_ADMIN_PASSWORD: string = 'changeme';
}

/** Валидация env-переменных при старте приложения */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
