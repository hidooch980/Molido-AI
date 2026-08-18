import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global so that any module can inject `PrismaService` without re-importing it.
 * Database access still flows through services, never straight from a
 * controller.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
