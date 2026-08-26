import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PaymentModule } from '../payment/payment.module';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';

/**
 * ⚠️ به `PaymentModule` وابسته است، نه اینکه درگاه را خودش بسازد.
 *
 *    دو نمونهٔ درگاه یعنی دو تعریف از «پرداختِ موفق» — و روزی که
 *    یکی عوض شود، دیگری بی‌صدا عقب می‌ماند.
 */
@Module({
  imports: [DatabaseModule, PaymentModule],
  controllers: [SiteController],
  providers: [SiteService],
  exports: [SiteService],
})
export class SiteModule {}
