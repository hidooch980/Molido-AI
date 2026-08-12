import { Module } from '@nestjs/common';
import { HelpdeskService } from './helpdesk.service';
import { HelpdeskController } from './helpdesk.controller';

@Module({
  controllers: [HelpdeskController],
  providers: [HelpdeskService],
  exports: [HelpdeskService],
})
export class HelpdeskModule {}
