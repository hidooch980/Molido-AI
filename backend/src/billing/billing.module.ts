import { Module } from '@nestjs/common';

import { PaymentModule } from '../payment/payment.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

/**
 * ⚠️ `SubscriptionModule` وارد نمی‌شود چون `@Global()` است.
 *    وارد کردنِ دوبارهٔ ماژولِ سراسری کار می‌کند ولی می‌گوید «شاید
 *    سراسری نباشد» — و همان ابهام روزی یکی را به ساختنِ نمونهٔ دوم
 *    می‌کشاند.
 */
@Module({
  imports: [PaymentModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
