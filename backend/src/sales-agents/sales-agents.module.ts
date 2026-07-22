import { Module } from '@nestjs/common';
import { SalesAgentsService } from './sales-agents.service';
import { SalesAgentsController } from './sales-agents.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SalesAgentsController],
  providers: [SalesAgentsService],
  exports: [SalesAgentsService],
})
export class SalesAgentsModule {}
