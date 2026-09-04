import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ShahkarController } from './shahkar.controller';
import { ShahkarProvider } from './shahkar.provider';
import { ShahkarService } from './shahkar.service';

/**
 * ⚠️ `ShahkarService` صادر می‌شود چون مسیرهای دیگر (کالابرگ، ثبت‌نامِ
 *    مشتری، ساختِ کارمند) `enforce` را صدا می‌زنند.
 *
 *    وسوسه این بود که هر کدام خودش استعلام بزند.  آن‌وقت سیاستِ خطا و
 *    حافظه در چند جا تکرار می‌شد و روزی که یکی عوض می‌شد، بقیه بی‌صدا
 *    عقب می‌ماندند — همان استدلالِ `GovSsoModule`.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [ShahkarController],
  providers: [ShahkarService, ShahkarProvider],
  exports: [ShahkarService],
})
export class ShahkarModule {}
