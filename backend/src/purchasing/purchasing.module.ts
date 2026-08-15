import { Module } from '@nestjs/common';

import { PurchasingController } from './purchasing.controller';
import { PurchasingService } from './purchasing.service';

/**
 * منشی خرید: استعلام قیمت از بنکدارها، مقایسه، و صدور فاکتور خرید.
 *
 * جدا از `PurchasesModule` است چون آن «خریدِ انجام‌شده» را ثبت می‌کند و
 * این «تصمیمِ خرید» را می‌سازد.  یکی کردنشان، سرویسی می‌ساخت که هم
 * موجودی را عوض می‌کند هم تماس تلفنی ثبت می‌کند.
 */
@Module({
  controllers: [PurchasingController],
  providers: [PurchasingService],
  exports: [PurchasingService],
})
export class PurchasingModule {}
