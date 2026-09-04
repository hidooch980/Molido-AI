import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator';
import { BillingService } from './billing.service';

/**
 * تمدیدِ اشتراک از داخلِ نرم‌افزار.
 *
 * ⚠️ این کنترلر **برچسبِ قابلیت نمی‌گیرد** و نباید بگیرد.
 *
 *    `ALWAYS_WRITABLE` در `edition.interceptor.ts` مسیرِ `/billing` را
 *    حتی با اشتراکِ منقضی باز نگه می‌دارد — وگرنه مشتریِ منقضی
 *    نمی‌تواند تمدید کند و انقضا راهِ برگشت ندارد.
 *
 *    اگر روزی کسی این‌جا `@Feature(...)` بگذارد، آن دام دوباره باز
 *    می‌شود.
 */
@ApiTags('صورت‌حساب اشتراک')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  /**
   * نسخه‌ها و قیمتشان.
   *
   * ⚠️ برای همهٔ کاربران باز است: صفحهٔ «تمدید» باید بتواند قیمت را
   *    نشان دهد، حتی وقتی کاربرِ جاری اجازهٔ خرید ندارد.
   */
  @Get('plans')
  @ApiOperation({ summary: 'نسخه‌های قابلِ خریدِ آنلاین و قیمتشان' })
  plans() {
    return this.service.catalogue();
  }

  @Get('invoices')
  @Roles('ADMIN', 'MANAGER', 'ACCOUNTANT', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'صورت‌حساب‌های اشتراکِ شرکت' })
  invoices(@CurrentUser() user: AuthUser) {
    return this.service.invoices(user.companyId as string);
  }

  /**
   * ⚠️ فقط مدیر — این مسیر پول جابه‌جا می‌کند.
   */
  @Post('start')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'ساخت صورت‌حساب و رفتن به درگاه' })
  start(
    @CurrentUser() user: AuthUser,
    @Body() body: { plan?: string; months?: number },
    @Req() req: { headers: Record<string, string | undefined> },
  ) {
    // ⚠️ `origin` فقط **عقب‌گرد** است وقتی `PUBLIC_WEB_URL` تنظیم نشده.
    //
    //    سرآیندِ درخواست را کاربر می‌فرستد و قابلِ جعل است؛ در تولید
    //    باید پیکربندی تعیین کند کاربر کجا برمی‌گردد، نه مرورگرش.
    const origin = String(req?.headers?.origin ?? '');
    return this.service.start(user.companyId as string, body ?? {}, origin);
  }

  @Post('verify/:invoiceId')
  @Roles('ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ summary: 'تأیید پرداخت و تمدید اشتراک' })
  verify(
    @CurrentUser() user: AuthUser,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.service.verify(user.companyId as string, invoiceId);
  }
}
