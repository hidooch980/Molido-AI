import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { StructureService } from './structure.service';
import { foreignToStructure } from './foreign-csv';

/**
 * پشتیبان و بازیابیِ ساختار.
 *
 * ⚠️ فقط مدیر — و این سخت‌گیری عمدی است.
 *
 *    خروجی نقشهٔ کاملِ کدینگ حساب، شعبه‌ها و تأمین‌کننده‌های یک
 *    کسب‌وکار است.  برای رقیب ارزش دارد حتی بدونِ یک عدد قیمت.
 */
@ApiTags('ساختار')
@Controller('structure')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StructureController {
  constructor(private readonly structure: StructureService) {}

  /**
   * ⚠️ `companyId` می‌تواند تهی باشد — مدیرِ کل به شرکتی بسته نیست.
   *
   *    با `!` رد کردنش یعنی پرس‌وجو با `null` اجرا شود و **فایلِ
   *    خالی** برگردد؛ کاربر فکر می‌کند ساختارش پشتیبان گرفته شده و
   *    فایلِ تهی را نگه می‌دارد.  خطای صریح خیلی بهتر است.
   */
  private company(user: AuthUser): string {
    if (!user.companyId) {
      throw new BadRequestException('این حساب به شرکتی بسته نیست');
    }
    return user.companyId;
  }

  @Get('export')
  @Throttle({ long: { ttl: 60000, limit: 20 } })
  @Roles('SUPER_ADMIN', 'ADMIN')
  export(@CurrentUser() user: AuthUser) {
    return this.structure.export(this.company(user));
  }

  /**
   * بازیابی.
   *
   * ⚠️ `dryRun` پیش‌فرض **نیست** ولی رابط باید اول آن را بزند.
   *
   *    همان درسِ ورودِ کالا: فایلی که اشتباه فهمیده شود، ساختاری
   *    می‌سازد که پاک کردنش از ساختنش سخت‌تر است.  اینجا بدتر هم
   *    هست، چون حساب‌ها به سندها گره می‌خورند.
   */
  @Post('restore')
  @Throttle({ long: { ttl: 60000, limit: 20 } })
  @Roles('SUPER_ADMIN', 'ADMIN')
  restore(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @Query('dryRun') dryRun?: string,
  ) {
    return this.structure.restore(this.company(user), body, {
      dryRun: dryRun === 'true' || dryRun === '1',
    });
  }

  /**
   * فایلِ نرم‌افزارِ دیگر ← فایلِ ساختار.
   *
   * ⚠️ **نمی‌نویسد.**  فقط تبدیل می‌کند.
   *
   *    خروجی همان فایلی است که به `/structure/restore` داده می‌شود،
   *    پس مسیرِ آزموده را طی می‌کند: پیش‌نمایش، بعد اعمال، افزایشی
   *    و تکرارپذیر.  مسیرِ دومِ درج یعنی دو جا که باید امن باشند.
   */
  @Post('convert')
  @Throttle({ long: { ttl: 60000, limit: 20 } })
  @Roles('SUPER_ADMIN', 'ADMIN')
  convert(@Body() body: { kind?: string; csv?: string }) {
    const kind = body?.kind;
    if (kind !== 'Account' && kind !== 'Category' && kind !== 'Supplier') {
      throw new BadRequestException('نوع باید Account یا Category یا Supplier باشد');
    }
    if (typeof body?.csv !== 'string' || !body.csv.trim()) {
      throw new BadRequestException('فایل خالی است');
    }
    return foreignToStructure(kind, body.csv);
  }
}
