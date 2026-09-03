import { BadRequestException, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import {
  QUARTER_NAMES,
  formatJalali,
  quarterOf,
  quarterRange,
} from '../common/jalali';

/**
 * گزارش فصلی خرید و فروش — ماده ۱۶۹ مکرر.
 *
 * ---------- چرا این گزارش وجود نداشت و چرا مهم است ----------
 *
 * تا امروز هیچ نصبی نمی‌توانست گزارش فصلی بدهد.  این نبودن هیچ خطایی
 * نمی‌داد و هیچ‌جا دیده نمی‌شد — چون گزارشی وجود نداشت که کم‌بودنش را
 * نشان دهد.  ولی نبودش برای مشتری **جریمه** است، نه ناراحتی.
 *
 * ---------- سه تصمیمِ دامنه که در اعداد اثر دارند ----------
 *
 * ۱) **نسیه هم معامله است.**  رویدادِ مشمول، فروش است نه دریافتِ پول.
 *    پس `PENDING` و `PARTIAL` هم گزارش می‌شوند و فقط `CANCELLED` و
 *    `DRAFT` کنار می‌روند.  اگر بر اساس پرداخت فیلتر می‌شد، فروشِ نسیهٔ
 *    پایانِ فصل از گزارش می‌افتاد و سالِ بعد به‌عنوان مغایرت برمی‌گشت.
 *
 * ۲) **خرده‌فروشی تجمیعی است.**  سوپرمارکت برای فروشِ پنجاه‌هزارتومانی
 *    شمارهٔ ملی نمی‌گیرد و قرار هم نیست بگیرد.  این‌ها یک سطرِ جمع
 *    می‌شوند.  بدونِ این تصمیم، گزارش برای فروشگاه غیرقابلِ استفاده
 *    است — نه ناقص، بلکه چند ده هزار سطرِ بی‌شناسه.
 *
 * ۳) **برگشتی‌ها جدا گزارش می‌شوند، نه کسر شده.**  کسر کردنشان از
 *    فروش، عددِ درستی می‌سازد که سازمان نمی‌تواند با فاکتورها تطبیق
 *    دهد.  دو بخشِ جدا، همان‌طور که سامانه می‌خواهد.
 */

type Row = Record<string, unknown>;

/** وضعیت‌هایی که اصلاً معامله نیستند. */
const EXCLUDED = ['CANCELLED', 'DRAFT'];

@Injectable()
export class SeasonalService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * فصلِ جاری و فصلِ پیشین.
   *
   * ⚠️ فصلِ جاری معمولاً همانی **نیست** که باید گزارش شود.  مهلتِ
   *    قانونی یک ماه پس از پایانِ فصل است، پس کاربر تقریباً همیشه فصلِ
   *    پیشین را می‌خواهد.  هر دو برگردانده می‌شود تا رابط بتواند درست
   *    پیشنهاد بدهد و کاربر سهواً فصلِ ناتمام را نفرستد.
   */
  currentPeriod() {
    const cur = quarterOf(new Date());
    const prevQuarter = cur.quarter === 1 ? 4 : cur.quarter - 1;
    const prevYear = cur.quarter === 1 ? cur.jy - 1 : cur.jy;
    return {
      current: { ...cur, name: QUARTER_NAMES[cur.quarter - 1] },
      previous: {
        jy: prevYear,
        quarter: prevQuarter,
        name: QUARTER_NAMES[prevQuarter - 1],
      },
    };
  }

  async report(companyId: string, jy: number, quarter: number) {
    if (!Number.isInteger(jy) || jy < 1300 || jy > 1500) {
      throw new BadRequestException(`سال نامعتبر: ${jy}`);
    }
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
      throw new BadRequestException(`فصل نامعتبر: ${quarter}`);
    }

    const { from, to } = quarterRange(jy, quarter);

    const [seller, sales, retail, purchases, saleReturns, purchaseReturns] =
      await Promise.all([
        this.seller(companyId),
        this.salesDetailed(companyId, from, to),
        this.salesRetail(companyId, from, to),
        this.purchasesDetailed(companyId, from, to),
        this.saleReturns(companyId, from, to),
        this.purchaseReturns(companyId, from, to),
      ]);

    return {
      period: {
        jy,
        quarter,
        name: QUARTER_NAMES[quarter - 1],
        fromJalali: formatJalali(from),
        // ⚠️ `to` ناشامل است، پس تاریخِ نمایشیِ پایان یک لحظه پیش‌تر
        //    گرفته می‌شود.  بدونِ این، کاربر «۱ تیر» را پایانِ بهار
        //    می‌بیند و فکر می‌کند گزارش یک روز اضافه دارد.
        toJalali: formatJalali(new Date(to.getTime() - 1)),
        fromUtc: from.toISOString(),
        toUtc: to.toISOString(),
      },
      seller,
      sales: { detailed: sales, retail },
      purchases: { detailed: purchases },
      returns: { sales: saleReturns, purchases: purchaseReturns },
      totals: this.totals(sales, retail, purchases),
      warnings: this.warnings(purchases, retail),
    };
  }

  // ------------------------------------------------------- فروشنده
  private async seller(companyId: string) {
    const rows = await this.db.query<Row>(
      `SELECT c.name, c.city, c.country, t."economicCode", t."memoryId"
         FROM "Company" c
         LEFT JOIN "TaxSetting" t ON t."companyId" = c.id
        WHERE c.id = $1`,
      [companyId],
    );
    return rows[0] ?? null;
  }

  // ------------------------------------------------------- فروش تفصیلی
  //
  // ⚠️ «طرفِ شناسایی‌شده» یعنی مشتری **و** شمارهٔ ملی دارد.  مشتریِ
  //    ثبت‌شده‌ی بی‌شناسه هم خرده‌فروشی حساب می‌شود، چون نامِ تنها به
  //    کارِ سازمان نمی‌آید — و اگر این‌جا می‌آمد، سطرِ ناقص تولید
  //    می‌کرد که هنگام بارگذاری رد می‌شود.
  private salesDetailed(companyId: string, from: Date, to: Date) {
    return this.rows(
      `SELECT s."invoiceNo" AS "docNo",
              s."createdAt" AS "docDate",
              s.subtotal, s.discount, s.tax, s.total,
              cu.id AS "partyId",
              btrim(concat_ws(' ', cu."firstName", cu."lastName")) AS name,
              cu."personType", cu."nationalCode", cu."economicCode",
              cu."postalCode", cu.address
         FROM "Sale" s
         JOIN "Customer" cu ON cu.id = s."customerId"
        WHERE s."companyId" = $1
          AND s."createdAt" >= $2 AND s."createdAt" < $3
          AND s.status <> ALL($4)
          AND cu."nationalCode" IS NOT NULL
        ORDER BY s."createdAt"`,
      [companyId, from, to, EXCLUDED],
    );
  }

  // ------------------------------------------------------- خرده‌فروشی
  private async salesRetail(companyId: string, from: Date, to: Date) {
    const rows = await this.db.query<Row>(
      `SELECT count(*)::int AS count,
              coalesce(sum(s.subtotal), 0) AS subtotal,
              coalesce(sum(s.discount), 0) AS discount,
              coalesce(sum(s.tax), 0)      AS tax,
              coalesce(sum(s.total), 0)    AS total
         FROM "Sale" s
         LEFT JOIN "Customer" cu ON cu.id = s."customerId"
        WHERE s."companyId" = $1
          AND s."createdAt" >= $2 AND s."createdAt" < $3
          AND s.status <> ALL($4)
          AND (s."customerId" IS NULL OR cu."nationalCode" IS NULL)`,
      [companyId, from, to, EXCLUDED],
    );
    return this.num(rows[0] ?? {});
  }

  // ------------------------------------------------------- خرید
  //
  // ⚠️ خرید سطرِ تجمیعی ندارد، عمداً.  خرید از تأمین‌کنندهٔ ناشناس
  //    وجود ندارد؛ اگر شناسه‌اش نیست یعنی داده ناقص است، نه اینکه
  //    خرده‌فروشی باشد.  پس همه می‌آیند و بی‌شناسه‌ها هشدار می‌گیرند.
  private purchasesDetailed(companyId: string, from: Date, to: Date) {
    return this.rows(
      `SELECT p."purchaseNo" AS "docNo",
              p."createdAt"  AS "docDate",
              p.subtotal, p.discount, p.tax, p.total,
              su.id AS "partyId",
              su.name,
              su."personType", su."nationalCode", su."economicCode",
              su."postalCode", su.address
         FROM "Purchase" p
         JOIN "Supplier" su ON su.id = p."supplierId"
        WHERE p."companyId" = $1
          AND p."createdAt" >= $2 AND p."createdAt" < $3
          AND p.status <> ALL($4)
        ORDER BY p."createdAt"`,
      [companyId, from, to, EXCLUDED],
    );
  }

  // ------------------------------------------------------- برگشتی‌ها
  //
  // ⚠️ تفکیک با ستونِ صریحِ `type` است، نه با «`saleId` پُر است؟».
  //
  //    نسخهٔ اول از روی پُر بودنِ کلید حدس می‌زد.  جدول ستونِ `type` با
  //    قیدِ `ProductReturn_source_chk` دارد که جفت‌شدنشان را تضمین
  //    می‌کند — یعنی پاسخِ قطعی همان‌جا بود و من حدس می‌زدم.
  //
  // ⚠️ و فقط `APPLIED` گزارش می‌شود.
  //
  //    نسخهٔ اول هر وضعیتی جز CANCELLED را می‌آورد، پس برگشتیِ
  //    **در انتظار** هم در گزارش می‌نشست — چیزی که هنوز اتفاق نیفتاده.
  //    نتیجه: برگشتی بیش از واقع، و مغایرت با انبار و دفتر.
  private saleReturns(companyId: string, from: Date, to: Date) {
    return this.rows(
      `SELECT r."returnNo"    AS "docNo",
              r."createdAt"   AS "docDate",
              r."totalAmount" AS total,
              cu.id AS "partyId",
              btrim(concat_ws(' ', cu."firstName", cu."lastName")) AS name,
              cu."personType", cu."nationalCode", cu."economicCode"
         FROM "ProductReturn" r
         LEFT JOIN "Customer" cu ON cu.id = r."customerId"
        WHERE r."companyId" = $1
          AND r."createdAt" >= $2 AND r."createdAt" < $3
          AND r.status = 'APPLIED'
          AND r.type = 'SALE'
        ORDER BY r."createdAt"`,
      [companyId, from, to],
    );
  }

  private purchaseReturns(companyId: string, from: Date, to: Date) {
    return this.rows(
      `SELECT r."returnNo"    AS "docNo",
              r."createdAt"   AS "docDate",
              r."totalAmount" AS total,
              su.id AS "partyId",
              su.name,
              su."personType", su."nationalCode", su."economicCode"
         FROM "ProductReturn" r
         LEFT JOIN "Supplier" su ON su.id = r."supplierId"
        WHERE r."companyId" = $1
          AND r."createdAt" >= $2 AND r."createdAt" < $3
          AND r.status = 'APPLIED'
          AND r.type = 'PURCHASE'
        ORDER BY r."createdAt"`,
      [companyId, from, to],
    );
  }

  // ------------------------------------------------------- جمع‌ها
  private totals(sales: Row[], retail: Row, purchases: Row[]) {
    const sum = (rows: Row[], key: string) =>
      rows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);

    return {
      salesDetailedCount: sales.length,
      salesDetailedTotal: sum(sales, 'total'),
      retailCount: Number(retail.count ?? 0),
      retailTotal: Number(retail.total ?? 0),
      salesTotal: sum(sales, 'total') + Number(retail.total ?? 0),
      purchasesCount: purchases.length,
      purchasesTotal: sum(purchases, 'total'),
    };
  }

  // ------------------------------------------------------- هشدارها
  //
  // ⚠️ گزارشی که فقط عدد می‌دهد، کاربر را به سامانه می‌فرستد تا آن‌جا
  //    رد شود.  چیزی که مانعِ ارسال است باید **اینجا** گفته شود.
  private warnings(purchases: Row[], retail: Row) {
    const out: { code: string; count: number; message: string }[] = [];

    const noId = purchases.filter((p) => !p.nationalCode);
    if (noId.length) {
      out.push({
        code: 'SUPPLIER_WITHOUT_ID',
        count: noId.length,
        message: `${noId.length} خرید از تأمین‌کنندهٔ بدونِ شناسهٔ ملی — پیش از ارسال باید تکمیل شود`,
      });
    }

    const noType = purchases.filter((p) => p.nationalCode && !p.personType);
    if (noType.length) {
      out.push({
        code: 'PARTY_WITHOUT_TYPE',
        count: noType.length,
        message: `${noType.length} طرفِ معامله نوعِ شخص (حقیقی/حقوقی) ندارد`,
      });
    }

    const retailCount = Number(retail.count ?? 0);
    if (retailCount > 0) {
      out.push({
        code: 'RETAIL_AGGREGATED',
        count: retailCount,
        message: `${retailCount} فروشِ خرده‌فروشی به‌صورت تجمیعی گزارش می‌شود`,
      });
    }
    return out;
  }

  // ------------------------------------------------------- کمکی
  private async rows(sql: string, values: unknown[]) {
    const rows = await this.db.query<Row>(sql, values);
    return rows.map((r) => ({
      ...this.num(r),
      // تاریخِ شمسی همراهِ سطر می‌رود؛ رابط نباید دوباره تبدیل کند —
      // وگرنه دو تقویم پیدا می‌کنیم که در روزهای مرزی اختلاف دارند.
      docDateJalali: formatJalali(new Date(r.docDate as string)),
    }));
  }

  /**
   * ⚠️ `NUMERIC` پستگرس در درایور **رشته** برمی‌گردد، نه عدد.
   *
   *    این همان تلهٔ `endsOn` است با لباسِ دیگر: `"1000" + "2000"` در
   *    جاوااسکریپت `"10002000"` می‌شود و هیچ خطایی نمی‌دهد.  جمعِ فصل
   *    عددی نجومی می‌شد و هیچ‌کس هم نمی‌فهمید چرا.
   */
  private num(row: Row): Row {
    const out: Row = { ...row };
    for (const k of ['subtotal', 'discount', 'tax', 'total', 'count']) {
      if (out[k] !== undefined && out[k] !== null) out[k] = Number(out[k]);
    }
    return out;
  }
}
