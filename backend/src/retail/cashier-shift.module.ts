import { Global, Module } from '@nestjs/common';
import { CashierShiftService } from './cashier-shift.service';

/**
 * شیفت صندوق‌دار
 *
 * از `RetailModule` جدا است چون مفهومش به فروش تعلق دارد نه به اسکن بارکد:
 * `SalesService` هر فاکتور را به شیفت باز گره می‌زند، و محصولی که صندوق
 * فروشگاهی ندارد — مثل رستوران — همچنان باید بتواند بفروشد.
 *
 * @Global() تا فروش بدون import مستقیم به آن برسد.
 */
@Global()
@Module({
  providers: [CashierShiftService],
  exports: [CashierShiftService],
})
export class CashierShiftModule {}
