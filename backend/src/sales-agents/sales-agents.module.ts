import { Module } from '@nestjs/common';
import { SalesAgentsService } from './sales-agents.service';
import { SalesAgentsController } from './sales-agents.controller';

@Module({
  controllers: [SalesAgentsController],
  providers: [SalesAgentsService],
  exports: [SalesAgentsService],
})
export class SalesAgentsModule {}
