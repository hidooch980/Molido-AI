import { Module } from '@nestjs/common';

import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
  ],
  controllers: [
    PurchasesController,
  ],
  providers: [
    PurchasesService,
  ],
  exports: [
    PurchasesService,
  ],
})
export class PurchasesModule {}
