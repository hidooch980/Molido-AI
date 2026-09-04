import { Module } from '@nestjs/common';

import { PricingModule } from '../pricing/pricing.module';
import { TaxModule } from '../tax/tax.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';


@Module({
  imports: [
    PricingModule,
    TaxModule,
  ],
  controllers: [
    SalesController,
  ],
  providers: [
    SalesService,
  ],
  exports: [
    SalesService,
  ],
})
export class SalesModule {}
