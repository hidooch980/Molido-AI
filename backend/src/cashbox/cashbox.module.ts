import { Module } from '@nestjs/common';

import { CashBoxController } from './cashbox.controller';
import { CashBoxService } from './cashbox.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [
    CashBoxController,
  ],
  providers: [
    CashBoxService,
  ],
  exports: [
    CashBoxService,
  ],
})
export class CashBoxModule {}
