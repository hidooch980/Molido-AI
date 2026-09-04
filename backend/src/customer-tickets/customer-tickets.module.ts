import { Module } from '@nestjs/common';
import { CustomerTicketsService } from './customer-tickets.service';
import { CustomerTicketsController } from './customer-tickets.controller';

@Module({
  controllers: [CustomerTicketsController],
  providers: [CustomerTicketsService],
  exports: [CustomerTicketsService],
})
export class CustomerTicketsModule {}
