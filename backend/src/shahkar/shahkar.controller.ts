import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { ShahkarService } from './shahkar.service';

/**
 * استعلامِ دستیِ شاهکار.
 *
 * ⚠️ **عمومی نیست و نباید باشد.**
 *
 *    مسیرِ بازِ استعلام یعنی هرکسی می‌تواند حدس بزند فلان شماره به
 *    نامِ کدام کد ملی است — یا برعکس، فهرستی از کدهای ملی را با یک
 *    شماره بسنجد.  خودِ سرویس ابزارِ نشتِ هویت می‌شود.
 *
 *    به‌علاوه هر استعلام هزینه دارد؛ مسیرِ باز یعنی هر کسی می‌تواند
 *    سهمیهٔ روزانه را بسوزاند.
 */
@ApiTags('شاهکار')
@Controller('shahkar')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShahkarController {
  constructor(private readonly shahkar: ShahkarService) {}

  /**
   * وضعیتِ پیکربندی — برای اینکه پنل بتواند فیلد را نشان دهد یا نه.
   *
   * ⚠️ هیچ اعتبارنامه‌ای برنمی‌گرداند، فقط «هست/نیست».
   */
  @Get('status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  status() {
    return {
      configured: this.shahkar.isConfigured(),
      enforced: this.shahkar.isEnforced(),
    };
  }

  @Post('verify')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT', 'CASHIER', 'SALES')
  verify(
    @CurrentUser() user: AuthUser,
    @Body() body: { nationalCode?: unknown; mobile?: unknown; refresh?: unknown },
  ) {
    // مدیرِ ارشد می‌تواند بی‌شرکت باشد.  استعلامِ بی‌شرکت جایی برای
    // ذخیره ندارد و — مهم‌تر — از سیاستِ جداسازی بیرون می‌افتد.
    if (!user.companyId) {
      throw new BadRequestException('برای استعلام شاهکار باید در زمینهٔ یک شرکت باشید');
    }

    return this.shahkar.verify(user.companyId, body?.nationalCode, body?.mobile, {
      // ⚠️ تازه‌سازی فقط با درخواستِ صریح: پیش‌فرضِ `refresh` یعنی
      //    حافظه بی‌اثر و سهمیه هدر.
      refresh: body?.refresh === true,
    });
  }
}
