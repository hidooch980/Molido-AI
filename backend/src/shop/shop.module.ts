import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { AuthModule } from '../auth/auth.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';

import { ShopService } from './shop.service';
import {
  ShopAdminController,
  ShopPublicController,
} from './shop.controller';
import { ShopTenantMiddleware } from './shop-tenant.middleware';
import {
  CustomerAuthGuard,
  OptionalCustomerGuard,
} from './customer-auth';

@Module({
  // AuthModule ماژول JWT را صادر می‌کند؛ همان کلید برای توکن مشتری هم به
  // کار می‌رود و `kind` در محتوا دو نوع را از هم جدا نگه می‌دارد.
  imports: [AuthModule, LoyaltyModule, SmsModule],
  controllers: [ShopPublicController, ShopAdminController],
  providers: [ShopService, ShopTenantMiddleware, CustomerAuthGuard, OptionalCustomerGuard],
  exports: [ShopService],
})
export class ShopModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // فقط مسیرهای عمومی؛ مدیریت فروشگاه زمینه‌اش را از توکن کارمند
    // می‌گیرد و نباید به شرکت پیکربندی‌شده وصل شود.
    consumer.apply(ShopTenantMiddleware).forRoutes('shop');
  }
}
