import { Module } from '@nestjs/common';

import { TelephonyController } from './telephony.controller';
import { TelephonyService } from './telephony.service';

/**
 * تلفن — شماره‌گیری از راه مرکز SIP.
 *
 * `TelephonyService` بیرون هم لازم است (مریم از آن استفاده می‌کند)، پس
 * صادر می‌شود.
 */
@Module({
  controllers: [TelephonyController],
  providers: [TelephonyService],
  exports: [TelephonyService],
})
export class TelephonyModule {}
