import { Global, Module } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';

/**
 * Глобальный модуль Prisma.
 * Предоставляет PrismaService всем модулям без явного импорта.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
