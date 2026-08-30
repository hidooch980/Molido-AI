import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { RestaurantModule } from '../restaurant/restaurant.module';
import { SelfOrderController } from './self-order.controller';
import { SelfOrderService } from './self-order.service';

/**
 * ⚠️ به `RestaurantModule` وابسته است و این عمدی است.
 *
 *    منوی دیجیتال تابعِ ساختِ سفارشِ خودش را ندارد؛ همان
 *    `createOrder` را با `trustClient: false` صدا می‌زند.  دو تعریف
 *    از «سفارش» یعنی روزی که یکی عوض شود — مالیات، سرویس، ارسال به
 *    آشپزخانه — دیگری بی‌صدا عقب بماند.
 */
@Module({
  imports: [DatabaseModule, RestaurantModule],
  controllers: [SelfOrderController],
  providers: [SelfOrderService],
  exports: [SelfOrderService],
})
export class SelfOrderModule {}
