import { Module } from '@nestjs/common';

import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

/**
 * پیکرهٔ صوتی زبان‌های کم‌منبع — فعلاً بلوچی.
 *
 * این ماژول موتور گفتار **نیست**؛ دادهٔ آموزشش را می‌سازد.  تفاوتش مهم
 * است: موتور را می‌شود خرید یا دانلود کرد، ولی برای بلوچی هیچ پیکرهٔ
 * آماده‌ای وجود ندارد و تنها راه، ضبط کردن از صفر است.
 *
 * فروشگاه بهترین جای این کار است چون فهرست کالا از قبل هست و
 * صندوق‌دارها بلوچ‌زبان‌اند — یعنی هم متن هست هم گوینده.
 */
@Module({
  controllers: [VoiceController],
  providers: [VoiceService],
  exports: [VoiceService],
})
export class VoiceModule {}
