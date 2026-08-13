import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';

import { ShopService } from './shop.service';
import {
  ShopAdminController,
  ShopPublicController,
} from './shop.controller';
import { ShopTenantMiddleware } from './shop-tenant.middleware';

@Module({
  controllers: [ShopPublicController, ShopAdminController],
  providers: [ShopService, ShopTenantMiddleware],
  exports: [ShopService],
})
export class ShopModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // فقط مسیرهای عمومی؛ مدیریت فروشگاه زمینه‌اش را از توکن کارمند
    // می‌گیرد و نباید به شرکت پیکربندی‌شده وصل شود.
    consumer.apply(ShopTenantMiddleware).forRoutes('shop');
  }
}
