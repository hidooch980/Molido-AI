import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  PaymentGateway,
  PaymentRequest,
  PaymentStartResult,
  PaymentVerifyResult,
} from './payment.types';

/**
 * زرین‌پال — نخستین پیاده‌سازیِ درگاه.
 *
 * ⚠️ زرین‌پال **تومان** می‌گیرد، ما **ریال** نگه می‌داریم.
 *
 *    تبدیل اینجا انجام می‌شود و هیچ‌جای دیگر.  اگر فراخوان مسئولش
 *    بود، روزی یکی فراموش می‌کرد و مشتری ده برابر پرداخت می‌کرد —
 *    خطایی که تا شکایتِ مشتری دیده نمی‌شود.
 *
 * ⚠️ بدونِ `ZARINPAL_MERCHANT_ID` حالتِ شبیه‌سازی است.
 *
 *    همان الگوی `sms.service.ts`: سامانه بی‌کلید هم بالا می‌آید و
 *    توسعه‌دهنده می‌تواند کلِ مسیر را بیازماید.  ولی `simulated: true`
 *    برمی‌گردد تا هیچ‌جا پرداختِ ساختگی با واقعی اشتباه نشود.
 */
@Injectable()
export class ZarinpalGateway implements PaymentGateway {
  readonly name = 'zarinpal';

  constructor(private readonly config: ConfigService) {}

  private merchantId(): string {
    return (this.config.get<string>('ZARINPAL_MERCHANT_ID') ?? '').trim();
  }

  /** درگاهِ آزمایشیِ زرین‌پال (sandbox) برای محیطِ توسعه. */
  private sandbox(): boolean {
    return this.config.get<string>('ZARINPAL_SANDBOX') === 'true';
  }

  /**
   * ⚠️ `ZARINPAL_BASE_URL` برای **آزمون** است، نه برای تولید.
   *
   *    بدونش هیچ راهی برای آزمودنِ مسیرِ پرداخت از سرِتاسر نبود:
   *    درگاهِ واقعی اعتبارنامهٔ پذیرنده می‌خواهد و sandbox هم همیشه
   *    در دسترس نیست.  نتیجه‌اش این می‌شد که کدِ پول هرگز اجرا
   *    نشود تا روزِ اولِ تولید.
   *
   *    در تولید تنظیم نمی‌شود و مسیرِ همیشگی می‌رود؛ اگر کسی اشتباهی
   *    تنظیمش کند، نشانی در لاگِ درخواست دیده می‌شود.
   */
  private base(): string {
    const override = (this.config.get<string>('ZARINPAL_BASE_URL') ?? '').trim();
    if (override) return override.replace(/\/+$/, '');
    return this.sandbox()
      ? 'https://sandbox.zarinpal.com'
      : 'https://payment.zarinpal.com';
  }

  isConfigured(): boolean {
    return this.merchantId().length > 0;
  }

  async start(request: PaymentRequest): Promise<PaymentStartResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        simulated: true,
        error:
          'درگاه پرداخت پیکربندی نشده است؛ ZARINPAL_MERCHANT_ID را در .env بگذارید',
      };
    }

    // ریال ← تومان.  زرین‌پال عددِ صحیح می‌خواهد.
    const toman = Math.round(request.amount / 10);

    try {
      const response = await fetch(
        `${this.base()}/pg/v4/payment/request.json`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchant_id: this.merchantId(),
            amount: toman,
            callback_url: request.callbackUrl,
            description: request.description ?? `سفارش ${request.orderNo}`,
            metadata: {
              ...(request.mobile ? { mobile: request.mobile } : {}),
              ...(request.email ? { email: request.email } : {}),
            },
          }),
          // ⚠️ مهلتِ صریح: درگاهی که جواب نمی‌دهد نباید درخواستِ
          //    تسویه را معلق نگه دارد — مشتری پشتِ صفحه منتظر است.
          signal: AbortSignal.timeout(15_000),
        },
      );

      const body = (await response.json().catch(() => null)) as {
        data?: { code?: number; authority?: string };
        errors?: { message?: string };
      } | null;

      const authority = body?.data?.authority;
      if (body?.data?.code === 100 && authority) {
        return {
          ok: true,
          reference: authority,
          redirectUrl: `${this.base()}/pg/StartPay/${authority}`,
        };
      }

      return {
        ok: false,
        error: body?.errors?.message ?? 'درگاه پرداخت پاسخ نامعتبر داد',
      };
    } catch (error) {
      return { ok: false, error: `خطا در اتصال به درگاه: ${String(error)}` };
    }
  }

  async verify(
    reference: string,
    amount: number,
  ): Promise<PaymentVerifyResult> {
    if (!this.isConfigured()) {
      return { ok: false, simulated: true, error: 'درگاه پیکربندی نشده است' };
    }

    const toman = Math.round(amount / 10);

    try {
      const response = await fetch(`${this.base()}/pg/v4/payment/verify.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: this.merchantId(),
          amount: toman,
          authority: reference,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const body = (await response.json().catch(() => null)) as {
        // ⚠️ `amount` هم خوانده می‌شود — مبلغی که **درگاه** می‌گوید
        //    واقعاً پرداخت شده، به تومان.
        data?: { code?: number; ref_id?: number | string; amount?: number };
        errors?: { message?: string };
      } | null;

      const code = body?.data?.code;

      // ⚠️ ۱۰۰ یعنی تأیید شد، ۱۰۱ یعنی **قبلاً** تأیید شده بود.
      //
      //    ۱۰۱ خطا نیست: اگر مشتری صفحهٔ بازگشت را دوباره بارگذاری
      //    کند، همین می‌آید.  خطا شمردنش یعنی سفارشِ پرداخت‌شده
      //    ناموفق علامت بخورد و پول بماند بی‌آنکه کالا برود.
      if (code === 100 || code === 101) {
        // ⚠️ مبلغ از **پاسخ** خوانده می‌شود، نه از درخواست.
        //
        //    نسخهٔ قبلی `toman * 10` برمی‌گرداند — یعنی همان عددی که
        //    خودمان فرستاده بودیم.  فراخوان آن را با مبلغِ سفارش
        //    می‌سنجید و **همیشه** برابر بود: نگهبان عدد را با خودش
        //    مقایسه می‌کرد.
        //
        //    آزموده شد: سفارشِ ۵۸ میلیون ریالی با پرداختِ ۱۰۰۰ ریال
        //    `PAID` شد.  خودِ `payment.types.ts` دقیقاً دربارهٔ همین
        //    حمله هشدار داده بود؛ پیاده‌سازی نگهبانِ خودش را خنثی
        //    کرده بود.
        const reported = body?.data?.amount;
        return {
          ok: true,
          trackingCode: String(body?.data?.ref_id ?? ''),
          // ⚠️ اگر درگاه مبلغ نداد، `undefined` می‌ماند — نه مبلغِ
          //    درخواستی.  تصمیم دربارهٔ مبلغِ نامعلوم کارِ فراخوان
          //    است، و باید سخت‌گیرانه باشد.
          paidAmount: typeof reported === 'number' ? reported * 10 : undefined,
        };
      }

      return {
        ok: false,
        error: body?.errors?.message ?? `تأیید پرداخت ناموفق بود (کد ${code})`,
      };
    } catch (error) {
      return { ok: false, error: `خطا در تأیید پرداخت: ${String(error)}` };
    }
  }
}
