import { Module } from '@nestjs/common';
import { CustomerTicketsService } from './customer-tickets.service';
import { CustomerTicketsController } from './customer-tickets.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CustomerTicketsController],
  providers: [CustomerTicketsService],
  exports: [CustomerTicketsService],
})
export class CustomerTicketsModule {}
