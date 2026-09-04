import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../database/database.service';
import { ZarinpalGateway } from '../payment/zarinpal.gateway';
import { SubscriptionService } from '../subscription/subscription.service';

/**
 * تمدیدِ اشتراک از داخلِ نرم‌افزار.
 *
 * ---------- چرا ----------
 *
 * ⚠️ تا امروز تمدید دستی بود: تماس، کارت‌به‌کارت، و `UPDATE` در
 *    پایگاه‌داده.  یعنی در شبِ انقضا کسی نبود که کار را انجام دهد و
 *    مشتری صبح با سرویسِ قطع بیدار می‌شد.
 *
 * ---------- سه تله‌ای که این‌جا بسته شده ----------
 *
 * ⚠️ **مبلغ از سرور**، نه از درخواست.  اگر مشتری مبلغ را بفرستد،
 *    می‌تواند اشتراکِ سالانه را به هزار ریال بخرد.
 *
 * ⚠️ **تأییدِ دوباره** بسته است.  رفرشِ صفحهٔ بازگشت از درگاه نباید
 *    دو بار تمدید کند.  نگهبانش دو لایه دارد: نمایهٔ یکتای
 *    `(gateway, reference)` و بررسیِ `status` پیش از تمدید.
 *
 * ⚠️ **تمدیدِ پیوسته**، نه از امروز.  مشتری‌ای که یک ماه پیش از انقضا
 *    پول می‌دهد نباید آن یک ماه را از دست بدهد.
 *
 *    این عمداً با پنلِ فروشنده فرق دارد: آن‌جا تمدید از امروز است،
 *    چون مشتریِ شش‌ماه‌قطع، شش ماهِ گذشته را نمی‌خرد.  این‌جا مشتری
 *    خودش پیش از انقضا پرداخت می‌کند.
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly gateway: ZarinpalGateway,
    private readonly subscription: SubscriptionService,
    private readonly config: ConfigService,
  ) {}

  /** ماه‌های قابلِ خرید — همان‌هایی که پنلِ فروشنده هم می‌دهد. */
  private static readonly TERMS = [1, 3, 6, 12];

  /**
   * نسخه‌های **قابلِ خریدِ آنلاین**.
   *
   * ⚠️ نسخه‌ای که `priceRial` ندارد کنار گذاشته می‌شود، نه با قیمتِ صفر
   *    نشان داده.  «رایگان» و «تماس بگیرید» دو چیزند، و اولی را کسی
   *    می‌خرد.
   */
  async catalogue() {
    const rows = await this.db.query<{
      plan: string;
      title: string;
      note: string | null;
      priceRial: string | null;
    }>(
      `SELECT plan, title, note, "priceRial"::text AS "priceRial"
         FROM "PlanDefault"
        WHERE "priceRial" IS NOT NULL
        ORDER BY "priceRial"`,
    );

    return rows.map((row) => ({
      plan: row.plan,
      title: row.title,
      note: row.note,
      monthlyRial: Number(row.priceRial),
      terms: BillingService.TERMS.map((months) => ({
        months,
        amountRial: Number(row.priceRial) * months,
      })),
    }));
  }

  /** قیمتِ یک ترکیب، از پایگاه‌داده — هرگز از ورودیِ کاربر. */
  private async priceOf(plan: string, months: number): Promise<number> {
    if (!BillingService.TERMS.includes(months)) {
      throw new BadRequestException('مدتِ اشتراک معتبر نیست');
    }

    const rows = await this.db.query<{ priceRial: string | null }>(
      'SELECT "priceRial"::text AS "priceRial" FROM "PlanDefault" WHERE plan = $1',
      [plan],
    );

    const monthly = rows[0]?.priceRial ? Number(rows[0].priceRial) : null;
    if (!monthly) {
      throw new BadRequestException(
        'این نسخه آنلاین فروخته نمی‌شود؛ با فروشنده تماس بگیرید',
      );
    }

    return monthly * months;
  }

  /** صورت‌حساب‌های شرکت — تازه‌ترین اول. */
  async invoices(companyId: string) {
    return this.db.query(
      `SELECT id, plan, months, "amountRial"::text AS "amountRial", status,
              gateway, "trackingCode", "paidAt", "createdAt"
         FROM "SubscriptionInvoice"
        WHERE "companyId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 50`,
      [companyId],
    );
  }

  /**
   * صورت‌حساب می‌سازد و کاربر را به درگاه می‌فرستد.
   *
   * ⚠️ صورت‌حساب **پیش از** رفتن به درگاه ذخیره می‌شود.
   *
   *    اگر بعد ذخیره می‌شد، پرداختی که کاربر انجام داده ولی مرورگرش
   *    بسته شده هیچ ردی نداشت — پول رفته و ما نمی‌دانیم بابتِ چه.
   */
  async start(
    companyId: string,
    body: { plan?: string; months?: number },
    origin: string,
  ) {
    const plan = String(body?.plan ?? '');
    const months = Number(body?.months ?? 0);

    const amountRial = await this.priceOf(plan, months);
    const id = randomUUID();

    await this.db.query(
      `INSERT INTO "SubscriptionInvoice"
         (id, "companyId", plan, months, "amountRial", status, gateway)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)`,
      [id, companyId, plan, months, amountRial, this.gateway.name],
    );

    // ⚠️ نشانیِ بازگشت از پیکربندی می‌آید، با عقب‌گرد به `origin`ِ
    //    درخواست.  زرین‌پال کاربر را دقیقاً به همین می‌فرستد؛ اگر
    //    اشتباه باشد، پرداخت انجام می‌شود و تأیید هرگز.
    const base = (
      this.config.get<string>('PUBLIC_WEB_URL') ?? origin
    ).replace(/\/+$/, '');

    const start = await this.gateway.start({
      amount: amountRial,
      orderNo: id.slice(0, 8),
      callbackUrl: `${base}/settings/billing/callback?invoice=${id}`,
      description: `تمدید اشتراک مولیدو — ${plan} / ${months} ماه`,
    });

    if (!start.ok || !start.reference || !start.redirectUrl) {
      await this.db.query(
        `UPDATE "SubscriptionInvoice"
            SET status = 'FAILED', note = $2, "updatedAt" = now()
          WHERE id = $1`,
        [id, start.error ?? 'درگاه پاسخ نداد'],
      );
      throw new BadRequestException(start.error ?? 'اتصال به درگاه ممکن نشد');
    }

    await this.db.query(
      `UPDATE "SubscriptionInvoice"
          SET reference = $2, "updatedAt" = now()
        WHERE id = $1`,
      [id, start.reference],
    );

    return { invoiceId: id, amountRial, redirectUrl: start.redirectUrl };
  }

  /**
   * بازگشت از درگاه: تأیید و تمدید.
   *
   * ⚠️ `companyId` از **توکن** می‌آید و در شرطِ پرس‌وجو هست.
   *
   *    بدونش، شرکتِ الف می‌توانست شناسهٔ صورت‌حسابِ شرکتِ ب را حدس
   *    بزند و تمدیدش را برای خودش تأیید کند — یا بدتر، اشتراکِ او را
   *    مصرف کند.
   */
  async verify(companyId: string, invoiceId: string) {
    const rows = await this.db.query<{
      id: string;
      plan: string;
      months: number;
      amountRial: string;
      status: string;
      reference: string | null;
      trackingCode: string | null;
    }>(
      `SELECT id, plan, months, "amountRial"::text AS "amountRial",
              status, reference, "trackingCode"
         FROM "SubscriptionInvoice"
        WHERE id = $1 AND "companyId" = $2`,
      [invoiceId, companyId],
    );

    const invoice = rows[0];
    if (!invoice) throw new NotFoundException('صورت‌حساب پیدا نشد');

    // ⚠️ صورت‌حسابِ پرداخت‌شده **دوباره تمدید نمی‌کند**.
    //
    //    رفرشِ صفحهٔ بازگشت یک درخواستِ تازه است و بدونِ این شرط، هر
    //    رفرش یک دورهٔ اشتراکِ رایگان می‌داد.  پاسخ همان پاسخِ موفقِ
    //    قبلی است تا رابط چیزی را خطا نشان ندهد.
    if (invoice.status === 'PAID') {
      return {
        ok: true,
        alreadyVerified: true,
        trackingCode: invoice.trackingCode,
      };
    }

    if (!invoice.reference) {
      throw new BadRequestException('این صورت‌حساب به درگاه نرفته است');
    }

    const amount = Number(invoice.amountRial);
    const result = await this.gateway.verify(invoice.reference, amount);

    if (!result.ok) {
      await this.db.query(
        `UPDATE "SubscriptionInvoice"
            SET status = 'FAILED', note = $2, "updatedAt" = now()
          WHERE id = $1`,
        [invoice.id, result.error ?? 'تأیید ناموفق'],
      );
      return { ok: false, error: result.error ?? 'پرداخت تأیید نشد' };
    }

    // ⚠️ تطبیقِ مبلغ — همان دلیلی که `PaymentGateway.verify` مبلغ را
    //    برمی‌گرداند.  بدونش، پرداختِ هزار ریالی یک اشتراکِ سالانه را
    //    تأیید می‌کرد.
    if (
      typeof result.paidAmount === 'number' &&
      result.paidAmount > 0 &&
      Math.abs(result.paidAmount - amount) > 10
    ) {
      await this.db.query(
        `UPDATE "SubscriptionInvoice"
            SET status = 'FAILED', note = $2, "updatedAt" = now()
          WHERE id = $1`,
        [invoice.id, `مبلغِ پرداختی ${result.paidAmount} با ${amount} نمی‌خواند`],
      );
      return { ok: false, error: 'مبلغِ پرداختی با صورت‌حساب نمی‌خواند' };
    }

    await this.db.query(
      `UPDATE "SubscriptionInvoice"
          SET status = 'PAID', "trackingCode" = $2, "paidAt" = now(),
              "updatedAt" = now()
        WHERE id = $1`,
      [invoice.id, result.trackingCode ?? null],
    );

    const endsOn = await this.extend(companyId, invoice.plan, invoice.months);

    return {
      ok: true,
      trackingCode: result.trackingCode ?? null,
      plan: invoice.plan,
      endsOn,
    };
  }

  /**
   * اشتراک را تمدید می‌کند و تاریخِ تازه را برمی‌گرداند.
   *
   * ⚠️ پایه، **دیرترینِ** «امروز» و «انقضای فعلی» است.
   *
   *    اگر همیشه از امروز بود، تمدیدِ زودهنگام روزهای باقی‌مانده را
   *    می‌سوزاند و مشتری یاد می‌گیرد تا آخرین لحظه صبر کند — یعنی هر
   *    تمدید یک قطعیِ کوتاه.
   */
  private async extend(
    companyId: string,
    plan: string,
    months: number,
  ): Promise<string> {
    const current = await this.subscription.forCompany(companyId);

    const today = new Date();
    const base =
      current?.endsOn && new Date(current.endsOn) > today
        ? new Date(current.endsOn)
        : today;

    base.setMonth(base.getMonth() + months);
    const endsOn = base.toISOString().slice(0, 10);

    // `upsert` سقف‌های پیش‌فرضِ نسخه را هم می‌گذارد و حافظهٔ قابلیت را
    // پاک می‌کند — پس ارتقا بی‌درنگ اثر می‌کند.
    await this.subscription.upsert(companyId, {
      plan,
      status: 'ACTIVE',
      endsOn,
    });

    return endsOn;
  }
}
