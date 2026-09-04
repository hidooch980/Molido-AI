import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { normalizePhone } from './phone';

/**
 * شماره‌گیری از راه مرکز تلفن SIP.
 *
 * تا امروز کانال `VOIP` فقط یک برچسب بود: اپراتور خودش شماره می‌گرفت و
 * بعد در فرم می‌نوشت که تماس ویپ بوده.  این سرویس همان دکمه را واقعی
 * می‌کند.
 *
 * ⚠️ **شماره از پایگاه داده می‌آید، نه از درخواست.**
 *
 *    نقطهٔ پایانی، `supplierId` می‌گیرد نه شمارهٔ تلفن.  اگر شماره را
 *    از بدنه می‌گرفت، هر کاربرِ واردشده می‌توانست سامانه را به یک
 *    شماره‌گیرِ انبوه بدل کند — و تماس‌ها از خطِ خودِ فروشگاه بیرون
 *    می‌رفت.  محدود کردن به تأمین‌کنندگانِ ثبت‌شده این را از ریشه
 *    می‌بندد.
 *
 * پیاده‌سازی برای **Asterisk ARI** است، چون مرکزهای رایج در ایران
 * (ایزابل و FreePBX) هر دو استریسک‌اند.  اگر روزی مرکز عوض شد، فقط
 * `originate` باید بازنویسی شود؛ بقیهٔ سامانه این سرویس را می‌بیند نه
 * استریسک را.
 */
@Injectable()
export class TelephonyService {
  private readonly logger = new Logger('Telephony');

  constructor(private readonly config: ConfigService) {}

  /** آیا مرکز تلفن پیکربندی شده؟ */
  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('ARI_URL') &&
        this.config.get<string>('ARI_USER') &&
        this.config.get<string>('ARI_PASSWORD'),
    );
  }

  /**
   * وضعیت پیکربندی — برای رابط، تا دکمه‌ای که کار نمی‌کند نشان ندهد.
   *
   * رمز هرگز برنمی‌گردد؛ فقط اینکه هست یا نه.
   */
  status() {
    return {
      configured: this.isConfigured(),
      endpoint: this.config.get<string>('ARI_ENDPOINT') ?? null,
      callerId: this.config.get<string>('ARI_CALLER_ID') ?? null,
    };
  }

  /**
   * شماره‌گیری.
   *
   * استریسک اول به **داخلیِ اپراتور** زنگ می‌زند و وقتی او برداشت،
   * شمارهٔ بنکدار را می‌گیرد.  ترتیبش عمدی است: اگر اول به بنکدار زنگ
   * بزند و اپراتور پشت خط نباشد، بنکدار گوشی را برمی‌دارد و کسی آن‌طرف
   * نیست — که هم بی‌ادبی است هم اعتبار فروشگاه را خرج می‌کند.
   */
  async originate(params: {
    phone: string;
    operatorExtension: string;
    supplierName: string;
    inquiryNo?: string;
  }): Promise<{ channelId: string }> {
    if (!this.isConfigured()) {
      throw new BadRequestException(
        'مرکز تلفن پیکربندی نشده است (ARI_URL و ARI_USER و ARI_PASSWORD)',
      );
    }

    const base = String(this.config.get<string>('ARI_URL')).replace(/\/+$/, '');
    const user = this.config.get<string>('ARI_USER') as string;
    const password = this.config.get<string>('ARI_PASSWORD') as string;
    const context = this.config.get<string>('ARI_CONTEXT') ?? 'from-internal';
    const callerId = this.config.get<string>('ARI_CALLER_ID') ?? 'Molido';

    const digits = normalizePhone(params.phone);
    if (!digits) {
      throw new BadRequestException('شمارهٔ تأمین‌کننده معتبر نیست');
    }

    const body = {
      // اول داخلیِ اپراتور
      endpoint: `Local/${params.operatorExtension}@${context}`,
      // بعد شمارهٔ بنکدار
      extension: digits,
      context,
      priority: 1,
      callerId,
      timeout: 45,
      variables: {
        // در گزارش تماسِ مرکز دیده می‌شود؛ بدون این، ردیف‌های CDR
        // بی‌نام‌اند و وصل کردنشان به استعلام ناممکن.
        MOLIDO_SUPPLIER: params.supplierName,
        ...(params.inquiryNo ? { MOLIDO_INQUIRY: params.inquiryNo } : {}),
      },
    };

    const auth = Buffer.from(`${user}:${password}`).toString('base64');

    // مهلت صریح: مرکزی که جواب نمی‌دهد نباید درخواست وب را معلق نگه
    // دارد.  اپراتور پشت خط منتظر است.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`${base}/ari/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        // متن خام استریسک به کاربر نمی‌رود: هم انگلیسی است هم ساختار
        // داخلی مرکز را لو می‌دهد.  در لاگ می‌ماند.
        this.logger.error(`ARI ${response.status}: ${text.slice(0, 300)}`);
        throw new BadRequestException(
          response.status === 401
            ? 'نام کاربری یا رمز مرکز تلفن درست نیست'
            : `مرکز تلفن تماس را نپذیرفت (کد ${response.status})`,
        );
      }

      const channel = (await response.json()) as { id?: string };
      return { channelId: channel.id ?? '' };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`ARI unreachable: ${message}`);
      throw new BadRequestException('مرکز تلفن در دسترس نیست');
    } finally {
      clearTimeout(timer);
    }
  }
}
