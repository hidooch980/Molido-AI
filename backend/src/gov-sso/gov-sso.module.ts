import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { ShopModule } from '../shop/shop.module';
import { GovSsoController } from './gov-sso.controller';
import { OidcGovSsoProvider } from './gov-sso.provider';
import { GovSsoService } from './gov-sso.service';

/**
 * ⚠️ این ماژول عمداً به `AuthModule` و `ShopModule` وابسته است.
 *
 *    وسوسه این بود که خودش توکن صادر کند و از هر دو مستقل بماند.  ولی
 *    آن‌وقت سه تعریف از «کاربرِ وارد شده» می‌داشتیم و روزی که یکی عوض
 *    می‌شد — مثلاً افزودنِ ابطالِ نشست — دوتای دیگر بی‌صدا عقب
 *    می‌ماندند.
 */
@Module({
  imports: [DatabaseModule, AuthModule, ShopModule],
  controllers: [GovSsoController],
  providers: [GovSsoService, OidcGovSsoProvider],
  exports: [GovSsoService],
})
export class GovSsoModule {}
