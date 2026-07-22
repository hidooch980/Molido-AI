import { Module } from '@nestjs/common';

import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ContractsController],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
