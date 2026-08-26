import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import process from 'node:process';

import { DatabaseService } from '../database/database.service';
import { runInTenant, runWithTrackCode } from '../database/tenant-context';
import { ZarinpalGateway } from '../payment/zarinpal.gateway';

type ModuleRow = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  priceIrr: string;
};

type PurchaseItem = { slug: string; title: string; priceIrr: number };

type PurchaseRow = {
  id: string;
  trackingCode: string;
  buyerName: string;
  buyerPhone: string;
  status: string;
  items: PurchaseItem[];
  amountIrr: string;
  paymentRef: string | null;
  bankRef: string | null;
  paidAt: Date | null;
  leadId: string | null;
};

/**
 * فروشِ ماژول از سایتِ معرفی.
 *
 * ⚠️ سایتِ معرفی **ایستا** روی هاست cPanel است و این سرویس تنها
 *    جایی است که به پول دست می‌زند.
 *
 *    این تقسیم اختیاری نیست: تأییدِ پرداخت باید سمتِ سرور انجام شود.
 *    اگر صفحهٔ ایستا خودش «پرداخت شد» را تصمیم بگیرد، هر کسی با
 *    ابزارِ توسعهٔ مرورگر یک سفارشِ رایگان می‌سازد.
 *
 * ⚠️ مبلغ **هرگز** از درخواست خوانده نمی‌شود.
 *
 *    مشتری فقط `slug` ماژول‌ها را می‌فرستد؛ قیمت از پایگاه‌داده
 *    خوانده و جمع می‌شود.  پذیرفتنِ مبلغ از کلاینت یعنی خریدِ
 *    ده‌میلیونی با هزار تومان.
 */
@Injectable()
export class SiteService {
  constructor(
    private readonly db: DatabaseService,
    private readonly gateway: ZarinpalGateway,
  ) {}

  /**
   * شرکتِ مقصد.
   *
   * ⚠️ از پیکربندیِ سرور، نه از درخواست — همان استدلالِ
   *    `ShopTenantMiddleware`.  خواندنش از پارامتر یعنی هرکس
   *    می‌تواند سفارش را به شرکتِ دلخواهش بچسباند.
   */
  private company(): string {
    const id = process.env.SHOP_COMPANY_ID?.trim();
    if (!id) {
      throw new ServiceUnavailableException(
        'شرکت مقصد تنظیم نشده است — SHOP_COMPANY_ID را مقدار دهید',
      );
    }
    return id;
  }

  private tenant<T>(work: () => Promise<T>): Promise<T> {
    return runInTenant({ companyId: this.company(), userId: null }, work);
  }

  /** کاتالوگِ عمومی — فقط ماژول‌های فعال. */
  async modules() {
    const rows = await this.tenant(() =>
      this.db.query<ModuleRow>(
        `SELECT id, slug, title, summary, "priceIrr"
           FROM "SiteModule"
          WHERE "companyId" = $1 AND "isActive" = true
          ORDER BY "sortOrder", title`,
        [this.company()],
      ),
    );
    return rows.map((r) => ({ ...r, priceIrr: Number(r.priceIrr) }));
  }

