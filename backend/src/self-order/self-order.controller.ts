import { Body, Controller, Get, Param, Post, Query, Redirect } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { SelfOrderService } from './self-order.service';

/**
 * منوی دیجیتال — همه‌اش عمومی، و **باید** عمومی باشد.
 *
 * ⚠️ مشتری‌ای که QR روی میز را اسکن می‌کند حساب ندارد و قرار هم نیست
 *    بسازد.  نگهبانِ ورود اینجا یعنی منوی دیجیتال اصلاً کار نکند.
 *
 *    محافظت جای دیگری است و ضعیف‌تر نیست:
 *
 *      • توکنِ میز حدس‌ناپذیر است و فقط یک سطر را با سیاستِ
 *        SELECT-only باز می‌کند.
 *      • قیمت از پایگاه‌داده خوانده می‌شود، نه از درخواست
 *        (`trustClient: false`) — و تخفیفِ کلِ سفارش هم پذیرفته نمی‌شود.
 *      • ثبتِ سفارش پیش‌فرض **خاموش** است و تأییدِ گارسون می‌خواهد.
 *      • سقفِ مبلغ، خسارتِ بیشینه را مهار می‌کند.
 *
 *    `backend/test/self-order.sh` همه‌شان را می‌سنجد.
 */
@ApiTags('منوی دیجیتال')
@Controller('menu')
export class SelfOrderController {
  constructor(private readonly service: SelfOrderService) {}

  @Get(':token')
  menu(@Param('token') token: string) {
    return this.service.menu(token);
  }

  @Post(':token/order')
  order(@Param('token') token: string, @Body() body: Record<string, unknown>) {
    return this.service.order(token, body ?? {});
  }

  /**
   * ⚠️ مسیرِ وضعیت **زیرِ توکنِ میز نیست**.
   *
   *    اگر `/:token/order/:code` بود، دانستنِ توکنِ میز به دیدنِ
   *    سفارشِ همهٔ کسانی که امروز سرِ آن میز نشسته‌اند ترجمه می‌شد.
   *    کدِ مهمان به‌تنهایی کافی و لازم است.
   */
  @Get('order/:code')
  status(@Param('code') code: string) {
    return this.service.status(code);
  }

  /**
   * شروعِ پرداختِ آنلاین.
   *
   * ⚠️ مبلغ در بدنه پذیرفته **نمی‌شود** و اگر بفرستند نادیده می‌رود:
   *    سرور خودش از پایگاه‌داده می‌خواندش.
   */
  @Post('order/:code/pay')
  pay(@Param('code') code: string) {
    return this.service.startPayment(code);
  }

  /**
   * بازگشت از درگاه.
   *
   * ⚠️ تغییرِ مسیر، نه JSON: کاربر با ناوبریِ مرورگر برمی‌گردد و
   *    صفحهٔ متنِ خام هیچ راهی جلوی پایش نمی‌گذارد.
   */
  @Get('pay/callback')
  @Redirect()
  async payCallback(@Query('code') code?: string) {
    const site = publicSite();
    const guestCode = String(code ?? '');

    try {
      const result = await this.service.completePayment(guestCode);
      const params = new URLSearchParams({
        code: guestCode,
        paid: result.ok ? 'ok' : 'failed',
        ...(result.ok && 'bankRef' in result && result.bankRef
          ? { ref: String(result.bankRef) }
          : {}),
        ...(!result.ok && 'error' in result && result.error
          ? { reason: String(result.error) }
          : {}),
      });
      return { url: `${site}/menu/receipt?${params.toString()}` };
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : 'خطای ناشناخته';
      return {
        url: `${site}/menu/receipt?paid=failed&reason=${encodeURIComponent(reason)}`,
      };
    }
  }
}

/**
 * نشانیِ عمومیِ پنل — صفحهٔ رسید آنجاست.
 *
 * ⚠️ از پیکربندی، نه از سربرگِ `Host`.  خواندنش از درخواست یعنی
 *    مهاجم می‌تواند کاربر را پس از پرداخت به سایتِ خودش ببرد.
 */
function publicSite(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    'http://localhost:3001'
  ).replace(/\/+$/, '');
}
