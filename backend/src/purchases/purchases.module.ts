import { Module } from '@nestjs/common';

import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';


@Module({
  imports: [
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
