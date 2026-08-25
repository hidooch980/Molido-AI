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
  exports: [PaymentService],
})
export class PaymentModule {}
