import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import process from 'node:process';

import { SiteService } from './site.service';

/**
 * API سایتِ معرفی — همه‌اش عمومی.
 *
 * ⚠️ نگهبانِ ورود ندارد و **نباید داشته باشد**: بازدیدکنندهٔ سایت
 *    توکن ندارد.  محافظت جای دیگری است:
 *
 *      • قیمت از پایگاه‌داده خوانده می‌شود، نه از درخواست.
 *      • تأییدِ پرداخت از کانالِ پشتیِ درگاه انجام می‌شود.
 *      • کدِ رهگیری حدس‌ناپذیر است و فقط یک سطر را باز می‌کند.
 *      • ستون‌های حساس در پاسخِ وضعیت نیستند.
 */
@ApiTags('سایت معرفی')
@Controller('site')
export class SiteController {
  constructor(private readonly site: SiteService) {}

  @Get('modules')
  modules() {
    return this.site.modules();
  }

  @Post('purchase')
  purchase(@Body() body: Record<string, unknown>) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('بدنهٔ درخواست نامعتبر است');
    }
    return this.site.purchase({
      slugs: body.slugs,
      name: body.name,
      phone: body.phone,
      email: body.email,
      company: body.company,
      note: body.note,
    });
  }

  /**
   * بازگشت از درگاه.
   *
   * ⚠️ تغییرِ مسیر، نه JSON: کاربر با ناوبریِ مرورگر برمی‌گردد و
   *    صفحهٔ متنِ خام هیچ راهی جلوی پایش نمی‌گذارد.
   *
   * ⚠️ مقصد سایتِ **ایستا**ست، نه این سرور — آنجا صفحهٔ نتیجه هست.
   */
  @Get('purchase/callback')
  @Redirect()
  async callback(@Query('code') code?: string) {
    const site = publicSite();
    try {
      const result = await this.site.completePurchase(code ?? '');
      const q = new URLSearchParams({
        code: result.trackingCode,
        status: result.ok ? 'ok' : 'failed',
        ...(result.ok && result.bankRef ? { ref: result.bankRef } : {}),
        ...(!result.ok && result.error ? { reason: result.error } : {}),
      });
      return { url: `${site}/result.html?${q.toString()}` };
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : 'خطای ناشناخته';
      return {
        url: `${site}/result.html?status=failed&reason=${encodeURIComponent(reason)}`,
      };
    }
  }

  @Get('purchase/:code')
  status(@Param('code') code: string) {
    return this.site.status(code);
  }
}

/**
 * نشانیِ سایتِ ایستا.
 *
 * ⚠️ از پیکربندی، نه از سربرگِ `Host`.  خواندنش از درخواست یعنی
 *    مهاجم می‌تواند کاربر را پس از پرداخت به سایتِ خودش ببرد.
 */
function publicSite(): string {
  return (
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'https://molido.ir'
  ).replace(/\/+$/, '');
}
