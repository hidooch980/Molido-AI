import { Module } from '@nestjs/common';

import { PaymentService } from './payment.service';
import { ZarinpalGateway } from './zarinpal.gateway';

/**
 * درگاه پرداخت.
 *
 * ⚠️ افزودنِ درگاهِ تازه = یک فایلِ تازه که `PaymentGateway` را پیاده
 *    کند + یک سطر در `providers` + یک شرط در `PaymentService.gateway()`.
 *    مسیرِ تسویه دست‌نخورده می‌ماند.
 */
@Module({
  providers: [PaymentService, ZarinpalGateway],
  // ⚠️ خودِ درگاه هم صادر می‌شود، نه فقط `PaymentService`.
  //
  //    `SiteModule` فروشِ ماژول را انجام می‌دهد که سفارشِ کالا نیست و
  //    از `PaymentService` رد نمی‌شود.  ولی نباید نمونهٔ **دومی** از
  //    درگاه بسازد: دو نمونه یعنی دو تعریف از «پرداختِ موفق»، و روزی
  //    که یکی عوض شود دیگری بی‌صدا عقب می‌ماند.
  exports: [PaymentService, ZarinpalGateway],
})
export class PaymentModule {}
