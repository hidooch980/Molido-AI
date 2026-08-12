import { Module } from '@nestjs/common';

import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';

/**
 * ماژول کافه‌رستوران
 * سالن و میز • منو و رسپی • سفارش • آشپزخانه (KDS) • رزرو • شیفت
 */
@Module({
  controllers: [RestaurantController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}
