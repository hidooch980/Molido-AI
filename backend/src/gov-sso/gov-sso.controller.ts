import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Redirect,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import process from 'node:process';

import { AuthService } from '../auth/auth.service';
import { ShopService } from '../shop/shop.service';
import { GovSsoService } from './gov-sso.service';
import { GovAudience, isGovAudience } from './gov-sso.types';

/**
 * ورود با درگاه دولت.
 *
 * ⚠️ هر دو مسیر **عمومی**‌اند و باید باشند: کسی که هنوز وارد نشده
 *    نمی‌تواند توکن داشته باشد.  محافظت از `state` می‌آید، نه از
 *    نگهبانِ ورود.
 *
 * ⚠️ بازگشت به‌جای JSON، **تغییرِ مسیر** است.
 *
 *    درگاه کاربر را با یک ناوبریِ مرورگری برمی‌گرداند، نه با
 *    درخواستِ AJAX.  پاسخِ JSON یعنی کاربر یک صفحهٔ متنِ خام می‌بیند.
 *    پس نتیجه در پارامترِ نشانی به صفحهٔ وب داده می‌شود و همان‌جا
 *    ذخیره می‌شود.
 */
@ApiTags('ورود با درگاه دولت')
@Controller('gov-sso')
export class GovSsoController {
  constructor(
    private readonly sso: GovSsoService,
    private readonly auth: AuthService,
    private readonly shop: ShopService,
  ) {}

  /** آیا این نصب ورودِ دولتی دارد؟ صفحهٔ ورود با همین دکمه را نشان می‌دهد یا نه. */
  @Get('status')
  status() {
    return { configured: this.sso.isConfigured() };
  }

  @Get('start')
  async start(
    @Query('audience') audience?: string,
    @Query('redirectTo') redirectTo?: string,
  ) {
    if (!isGovAudience(audience)) {
      throw new BadRequestException('مخاطبِ ورود نامعتبر است');
    }

    return this.sso.start({ audience, redirectTo: redirectTo ?? null });
  }

  /**
   * بازگشت از درگاه.
   *
   * ⚠️ خطاها هم با تغییرِ مسیر برمی‌گردند، نه با کدِ وضعیت.
   *
   *    کاربر در مرورگرش ایستاده؛ یک صفحهٔ ۴۰۳ خام هیچ راهی جلوی پایش
   *    نمی‌گذارد.  پیام به صفحهٔ ورود می‌رود تا بتواند دوباره تلاش کند.
   */
  // ⚠️ `@Redirect` لازم است: بدونش Nest شیء را به‌صورت JSON چاپ می‌کند
  //    و کاربر یک صفحهٔ متنِ خام می‌بیند، نه بازگشت به برنامه.
  @Get('callback')
  @Redirect()
  async callback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
    @Req() req?: Request,
  ) {
    const web = webBase();

    // کاربر در صفحهٔ درگاه «انصراف» زده — خطا نیست، تصمیم است.
    if (error) {
      return { url: `${web}/panel?sso=cancelled` };
    }

    try {
      const { audience, identity, row } = await this.sso.complete({
        code: code ?? '',
        state: state ?? '',
      });

      const meta = {
        ip: req?.ip,
        userAgent: req?.headers?.['user-agent'] as string | undefined,
      };

      const result = await this.issueFor(audience, identity, targetCompany(), meta);
      const target = row.redirectTo ?? defaultLanding(audience);

      // ⚠️ توکن در پارامترِ نشانی می‌رود و صفحهٔ وب بی‌درنگ از نوار
      //    پاکش می‌کند.  این نقطهٔ ضعفِ شناخته‌شدهٔ این الگوست: نشانی
      //    در تاریخچهٔ مرورگر می‌ماند.  جایگزینِ بهترش کوکیِ HttpOnly
      //    است، که با معماریِ فعلیِ توکن در `localStorage` نمی‌خواند و
      //    تغییرش دامنهٔ جداگانه‌ای است.
      const params = new URLSearchParams({ sso: 'ok', ...result });
      return { url: `${web}${target}#${params.toString()}` };
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'ورود با درگاه دولت ناموفق بود';
      return {
        url: `${web}/panel?sso=error&reason=${encodeURIComponent(message)}`,
      };
    }
  }

  /**
   * صدورِ توکن بر پایهٔ مخاطب.
   *
   * ⚠️ سه مخاطب سه مسیرِ کاملاً جدا دارند و عمداً در یک تابع جمع
   *    نشده‌اند: کارمند از `AuthService` می‌گذرد (با MFA و قفل)، مشتری
   *    و شهروند از مسیرِ فروشگاه.
   */
  private async issueFor(
    audience: GovAudience,
    identity: Parameters<GovSsoService['resolveStaff']>[0],
    companyId: string | null,
    meta: { ip?: string; userAgent?: string },
  ): Promise<Record<string, string>> {
    if (audience === 'staff') {
      const user = await this.sso.resolveStaff(identity, companyId);
      const result = await this.auth.loginWithGovIdentity(user.id, meta);

      if ('mfaRequired' in result && result.mfaRequired) {
        // مرحلهٔ دوم هنوز مانده؛ رابط همان صفحهٔ کدِ همیشگی را می‌آورد.
        return { mfa: '1', challenge: result.challenge };
      }
      return {
        accessToken: (result as { accessToken: string }).accessToken,
        refreshToken: (result as { refreshToken: string }).refreshToken,
      };
    }

    if (!companyId) {
      throw new ServiceUnavailableException(
        'شرکت مقصد مشخص نیست — SHOP_COMPANY_ID را تنظیم کنید',
      );
    }

    const customer = await this.sso.resolveCustomer(identity, companyId);
    return { token: this.shop.issueTokenForCustomer(customer) };
  }
}

