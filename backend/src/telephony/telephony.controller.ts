import { Controller, Get, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TelephonyService } from './telephony.service';

/**
 * وضعیت مرکز تلفن.
 *
 * فقط خواندنی است؛ خودِ شماره‌گیری در `purchasing` است چون آنجا
 * `supplierId` در دست است و می‌شود مطمئن شد شماره از پایگاه داده
 * می‌آید نه از درخواست.
 */
@Controller('telephony')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TelephonyController {
  constructor(private readonly telephony: TelephonyService) {}

  /**
   * آیا مرکز پیکربندی شده؟
   *
   * رابط از این استفاده می‌کند تا دکمهٔ تماس را وقتی مرکزی نیست نشان
   * ندهد.  دکمه‌ای که کار نمی‌کند بدتر از نبودنش است.
   */
  @Get('status')
  status() {
    return this.telephony.status();
  }
}
