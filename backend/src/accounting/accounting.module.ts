import { Module } from '@nestjs/common';

import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [
    AccountingController,
  ],
  providers: [
    AccountingService,
  ],
  exports: [
    AccountingService,
  ],
})
export class AccountingModule {}