/**
 * نشانیِ وب.
 *
 * ⚠️ از پیکربندیِ سرور، نه از سربرگِ درخواست.  خواندنِ `Host` یعنی
 *    مهاجم می‌تواند مقصدِ بازگشت — و با آن توکن — را جای دیگری ببرد.
 */
function webBase(): string {
  return (
    process.env.SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    'http://localhost:3001'
  ).replace(/\/+$/, '');
}

/**
 * شرکتِ مقصد برای مسیرهای عمومی.
 *
 * ⚠️ در لحظهٔ بازگشت خوانده می‌شود، نه از سطرِ `state`.
 *
 *    پیش‌تر روی همان سطر ذخیره می‌شد و ستونِ `companyId` باعث شد
 *    نگهبانِ RLS در `integration` قرمز شود.  ولی مقدارش هرگز از
 *    کاربر نمی‌آمد — فقط از پیکربندیِ سرور — پس ذخیره‌اش یک نسخهٔ
 *    دومِ همان مقدار بود که می‌توانست کهنه شود.
 *
 *    خواندن از محیط هم امن است هم ساده‌تر: کاربر هیچ راهی برای
 *    عوض کردنش ندارد.
 */
function targetCompany(): string | null {
  return process.env.SHOP_COMPANY_ID?.trim() || null;
}

/**
 * ⚠️ صفحهٔ ورودِ کارکنان `/panel` است.
 *
 *    نسخهٔ اول `/login` نوشت — مسیری که وجود نداشت، پس ورودِ **موفق**
 *    کاربر را به ۴۰۴ می‌برد با توکنی که هیچ‌کس نمی‌خواندش.  با اجرای
 *    واقعیِ جریان دیده شد، نه با خواندنِ کد.
 *
 *    بعد به `/` تغییر کرد و درست بود — تا وقتی که ریشه صفحهٔ معرفیِ
 *    شرکت شد و ورود به `/panel` رفت.  همان دام، بارِ دوم.
 */
function defaultLanding(audience: GovAudience): string {
  if (audience === 'staff') return '/panel';
  return '/shop';
}