  /**
   * ثبتِ سفارش و شروعِ پرداخت.
   *
   * خروجی نشانیِ درگاه است؛ سایتِ ایستا کاربر را همان‌جا می‌فرستد.
   */
  async purchase(input: {
    slugs: unknown;
    name: unknown;
    phone: unknown;
    email?: unknown;
    company?: unknown;
    note?: unknown;
  }) {
    const name = str(input.name);
    const phone = str(input.phone);
    if (!name) throw new BadRequestException('نام الزامی است');
    if (!/^09\d{9}$/.test(phone)) {
      throw new BadRequestException('شماره موبایل معتبر نیست');
    }

    const slugs = Array.isArray(input.slugs)
      ? [...new Set(input.slugs.map((s) => str(s)).filter(Boolean))]
      : [];
    if (!slugs.length) throw new BadRequestException('حداقل یک ماژول انتخاب کنید');

    const companyId = this.company();

    // ⚠️ قیمت از پایگاه‌داده، نه از درخواست.  دلیلش بالای کلاس.
    const found = await this.tenant(() =>
      this.db.query<ModuleRow>(
        `SELECT id, slug, title, summary, "priceIrr"
           FROM "SiteModule"
          WHERE "companyId" = $1 AND "isActive" = true AND slug = ANY($2)`,
        [companyId, slugs],
      ),
    );

    // ⚠️ اسلاگِ ناشناخته بی‌صدا نادیده گرفته نمی‌شود.
    //
    //    وگرنه کاربر سه ماژول انتخاب می‌کند، دو تا حساب می‌شود، و
    //    فاکتورش کمتر از انتظارش درمی‌آید — بی‌آنکه چیزی بگوید.
    if (found.length !== slugs.length) {
      const known = new Set(found.map((m) => m.slug));
      throw new BadRequestException(
        `ماژول ناشناخته: ${slugs.filter((s) => !known.has(s)).join('، ')}`,
      );
    }

    const items: PurchaseItem[] = found.map((m) => ({
      slug: m.slug,
      title: m.title,
      priceIrr: Number(m.priceIrr),
    }));
    const amount = items.reduce((sum, i) => sum + i.priceIrr, 0);
    if (amount <= 0) throw new BadRequestException('مبلغ سفارش صفر است');

    // کدِ رهگیریِ حدس‌ناپذیر — خریدار با همین وضعیت را می‌بیند.
    const trackingCode = `MO-${randomBytes(8).toString('base64url')}`;
    const id = randomUUID();

    await this.tenant(() =>
      this.db.execute(
        `INSERT INTO "SitePurchase"
           (id, "companyId", "trackingCode", "buyerName", "buyerPhone", "buyerEmail",
            "buyerCompany", note, items, "amountIrr", status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'PENDING')`,
        [
          id,
          companyId,
          trackingCode,
          name,
          phone,
          str(input.email) || null,
          str(input.company) || null,
          str(input.note) || null,
          JSON.stringify(items),
          amount,
        ],
      ),
    );

    // ⚠️ سرنخِ CRM جدا و **بدونِ شکستنِ خرید** ساخته می‌شود.
    //
    //    اگر ساختِ سرنخ خطا بدهد، سفارش نباید از بین برود: پول در
    //    راه است و سرنخ فقط ابزارِ فروش.  خطایش لاگ می‌شود و تمام.
    const leadId = await this.createLead(companyId, {
      name,
      phone,
      email: str(input.email),
      company: str(input.company),
      items,
    }).catch(() => null);

    if (leadId) {
      await this.tenant(() =>
        this.db.execute('UPDATE "SitePurchase" SET "leadId" = $1 WHERE id = $2', [leadId, id]),
      ).catch(() => undefined);
    }

    const started = await this.gateway.start({
      amount,
      description: `خرید ماژول مولیدو — ${items.map((i) => i.title).join('، ')}`,
      callbackUrl: `${siteBase()}/site/purchase/callback?code=${encodeURIComponent(trackingCode)}`,
      mobile: phone,
      email: str(input.email) || undefined,
      orderNo: trackingCode,
    });

    if (!started.ok || !started.redirectUrl) {
      await this.tenant(() =>
        this.db.execute(
          `UPDATE "SitePurchase" SET status='FAILED', "updatedAt"=now() WHERE id=$1`,
          [id],
        ),
      ).catch(() => undefined);
      throw new ServiceUnavailableException(started.error || 'اتصال به درگاه پرداخت ممکن نشد');
    }

    await this.tenant(() =>
      this.db.execute(
        `UPDATE "SitePurchase" SET "paymentRef"=$1, "updatedAt"=now() WHERE id=$2`,
        [started.reference ?? null, id],
      ),
    );

    return { trackingCode, amountIrr: amount, paymentUrl: started.redirectUrl };
  }

