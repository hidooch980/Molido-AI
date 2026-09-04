import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';
import { ShahkarService } from '../shahkar/shahkar.service';
import { formatJalali } from '../common/jalali';

@Injectable()
export class CustomersService extends BaseCrudService {
  protected readonly table = 'Customer';
  protected readonly notFoundMessage = 'مشتری یافت نشد';
  protected readonly searchColumns = ['firstName', 'lastName', 'phone', 'email', 'nationalCode'];

  constructor(
    db: DatabaseService,
    private readonly shahkar: ShahkarService,
  ) {
    super(db);
  }

  /**
   * ⚠️ تطبیقِ شاهکار **فقط وقتی هر دو داده شده‌اند**.
   *
   *    کد ملی در پروندهٔ مشتری اختیاری است و بسیارِ مشتری‌ها بدونش
   *    ثبت می‌شوند.  اجباری کردنش اینجا یعنی فروشنده نتواند مشتریِ
   *    حضوری را سریع ثبت کند — تصمیمی تجاری که جای گرفتنش اینجا نیست.
   *
   *    ولی اگر هر دو داده شد، تطبیق **باید** بخورد: کد ملیِ کسِ دیگری
   *    روی پروندهٔ یک شماره، بدتر از نبودِ کد ملی است — چون به نظر
   *    احراز شده می‌آید.
   */
  async create(companyId: string, rawData: Record<string, unknown>) {
    const nationalCode = rawData?.nationalCode;
    const phone = rawData?.phone;
    if (nationalCode && phone) {
      await this.shahkar.enforce(companyId, nationalCode, phone);
    }
    return super.create(companyId, rawData);
  }

  /**
   * مانده بدهی مشتری — جمع فاکتورهای تسویه‌نشده.
   *
   * فروشنده باید **پیش از** ثبت فروش نسیه بداند این مشتری از قبل چقدر
   * بدهکار است.  بعد از ثبت فاکتور دیگر دیر است: کالا رفته و طرف حساب
   * بدهکارتر شده.
   *
   * مبلغ از خودِ فاکتورها حساب می‌شود، نه از ستونی که جایی نگه داشته
   * شود: ستونِ مانده با هر مسیرِ فراموش‌شده‌ای (مرجوعی، ابطال، تسویهٔ
   * دستی) از واقعیت جدا می‌افتد و کسی هم متوجه نمی‌شود.
   */
  async balance(companyId: string, customerId: string) {
    const rows = await this.db.query<{
      unpaid: string;
      invoiceCount: string;
      overdue: string;
      oldestDue: string | null;
    }>(
      `SELECT
         COALESCE(SUM(s.total - COALESCE(p.paid, 0)), 0)::text AS unpaid,
         COUNT(*)::text AS "invoiceCount",
         COALESCE(SUM(
           CASE WHEN s."dueDate" IS NOT NULL AND s."dueDate" < CURRENT_DATE
                THEN s.total - COALESCE(p.paid, 0) ELSE 0 END
         ), 0)::text AS overdue,
         MIN(s."dueDate")::text AS "oldestDue"
       FROM "Sale" s
       LEFT JOIN LATERAL (
         SELECT SUM(amount) AS paid FROM "Payment"
          WHERE "saleId" = s.id AND status = 'COMPLETED'
       ) p ON true
       WHERE s."companyId" = $1
         AND s."customerId" = $2
         AND s.status IN ('PENDING', 'PARTIAL')`,
      [companyId, customerId],
    );

    const row = rows[0];
    return {
      customerId,
      unpaid: Number(row?.unpaid ?? 0),
      invoiceCount: Number(row?.invoiceCount ?? 0),
      overdue: Number(row?.overdue ?? 0),
      oldestDue: row?.oldestDue ?? null,
    };
  }

