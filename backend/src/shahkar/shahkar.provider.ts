import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ShahkarResult } from './shahkar.types';

/**
 * آداپتورِ شاهکار — **اراده‌پذیر**، چون ارائه‌دهنده هنوز انتخاب نشده.
 *
 * ⚠️ شاهکار API عمومی ندارد.
 *
 *    یا سازمان مستقیم از رگولاتوری مجوز دارد، یا از واسطی مثل
 *    فینوتک، جیبیت یا زیبال می‌گیرد.  شکلِ درخواست و پاسخِ هر کدام
 *    فرق دارد و هیچ‌کدام را نمی‌شود از پیش حدس زد.
 *
 *    پس به‌جای چسبیدن به یکی، شکلِ تماس از پیکربندی خوانده می‌شود:
 *    نشانی، نامِ فیلدها، و مسیرِ نتیجه در پاسخ.  عوض کردنِ ارائه‌دهنده
 *    یعنی عوض کردنِ چند متغیرِ `.env`، نه نوشتنِ کدِ تازه.
 *
 * ⚠️ بدونِ پیکربندی، **شبیه‌سازی** می‌کند و صریح می‌گوید.
 *
 *    همان الگوی `sms.service` و `zarinpal.gateway`: سامانه بی‌کلید هم
 *    بالا می‌آید، ولی `simulated: true` برمی‌گردد تا هیچ‌جا احرازِ
 *    ساختگی با واقعی اشتباه نشود.
 */
@Injectable()
export class ShahkarProvider {
  private readonly logger = new Logger(ShahkarProvider.name);

  constructor(private readonly config: ConfigService) {}

  private cfg(key: string, fallback = ''): string {
    return (this.config.get<string>(key) ?? '').trim() || fallback;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg('SHAHKAR_URL') && this.cfg('SHAHKAR_TOKEN'));
  }

  /**
   * استعلام.
   *
   * ⚠️ ورودی‌ها **یکدست‌شده** انتظار می‌روند (`normalizeMobile` و
   *    `normalizeNationalCode`).  این تابع اعتبارسنجی نمی‌کند؛ کارِ
   *    سرویس است که پیش از رسیدن به اینجا کدِ بدریخت را رد کند.
   */
  async verify(nationalCode: string, mobile: string): Promise<ShahkarResult> {
    if (!this.isConfigured()) {
      return {
        outcome: 'UNKNOWN',
        simulated: true,
        message:
          'سامانه شاهکار پیکربندی نشده است؛ SHAHKAR_URL و SHAHKAR_TOKEN را در .env بگذارید',
      };
    }

    const url = this.cfg('SHAHKAR_URL');
    const scheme = this.cfg('SHAHKAR_AUTH_SCHEME', 'Bearer');
    const nidField = this.cfg('SHAHKAR_FIELD_NID', 'nationalCode');
    const mobileField = this.cfg('SHAHKAR_FIELD_MOBILE', 'mobile');

    // ⚠️ مهلت **الزامی** است.
    //
    //    سرویس‌های دولتی گاهی به‌جای خطا، جواب نمی‌دهند.  بدونِ مهلت،
    //    درخواستِ کاربر تا انقضای TCP معلق می‌ماند و در ثبت‌نام یعنی
    //    صفحه‌ای که هیچ‌وقت بارگذاری نمی‌شود.
    const timeoutMs = Number(this.cfg('SHAHKAR_TIMEOUT_MS', '8000')) || 8000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: this.cfg('SHAHKAR_METHOD', 'POST'),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `${scheme} ${this.cfg('SHAHKAR_TOKEN')}`.trim(),
        },
        body: JSON.stringify({
          [nidField]: nationalCode,
          [mobileField]: mobile,
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      let body: unknown = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }

      if (!response.ok) {
        // ⚠️ خطای HTTP یعنی «نمی‌دانیم»، نه «تطبیق ندارد».
        this.logger.warn(`شاهکار: پاسخ ${response.status} — ${text.slice(0, 200)}`);
        return {
          outcome: 'UNKNOWN',
          message: 'استعلام شاهکار انجام نشد؛ لطفاً بعداً دوباره تلاش کنید',
          raw: text.slice(0, 500),
        };
      }

      const matched = readPath(body, this.cfg('SHAHKAR_PATH_MATCHED', 'result.matched'));

      // ⚠️ نبودِ فیلد با `false` یکی نیست.
      //
      //    اگر مسیرِ پیکربندی‌شده اشتباه باشد، `undefined` برمی‌گردد.
      //    شمردنش به‌عنوان «تطبیق ندارد» یعنی یک غلطِ تایپی در `.env`
      //    همهٔ کاربرها را رد می‌کند و هیچ‌کس نمی‌فهمد چرا.
      if (matched === undefined || matched === null) {
        this.logger.warn(
          `شاهکار: مسیرِ «${this.cfg('SHAHKAR_PATH_MATCHED', 'result.matched')}» در پاسخ نبود`,
        );
        return {
          outcome: 'UNKNOWN',
          message: 'پاسخ سامانه شاهکار قابل خواندن نبود',
          raw: text.slice(0, 500),
        };
      }

      const reference = asText(
        readPath(body, this.cfg('SHAHKAR_PATH_REFERENCE', 'result.trackId')),
      );

      return isTruthy(matched)
        ? {
            outcome: 'MATCHED',
            message: 'شماره موبایل با کد ملی تطبیق دارد',
            reference,
          }
        : {
            outcome: 'NOT_MATCHED',
            message: 'شماره موبایل به نام این کد ملی ثبت نشده است',
            reference,
          };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      this.logger.warn(
        `شاهکار: ${aborted ? `مهلت ${timeoutMs} میلی‌ثانیه تمام شد` : String(error)}`,
      );
      return {
        outcome: 'UNKNOWN',
        message: aborted
          ? 'استعلام شاهکار به موقع پاسخ نداد'
          : 'ارتباط با سامانه شاهکار برقرار نشد',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** خواندنِ `a.b.c` از پاسخ. */
function readPath(source: unknown, path: string): unknown {
  if (!path) return undefined;
  let node: unknown = source;
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/**
 * ⚠️ ارائه‌دهنده‌ها «بله» را جور دیگری می‌گویند.
 *
 *    `true`، `1`، `"200"`، `"MATCHED"`، `"true"` — همه دیده شده‌اند.
 *    پس چند شکل پذیرفته می‌شود، ولی **فهرستِ سفید**: هر مقدارِ
 *    ناشناخته «نه» است.  عکسش یعنی رشتهٔ نامفهوم به تأیید ترجمه شود.
 */
function isTruthy(value: unknown): boolean {
  if (value === true) return true;
  if (value === 1) return true;
  if (typeof value === 'string') {
    return ['true', '1', '200', 'matched', 'ok', 'yes'].includes(value.trim().toLowerCase());
  }
  return false;
}

function asText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text || undefined;
}
