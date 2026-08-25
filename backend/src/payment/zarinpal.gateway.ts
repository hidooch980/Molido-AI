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

  private base(): string {
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
        data?: { code?: number; ref_id?: number | string };
        errors?: { message?: string };
      } | null;

      const code = body?.data?.code;

      // ⚠️ ۱۰۰ یعنی تأیید شد، ۱۰۱ یعنی **قبلاً** تأیید شده بود.
      //
      //    ۱۰۱ خطا نیست: اگر مشتری صفحهٔ بازگشت را دوباره بارگذاری
      //    کند، همین می‌آید.  خطا شمردنش یعنی سفارشِ پرداخت‌شده
      //    ناموفق علامت بخورد و پول بماند بی‌آنکه کالا برود.
      if (code === 100 || code === 101) {
        return {
          ok: true,
          trackingCode: String(body?.data?.ref_id ?? ''),
          // به ریال برمی‌گردانیم تا فراخوان با مبلغِ سفارش بسنجدش.
          paidAmount: toman * 10,
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
