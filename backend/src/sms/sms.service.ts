import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * ارسال پیامک — کاوه‌نگار یا sms.ir.
 *
 * ⚠️ اگر `SMS_API_KEY` تنظیم نباشد پیامک **شبیه‌سازی** می‌شود و کد به
 *    دستِ مشتری نمی‌رسد.
 *
 *    این عمدی است: نصبی که پیامک ندارد نباید حسابِ مشتریِ حضوری را به
 *    هرکسی بدهد.  ولی نتیجه‌اش این است که فروشِ آنلاین عملاً بسته
 *    می‌ماند تا کلید تنظیم شود.
 *
 * ⚠️ قرارداد sms.ir از **OpenAPI رسمیِ خودشان** گرفته شده
 *    (`https://api.sms.ir/swagger/v1/swagger.json`)، نه از حافظه:
 *
 *      POST /v1/send/bulk    { lineNumber:int, messageText, mobiles[] }
 *      POST /v1/send/verify  { mobile, templateId:int, parameters[] }
 *      سرآیند: X-API-KEY
 *      پاسخ:   { data, status, message }   ⟵ status = 1 یعنی موفق
 *
 *    با کلیدِ نامعتبر سنجیده شد: هر دو مسیر ۴۰۱ با `status: 10`
 *    می‌دهند.
 */
/**
 * ⚠️ شکلِ **واحد** برای همهٔ مسیرها — موفق، شکست، و شبیه‌سازی.
 *
 *    بدونِ آن، TypeScript اتحادی می‌ساخت که هر شاخه‌اش میدان‌های
 *    متفاوتی داشت، و فراخوان‌ها (`loyalty`) نمی‌توانستند `error` یا
 *    `simulated` را بخوانند.  یعنی هر ارائه‌دهندهٔ تازه، کدِ تماس‌گیرنده
 *    را می‌شکست.
 */
export type SmsResult = {
  sent: boolean;
  provider?: string;
  mode?: string;
  simulated?: boolean;
  to?: string;
  message?: string;
  hint?: string;
  error?: string;
  response?: unknown;
};

@Injectable()
export class SmsService {
  constructor(private readonly configService: ConfigService) {}

  private cfg(key: string): string {
    return (this.configService.get<string>(key) ?? '').trim();
  }

  async send(to: string, message: string): Promise<SmsResult> {
    const apiKey = this.cfg('SMS_API_KEY');
    const sender = this.cfg('SMS_SENDER') || '10008663';

    // ⚠️ پیش‌فرض کاوه‌نگار می‌ماند تا نصب‌های موجود با به‌روزرسانی
    //    ناگهان پیامک نفرستند.
    const provider = (this.cfg('SMS_PROVIDER') || 'kavenegar').toLowerCase();

    if (!to || !message) {
      return { sent: false, error: 'شماره گیرنده و متن پیام الزامی است' };
    }

    if (!apiKey) {
      console.log(`📱 [SMS شبیه‌سازی‌شده] به ${to}: ${message}`);

      return {
        sent: false,
        simulated: true,
        to,
        message,
        hint: 'برای ارسال واقعی، SMS_API_KEY را در .env تنظیم کنید',
      };
    }

    try {
      return provider === 'sms.ir' || provider === 'smsir'
        ? await this.sendSmsIr(to, message, apiKey, sender)
        : await this.sendKavenegar(to, message, apiKey, sender);
    } catch (error) {
      return {
        sent: false,
        error: `خطا در ارسال پیامک: ${String(error)}`,
      };
    }
  }

  private fetcher() {
    return globalThis as never as {
      fetch: (
        url: string,
        init?: unknown,
      ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
    };
  }

  private async sendKavenegar(
    to: string,
    message: string,
    apiKey: string,
    sender: string,
  ): Promise<SmsResult> {
    const params = [
      `receptor=${encodeURIComponent(to)}`,
      `sender=${encodeURIComponent(sender)}`,
      `message=${encodeURIComponent(message)}`,
    ].join('&');

    const response = await this.fetcher().fetch(
      `https://api.kavenegar.com/v1/${apiKey}/sms/send.json`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      },
    );

    const data = await response.json().catch(() => null);
    return { sent: response.ok, provider: 'kavenegar', response: data };
  }