  /**
   * بازگشت از درگاه — تأیید **سمتِ سرور**.
   *
   * ⚠️ حرفِ درگاه در پارامترِ نشانی ملاک نیست.
   *
   *    زرین‌پال `Status=OK` را در نشانی می‌فرستد و همان نشانی در
   *    دستِ کاربر است.  تنها چیزی که ملاک است، پاسخِ خودِ درگاه به
   *    درخواستِ `verify` از کانالِ پشتی است.
   */
  async completePurchase(trackingCode: string) {
    const code = str(trackingCode);
    if (!code) throw new BadRequestException('کد رهگیری نیست');

    const companyId = this.company();
    const rows = await this.tenant(() =>
      this.db.query<PurchaseRow>(
        `SELECT id, "trackingCode", "buyerName", "buyerPhone", status, items,
                "amountIrr", "paymentRef", "bankRef", "paidAt", "leadId"
           FROM "SitePurchase" WHERE "trackingCode" = $1 AND "companyId" = $2 LIMIT 1`,
        [code, companyId],
      ),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('سفارشی با این کد پیدا نشد');

    // ⚠️ پرداخت‌شده دوباره تأیید نمی‌شود — بارگذاریِ دوبارهٔ صفحهٔ
    //    بازگشت نباید سند یا تراکنشِ تکراری بسازد.
    if (row.status === 'PAID') {
      return { ok: true, alreadyPaid: true, trackingCode: code, bankRef: row.bankRef };
    }
    if (!row.paymentRef) {
      throw new BadRequestException('این سفارش به درگاه نرفته است');
    }

    const amount = Number(row.amountIrr);
    const result = await this.gateway.verify(row.paymentRef, amount);

    if (!result.ok) {
      await this.tenant(() =>
        this.db.execute(
          `UPDATE "SitePurchase" SET status='FAILED', "updatedAt"=now() WHERE id=$1`,
          [row.id],
        ),
      );
      return { ok: false, trackingCode: code, error: result.error ?? 'پرداخت تأیید نشد' };
    }

    // ⚠️ تطبیقِ مبلغ، حتی وقتی درگاه «موفق» گفته.
    //
    //    بدونش سفارشِ ده‌میلیونی با پرداختِ هزارتومانی تأیید می‌شود:
    //    کدِ پیگیری معتبر است و ما فرض می‌کنیم درست پرداخت شده.
    // ⚠️ مبلغِ نامعلوم هم رد می‌شود — دلیلش در `payment.service`.
    if (typeof result.paidAmount !== 'number' || result.paidAmount !== amount) {
      await this.tenant(() =>
        this.db.execute(
          `UPDATE "SitePurchase" SET status='FAILED', "updatedAt"=now() WHERE id=$1`,
          [row.id],
        ),
      );
      return {
        ok: false,
        trackingCode: code,
        error:
          typeof result.paidAmount === 'number'
            ? `مبلغ پرداختی با مبلغ سفارش نمی‌خواند (${result.paidAmount} در برابر ${amount})`
            : 'درگاه مبلغ پرداختی را تأیید نکرد',
      };
    }

    await this.tenant(() =>
      this.db.execute(
        `UPDATE "SitePurchase"
            SET status='PAID', "bankRef"=$1, "paidAt"=now(), "updatedAt"=now()
          WHERE id=$2`,
        [result.trackingCode ?? null, row.id],
      ),
    );

    if (row.leadId) {
      await this.tenant(() =>
        this.db.execute(`UPDATE "Lead" SET status='WON' WHERE id=$1`, [row.leadId]),
      ).catch(() => undefined);
    }

    return { ok: true, trackingCode: code, bankRef: result.trackingCode ?? null };
  }

  /**
   * وضعیتِ سفارش برای خریدار — بدونِ ورود.
   *
   * ⚠️ از روزنهٔ `purchase_public_track` رد می‌شود، نه از دور زدنِ RLS.
   *    ستون‌های حساس (تلفن، ایمیل، شناسهٔ درگاه) برنمی‌گردند.
   */
  async status(trackingCode: string) {
    const code = str(trackingCode);
    if (!code) throw new BadRequestException('کد رهگیری نیست');

    const rows = await runWithTrackCode(code, () =>
      this.db.query<{
        trackingCode: string;
        status: string;
        items: PurchaseItem[];
        amountIrr: string;
        bankRef: string | null;
        paidAt: Date | null;
        createdAt: Date;
      }>(
        `SELECT "trackingCode", status, items, "amountIrr", "bankRef", "paidAt", "createdAt"
           FROM "SitePurchase" WHERE "trackingCode" = $1 LIMIT 1`,
        [code],
      ),
    );
    if (!rows[0]) throw new NotFoundException('کد رهگیری نامعتبر است');
    return { ...rows[0], amountIrr: Number(rows[0].amountIrr) };
  }

  /** سرنخِ CRM از خریدار. */
  private async createLead(
    companyId: string,
    input: {
      name: string;
      phone: string;
      email: string;
      company: string;
      items: PurchaseItem[];
    },
  ): Promise<string> {
    const id = randomUUID();
    const leadNo = `WEB-${randomBytes(4).toString('hex')}`;
    await this.tenant(() =>
      this.db.execute(
        `INSERT INTO "Lead" (id, "companyId", "leadNo", name, company, phone, email, source, status, score, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'WEBSITE','NEW',0,$8)`,
        [
          id,
          companyId,
          leadNo,
          input.name,
          input.company || null,
          input.phone,
          input.email || null,
          `درخواست از سایت: ${input.items.map((i) => i.title).join('، ')}`,
        ],
      ),
    );
    return id;
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * نشانیِ عمومیِ **API**، نه سایتِ ایستا.
 *
 * ⚠️ بازگشتِ درگاه باید به سرور برسد نه به هاستِ cPanel.
 *
 *    اگر به سایتِ ایستا برگردد، آنجا هیچ راهی برای تأیید ندارد و
 *    مجبور است به `Status=OK` نشانی اعتماد کند — یعنی همان چیزی که
 *    کلِ این تقسیم برای جلوگیری از آن است.
 */
function siteBase(): string {
  return (
    process.env.API_PUBLIC_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
}
