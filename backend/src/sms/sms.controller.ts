import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { SmsService } from './sms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('sms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Post('send')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  send(@Body() body: { to: string; message: string }) {
    return this.smsService.send(body.to, body.message);
  }

  @Post('send-bulk')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  sendBulk(@Body() body: { recipients: Array<string>; message: string }) {
    return this.smsService.sendBulk(body.recipients ?? [], body.message);
  }
}