  /**
   * sms.ir
   *
   * ⚠️ دو مسیر دارد و انتخابشان **معنایی** است، نه سلیقه‌ای:
   *
   *    `/v1/send/verify` قالبِ تأییدشده می‌فرستد.  بیشترِ حساب‌های
   *    sms.ir فقط از همین راه اجازهٔ ارسالِ کدِ یک‌بارمصرف دارند —
   *    متنِ آزاد رد می‌شود یا در صف می‌ماند.
   *
   *    `/v1/send/bulk` متنِ آزاد می‌فرستد و برای پیام‌های عمومی است.
   *
   *    پس اگر `SMSIR_TEMPLATE_ID` تنظیم باشد، کدِ داخلِ متن بیرون
   *    کشیده می‌شود و از راهِ قالب می‌رود.
   */
  private async sendSmsIr(
    to: string,
    message: string,
    apiKey: string,
    sender: string,
  ): Promise<SmsResult> {
    const templateId = Number(this.cfg('SMSIR_TEMPLATE_ID'));
    const paramName = this.cfg('SMSIR_TEMPLATE_PARAM') || 'CODE';

    // ⚠️ رقم‌های فارسی به لاتین.  شمارهٔ فارسی را درگاه نمی‌شناسد و
    //    خطایش «شمارهٔ نامعتبر» است — که به نظر اشکالِ داده می‌آید نه
    //    اشکالِ تبدیل.
    const mobile = to
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/\D/g, '');

    let url: string;
    let body: unknown;

    if (templateId > 0) {
      // کدِ عددیِ داخلِ متن — همان چیزی که قالب انتظار دارد.
      const code = (message.match(/\d{4,8}/) ?? [message])[0];

      url = 'https://api.sms.ir/v1/send/verify';
      body = {
        mobile,
        templateId,
        parameters: [{ name: paramName, value: String(code) }],
      };
    } else {
      // ⚠️ `lineNumber` در قرارداد **عدد** است، نه رشته.
      //    فرستادنِ رشته خطای اعتبارسنجی می‌دهد که پیامش دربارهٔ خطِ
      //    فرستنده است و آدم دنبالِ اشتباهی می‌گردد.
      url = 'https://api.sms.ir/v1/send/bulk';
      body = {
        lineNumber: Number(sender),
        messageText: message,
        mobiles: [mobile],
      };
    }

    const response = await this.fetcher().fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json().catch(() => null)) as {
      status?: number;
      message?: string;
    } | null;

    // ⚠️ **کدِ HTTP کافی نیست.**
    //
    //    sms.ir برای خطاهای کاربردی هم ۲۰۰ برمی‌گرداند و علت را در
    //    `status` می‌گذارد.  اگر فقط `response.ok` را می‌سنجیدیم،
    //    «اعتبار کافی نیست» یا «قالب تأیید نشده» موفق شمرده می‌شد و
    //    مشتری پشتِ صفحه منتظرِ کدی می‌ماند که هرگز نرفته.
    const ok = response.ok && data?.status === 1;

    return {
      sent: ok,
      provider: 'sms.ir',
      mode: templateId > 0 ? 'verify' : 'bulk',
      response: data,
      ...(ok ? {} : { error: data?.message ?? `HTTP ${response.status}` }),
    };
  }

  /**
   * ارسال گروهی
   */
  async sendBulk(recipients: Array<string>, message: string) {
    const results = [];

    for (const to of recipients) {
      results.push(await this.send(to, message));
    }

    return {
      total: recipients.length,
      sent: results.filter((r: any) => r.sent).length,
      results,
    };
  }
}
