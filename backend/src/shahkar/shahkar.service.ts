import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../database/database.service';
import {
  isValidMobile,
  isValidNationalCode,
  normalizeMobile,
  normalizeNationalCode,
} from './national-code';
import { ShahkarProvider } from './shahkar.provider';
import type { ShahkarResult } from './shahkar.types';

/**
 * احرازِ تطبیقِ موبایل و کد ملی (سامانه شاهکار).
 *
 * ⚠️ **سیاستِ خطا صریح است، نه ضمنی.**
 *
 *    وقتی سرویس در دسترس نیست، دو انتخاب هست و هر دو بهایی دارند:
 *
 *      • بستن (`SHAHKAR_ON_ERROR=block`): هیچ‌کس ثبت‌نام نمی‌کند تا
 *        سرویس برگردد.  امن، ولی یک قطعیِ دولتی کلِ کار را می‌خواباند.
 *      • گذشتن (`allow`): ثبت‌نام ادامه می‌یابد و پرونده «تأیید نشده»
 *        می‌ماند تا بعداً بررسی شود.
 *
 *    پیش‌فرض **بستن** است: این احرازِ هویت است، و پیش‌فرضِ ناامن
 *    چیزی است که کسی هرگز عوض نمی‌کند.  هر که بخواهد بازش کند، باید
 *    آگاهانه بنویسدش.
 *
 * ⚠️ و «تطبیق ندارد» **همیشه** رد است، در هر دو حالت.
 *
 *    آن پاسخِ قطعیِ سامانه است، نه اختلال.  خلط کردنِ این دو یعنی
 *    سیاستِ `allow` احرازِ هویت را به‌کلی بی‌اثر می‌کند.
 */
@Injectable()
export class ShahkarService {
  private readonly logger = new Logger(ShahkarService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly provider: ShahkarProvider,
    private readonly config: ConfigService,
  ) {}

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  /** آیا اصلاً باید اعمال شود؟  بدونِ پیکربندی، هیچ مسیری بسته نمی‌شود. */
  isEnforced(): boolean {
    return this.isConfigured() && this.config.get<string>('SHAHKAR_ENFORCE') !== 'false';
  }

  private onErrorBlocks(): boolean {
    return (this.config.get<string>('SHAHKAR_ON_ERROR') ?? 'block').trim() !== 'allow';
  }

  /**
   * استعلام با حافظه.
   *
   * `companyId` از زمینهٔ چندمستأجری می‌آید؛ فراخوان باید داخلِ
   * `runInTenant` باشد — همان قاعدهٔ همهٔ سرویس‌های دیگر.
   */
  async verify(
    companyId: string,
    nationalCodeInput: unknown,
    mobileInput: unknown,
    options: { refresh?: boolean } = {},
  ): Promise<ShahkarResult> {
    const nationalCode = normalizeNationalCode(nationalCodeInput);
    const mobile = normalizeMobile(mobileInput);

    // ⚠️ اعتبارسنجیِ محلی **پیش از** تماس.  کدِ بدریخت قطعاً رد
    //    می‌شود؛ فرستادنش فقط سهمیه می‌سوزاند.
    if (!isValidNationalCode(nationalCode)) {
      throw new BadRequestException('کد ملی معتبر نیست');
    }
    if (!isValidMobile(mobile)) {
      throw new BadRequestException('شماره موبایل معتبر نیست');
    }

    if (!options.refresh) {
      const cached = await this.db.query<{ outcome: string; reference: string | null }>(
        `SELECT outcome, reference FROM "ShahkarVerification"
          WHERE "companyId" = $1 AND "nationalCode" = $2 AND mobile = $3`,
        [companyId, nationalCode, mobile],
      );
      if (cached.length) {
        const hit = cached[0];
        return {
          outcome: hit.outcome === 'MATCHED' ? 'MATCHED' : 'NOT_MATCHED',
          reference: hit.reference ?? undefined,
          message:
            hit.outcome === 'MATCHED'
              ? 'شماره موبایل با کد ملی تطبیق دارد'
              : 'شماره موبایل به نام این کد ملی ثبت نشده است',
        };
      }
    }

    const result = await this.provider.verify(nationalCode, mobile);

    // فقط پاسخِ قطعی ماندگار می‌شود — دلیلش در مهاجرت ۰۶۰.
    if (result.outcome === 'MATCHED' || result.outcome === 'NOT_MATCHED') {
      await this.db
        .execute(
          `INSERT INTO "ShahkarVerification"
             (id, "companyId", "nationalCode", mobile, outcome, reference, provider)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT ("companyId", "nationalCode", mobile) DO UPDATE
             SET outcome = EXCLUDED.outcome,
                 reference = EXCLUDED.reference,
                 "checkedAt" = now(),
                 "updatedAt" = now()`,
          [
            randomUUID(),
            companyId,
            nationalCode,
            mobile,
            result.outcome,
            result.reference ?? null,
            this.config.get<string>('SHAHKAR_PROVIDER') ?? 'generic',
          ],
        )
        // ⚠️ شکستِ ذخیره نباید استعلام را بشکند: نتیجه در دست است و
        //    کاربر منتظر جواب است.  حافظه بهینه‌سازی است، نه پاسخ.
        .catch((error: unknown) => {
          this.logger.warn(`ذخیرهٔ نتیجهٔ شاهکار شکست: ${String(error)}`);
        });
    }

    return result;
  }

  /**
   * دروازه‌بانِ مسیرها.
   *
   * اگر تطبیق نداشت یا (بر پایهٔ سیاست) نامعلوم بود، استثنا پرتاب
   * می‌کند.  اگر شاهکار پیکربندی نشده باشد، **هیچ کاری نمی‌کند** —
   * وگرنه نصبِ بدونِ اعتبارنامه اصلاً ثبت‌نام نمی‌پذیرفت.
   */
  async enforce(
    companyId: string,
    nationalCode: unknown,
    mobile: unknown,
  ): Promise<ShahkarResult | null> {
    if (!this.isEnforced()) return null;

    const result = await this.verify(companyId, nationalCode, mobile);

    if (result.outcome === 'NOT_MATCHED') {
      throw new BadRequestException(
        'شماره موبایل به نام این کد ملی ثبت نشده است (سامانه شاهکار)',
      );
    }

    if (result.outcome === 'UNKNOWN' && this.onErrorBlocks()) {
      throw new BadRequestException(
        'استعلام شاهکار انجام نشد؛ لطفاً چند دقیقه بعد دوباره تلاش کنید',
      );
    }

    return result;
  }
}
