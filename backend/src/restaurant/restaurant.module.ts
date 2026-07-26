import { Module } from '@nestjs/common';

import { RestaurantService } from './restaurant.service';
import { RestaurantController } from './restaurant.controller';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * ماژول کافه‌رستوران
 * سالن و میز • منو و رسپی • سفارش • آشپزخانه (KDS) • رزرو • شیفت
 */
@Module({
  imports: [PrismaModule],
  controllers: [RestaurantController],
  providers: [RestaurantService],
  exports: [RestaurantService],
})
export class RestaurantModule {}
