import { Module } from '@nestjs/common';

import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';
// ⚠️ بدونِ این، درآمدِ رستوران دوباره بیرونِ دفتر می‌ماند.
import { AccountingModule } from '../accounting/accounting.module';

/**
 * ماژول کافه‌رستوران
 * سالن و میز • منو و رسپی • سفارش • آشپزخانه (KDS) • رزرو • شیفت
 */
@Module({
  imports: [AccountingModule],
  controllers: [RestaurantController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}
