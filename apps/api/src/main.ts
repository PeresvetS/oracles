import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from '@app/app.module';

const API_PREFIX = 'api';
const SWAGGER_PATH = 'api/docs';
const DEFAULT_PORT = 3001;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Отключаем встроенный логгер NestJS — будет заменён pino
    bufferLogs: true,
  });

  // Заменяем встроенный NestJS логгер на pino
  app.useLogger(app.get(Logger));

  // Глобальный префикс для всех маршрутов
  app.setGlobalPrefix(API_PREFIX);

  // Валидация и трансформация DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — разрешаем запросы от admin-панели
  app.enableCors({
    origin: process.env.ADMIN_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  // Swagger документация
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Oracle API')
    .setDescription('Мультиагентная система генерации бизнес-идей Oracle')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT;
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`Приложение запущено на порту ${port}`, 'Bootstrap');
  logger.log(`Swagger: http://localhost:${port}/${SWAGGER_PATH}`, 'Bootstrap');
}

void bootstrap();
