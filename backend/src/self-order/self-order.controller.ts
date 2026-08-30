import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
}