  /**
   * صورت وضعیت (گردش حساب) — ریزِ سطربه‌سطر با ماندهٔ جاری.
   *
   * ---------- چرا جدا از `balance` ----------
   *
   * `balance` یک عدد می‌دهد: «چقدر طلبکاریم».  وقتی مشتری می‌گوید
   * «این عدد اشتباه است»، آن یک عدد هیچ کمکی نمی‌کند.  صورت وضعیت
   * نشان می‌دهد **از کجا** آمده: کدام فاکتور، کدام پرداخت، کدام مرجوعی.
   *
   * ---------- سه تصمیم ----------
   *
   * ۱) **ماندهٔ اول دوره جدا حساب می‌شود.**  بدونِ آن، صورت وضعیتِ یک
   *    بازه از صفر شروع می‌شود و ماندهٔ پایانش با واقعیت نمی‌خواند —
   *    همان اشکالی که در تراز آزمایشیِ سالِ نو داشتیم.
   *
   * ۲) **ترتیب قطعی است.**  `ORDER BY` علاوه بر تاریخ، نوع و شماره
   *    سند را هم دارد.  دو رویداد در یک ثانیه بدونِ کلیدِ پایدار هر
   *    بار جای هم می‌نشینند و ستونِ ماندهٔ جاری در هر بار فراخوانی
   *    فرق می‌کند — بی‌آنکه هیچ عددی غلط باشد.
   *
   * ۳) **پرداخت از راه `saleId` وصل می‌شود**، چون `Payment` ستونِ
   *    `companyId` ندارد.  پس فیلترِ شرکت روی `Sale` است، نه پرداخت.
   */
  async statement(
    companyId: string,
    customerId: string,
    from?: string,
    to?: string,
  ) {
    // اقلامِ گردش، به‌صورت یک منبعِ واحد تا هم برای ماندهٔ اول دوره و هم
    // برای سطرها به‌کار برود — دو پرس‌وجوی جدا یعنی دو تعریف که با هم
    // فاصله می‌گیرند.
    const MOVEMENTS = `
      SELECT s."createdAt" AS at, 1 AS ord, 'INVOICE' AS type,
             s."invoiceNo" AS "docNo", s.total AS debit, 0::numeric AS credit
        FROM "Sale" s
       WHERE s."companyId" = $1 AND s."customerId" = $2
         AND s.status NOT IN ('CANCELLED', 'DRAFT')
      UNION ALL
      SELECT p."createdAt", 2, 'PAYMENT', p."referenceNo",
             0::numeric, p.amount
        FROM "Payment" p
        JOIN "Sale" s ON s.id = p."saleId"
       WHERE s."companyId" = $1 AND s."customerId" = $2
         AND p.status = 'COMPLETED'
      UNION ALL
      SELECT r."createdAt", 3, 'RETURN', r."returnNo",
             0::numeric, r."totalAmount"
        FROM "ProductReturn" r
       WHERE r."companyId" = $1 AND r."customerId" = $2
         AND r.type = 'SALE' AND r.status = 'APPLIED'`;

    const opening = from
      ? await this.db.query<{ net: string }>(
          `SELECT COALESCE(SUM(debit) - SUM(credit), 0)::text AS net
             FROM (${MOVEMENTS}) m WHERE m.at < $3`,
          [companyId, customerId, from],
        )
      : [{ net: '0' }];

    const values: unknown[] = [companyId, customerId];
    const where: string[] = [];
    if (from) { values.push(from); where.push(`m.at >= $${values.length}`); }
    if (to)   { values.push(to);   where.push(`m.at <= $${values.length}`); }
    const filter = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT m.at, m.type, m."docNo", m.debit, m.credit
         FROM (${MOVEMENTS}) m
        ${filter}
        ORDER BY m.at, m.ord, m."docNo"`,
      values,
    );

    let balance = Number(opening[0]?.net ?? 0);
    const lines = rows.map((r) => {
      const debit = Number(r.debit ?? 0);
      const credit = Number(r.credit ?? 0);
      balance += debit - credit;
      return {
        at: r.at,
        atJalali: formatJalali(new Date(r.at as string)),
        type: r.type,
        docNo: r.docNo,
        debit,
        credit,
        balance,
      };
    });

    return {
      customerId,
      period: { from: from ?? null, to: to ?? null },
      openingBalance: Number(opening[0]?.net ?? 0),
      lines,
      totals: {
        debit: lines.reduce((a, l) => a + l.debit, 0),
        credit: lines.reduce((a, l) => a + l.credit, 0),
        closingBalance: balance,
      },
    };
  }
}
