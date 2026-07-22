import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { SmsController } from './sms.controller';
import { SmsService } from './sms.service';

@Module({
  imports: [
    ConfigModule,
  ],
  controllers: [
    SmsController,
  ],
  providers: [
    SmsService,
  ],
  exports: [
    SmsService,
  ],
})
export class SmsModule {}
