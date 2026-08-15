import { Module } from '@nestjs/common';

import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';
import { SmsCampaignService } from './sms-campaign.service';

@Module({
  controllers: [SmsController],
  providers: [SmsService, SmsCampaignService],
  exports: [SmsService, SmsCampaignService],
})
export class SmsModule {}
