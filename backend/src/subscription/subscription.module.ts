import { Global, Module } from '@nestjs/common';

import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';

/**
 * ⚠️ `@Global()` چون سقفِ کاربر در `UsersService` سنجیده می‌شود و
 *    فعال بودنِ اشتراک جاهای دیگر — وارد کردنِ دستیِ ماژول در هر
 *    کدامشان، یکی را جا می‌گذارد.
 */
@Global()
@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
