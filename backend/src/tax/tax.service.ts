import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { buildTaxId } from './tax-id';

/**
 * ارسال صورتحساب الکترونیکی به سامانهٔ مؤدیان.
 *
 * ---------- چرا صف ----------
 *
 * ارسال به سامانهٔ بیرونی کند می‌شود، قطع می‌شود، و خطای موقت می‌دهد.  اگر
 * ثبت فاکتور منتظرش بماند، یک قطعی اینترنت صندوق فروشگاه را می‌خواباند.
 * پس فاکتور ثبت می‌شود و ارسالش در صف می‌نشیند؛ کارگر جدا آن را می‌برد.
 *
 * ---------- مرزهای این پیاده‌سازی ----------
 *
 * آنچه قطعی است: ساخت شمارهٔ منحصربه‌فرد، صف، وضعیت، تلاش مجدد، و
 * جلوگیری از ارسال دوباره.
 *
 * آنچه باید با اطلاعات واقعی تأیید شود: **نگاشت دقیق میدان‌ها و امضای
 * دیجیتال**.  تا وقتی `isSandbox` روشن است هیچ‌چیز واقعاً فرستاده نمی‌شود
 * — عمداً، تا اولین آزمون داده به سامانهٔ واقعی نریزد.
 */

type Row = Record<string, unknown>;

type Setting = {
  companyId: string;
  memoryId: string | null;
  economicCode: string | null;
  apiBaseUrl: string;
  privateKeyPem: string | null;
  clientId: string | null;
  serial: string;
  isEnabled: boolean;
  isSandbox: boolean;
};

/** پس از این تعداد تلاش، سطر شکست‌خورده می‌شود و دست از تکرار برمی‌دارد. */
const MAX_ATTEMPTS = 5;

@Injectable()
export class TaxService {
  constructor(private readonly db: DatabaseService) {}

  // ------------------------------------------------------- تنظیمات

  async settings(companyId: string): Promise<Setting> {
    const [row] = await this.db.query<Setting>(
      'SELECT * FROM "TaxSetting" WHERE "companyId" = $1',
      [companyId],
    );

    if (row) return this.maskKey(row);

    // سطر پیش‌فرض همان بار اول ساخته می‌شود تا صفحهٔ تنظیمات خالی نباشد.
    const [created] = await this.db.query<Setting>(
      'INSERT INTO "TaxSetting" ("companyId") VALUES ($1) RETURNING *',
      [companyId],
    );

    return this.maskKey(created);
  }

  /**
   * کلید خصوصی هرگز از API بیرون نمی‌رود.
   *
   * صفحهٔ تنظیمات فقط باید بداند کلید **هست یا نیست**؛ خواندنش از مرورگر
   * یعنی هر کسی که یک بار به حساب مدیر دسترسی پیدا کند، امضای شرکت را
   * برمی‌دارد.
   */
  private maskKey(row: Setting): Setting {
    return {
      ...row,
      privateKeyPem: row.privateKeyPem ? '***' : null,
    };
  }

  async saveSettings(companyId: string, dto: Record<string, unknown>) {
    const allowed = [
      'memoryId',
      'economicCode',
      'apiBaseUrl',
      'privateKeyPem',
      'clientId',
      'isEnabled',
      'isSandbox',
    ];

    const sets: string[] = [];
    const values: unknown[] = [companyId];

    for (const column of allowed) {
      if (dto[column] === undefined) continue;
      // مقدار پوشانده برنمی‌گردد روی کلید واقعی بنویسد.
      if (column === 'privateKeyPem' && dto[column] === '***') continue;

      values.push(dto[column] === '' ? null : dto[column]);
      sets.push(`"${column}" = $${values.length}`);
    }

    if (!sets.length) return this.settings(companyId);

    // خروج از حالت آزمایشی بدون کلید و شناسه یعنی هر ارسالی شکست می‌خورد
    // و کاربر نمی‌فهمد چرا.
    const merged = { ...(await this.rawSettings(companyId)), ...dto };

    if (merged.isEnabled === true && merged.isSandbox === false) {
      if (!merged.memoryId || !merged.privateKeyPem) {
        throw new BadRequestException(
          'برای ارسال واقعی، شناسهٔ حافظه و کلید خصوصی لازم است',
        );
      }
    }

    await this.db.query(
      `INSERT INTO "TaxSetting" ("companyId") VALUES ($1)
       ON CONFLICT ("companyId") DO NOTHING`,
      [companyId],
    );

    await this.db.query(
      `UPDATE "TaxSetting" SET ${sets.join(', ')}, "updatedAt" = now()
        WHERE "companyId" = $1`,
      values,
    );

    return this.settings(companyId);
  }

  private async rawSettings(companyId: string): Promise<Setting> {
    const [row] = await this.db.query<Setting>(
      'SELECT * FROM "TaxSetting" WHERE "companyId" = $1',
      [companyId],
    );
    return row;
  }

  // ------------------------------------------------------------ صف

  /**
   * افزودن فاکتور به صف.
   *
   * شمارهٔ مالیاتی همین‌جا و یک‌بار ساخته می‌شود: بعداً ساختنش یعنی شمارهٔ
   * روی رسیدِ چاپ‌شده با آنچه به سازمان می‌رود فرق کند.
   *
   * سریال با `UPDATE … RETURNING` اتمیک برداشته می‌شود، نه با شمارش سطرها
   * — دو فروش هم‌زمان با شمارش، یک شماره می‌گیرند.
   */
  async enqueue(companyId: string, saleId: string) {
    const setting = await this.rawSettings(companyId);

    if (!setting?.isEnabled) {
      throw new BadRequestException('ارسال مالیاتی فعال نیست');
    }

    if (!setting.memoryId) {
      throw new BadRequestException('شناسهٔ حافظهٔ مالیاتی تنظیم نشده است');
    }

    const [sale] = await this.db.query<{
      id: string;
      invoiceNo: string;
      total: string;
      createdAt: Date;
      status: string;
    }>(
      `SELECT id, "invoiceNo", total, "createdAt", status
         FROM "Sale" WHERE id = $1 AND "companyId" = $2`,
      [saleId, companyId],
    );

    if (!sale) throw new NotFoundException('فاکتور یافت نشد');

    if (sale.status === 'CANCELLED') {
      throw new BadRequestException('فاکتور لغوشده ارسال نمی‌شود');
    }

    const [existing] = await this.db.query<Row & { id: string }>(
      'SELECT * FROM "TaxInvoice" WHERE "saleId" = $1',
      [saleId],
    );

    // ارسال دوباره فقط با وضعیت شکست‌خورده معنا دارد؛ صورتحسابی که
    // سازمان تأیید کرده نباید دوباره برود.
    if (existing) {
      if (existing.status === 'FAILED' || existing.status === 'REJECTED') {
        await this.db.query(
          `UPDATE "TaxInvoice"
              SET status = 'QUEUED', attempts = 0, "lastError" = NULL,
                  "updatedAt" = now()
            WHERE id = $1`,
          [existing.id],
        );
        return { id: existing.id, taxId: existing.taxId, requeued: true };
      }

      return { id: existing.id, taxId: existing.taxId, requeued: false };
    }

    const [counter] = await this.db.query<{ serial: string }>(
      `UPDATE "TaxSetting" SET serial = serial + 1, "updatedAt" = now()
        WHERE "companyId" = $1 RETURNING serial`,
      [companyId],
    );

    const taxId = buildTaxId({
      memoryId: setting.memoryId,
      serial: Number(counter.serial),
      issuedAt: new Date(sale.createdAt),
    });

    const id = randomUUID();
    const payload = await this.buildPayload(companyId, saleId, taxId);

    await this.db.query(
      `INSERT INTO "TaxInvoice" (id, "companyId", "saleId", "taxId", payload)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, companyId, saleId, taxId, JSON.stringify(payload)],
    );

    await this.db.query('UPDATE "Sale" SET "taxInvoiceId" = $1 WHERE id = $2', [
      id,
      saleId,
    ]);

    return { id, taxId, requeued: false };
  }

  /**
   * ساخت بستهٔ صورتحساب.
   *
   * ساختار بر پایهٔ الگوی «فروش» سامانهٔ مؤدیان است.  نام میدان‌ها پیش از
   * ارسال واقعی باید با مستندات نسخهٔ جاری تطبیق داده شود؛ به همین دلیل
   * بسته **ذخیره** می‌شود تا بشود دید دقیقاً چه ساخته شده.
   */
  private async buildPayload(companyId: string, saleId: string, taxId: string) {
    const [sale] = await this.db.query<{
      invoiceNo: string;
      createdAt: Date;
      subtotal: string;
      discount: string;
      tax: string;
      total: string;
      customerId: string | null;
    }>('SELECT * FROM "Sale" WHERE id = $1', [saleId]);

    const items = await this.db.query<{
      productId: string;
      name: string;
      quantity: string;
      price: string;
      discount: string;
      total: string;
      unit: string | null;
    }>(
      `SELECT i."productId", p.name, i.quantity, i.price, i.discount, i.total,
              p.unit
         FROM "SaleItem" i JOIN "Product" p ON p.id = i."productId"
        WHERE i."saleId" = $1`,
      [saleId],
    );

    const [company] = await this.db.query<{
      taxNumber: string | null;
      legalName: string | null;
      name: string;
    }>('SELECT name, "legalName", "taxNumber" FROM "Company" WHERE id = $1', [
      companyId,
    ]);

    const [customer] = sale.customerId
      ? await this.db.query<{
          firstName: string;
          lastName: string | null;
          nationalCode: string | null;
        }>('SELECT * FROM "Customer" WHERE id = $1', [sale.customerId])
      : [null];

    return {
      header: {
        taxid: taxId,
        indatim: new Date(sale.createdAt).getTime(),
        inty: 1,
        inno: sale.invoiceNo,
        ins: 1,
        tins: company?.taxNumber ?? null,
        tob: 1,
        // خریدار حقیقی بدون کد ملی، طبق مقررات «مصرف‌کنندهٔ نهایی» است.
        bid: customer?.nationalCode ?? null,
        bpc: null,
        tprdis: Number(sale.discount ?? 0),
        tdis: Number(sale.discount ?? 0),
        tadis: Number(sale.subtotal) - Number(sale.discount ?? 0),
        tvam: Number(sale.tax ?? 0),
        tbill: Number(sale.total),
      },
      body: items.map((item, index) => ({
        sstid: item.productId,
        sstt: item.name,
        mu: item.unit ?? 'عدد',
        am: Number(item.quantity),
        fee: Number(item.price),
        prdis: Number(item.quantity) * Number(item.price),
        dis: Number(item.discount ?? 0),
        adis: Number(item.total),
        vra: 0,
        vam: 0,
        tsstam: Number(item.total),
        _row: index + 1,
      })),
      meta: {
        seller: company?.legalName ?? company?.name,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  // ------------------------------------------------------- کارگر ارسال

  /**
   * ارسال سطرهای در صف.
   *
   * در حالت آزمایشی چیزی به بیرون نمی‌رود ولی همهٔ مسیر — برداشتن از صف،
   * ثبت لاگ، تغییر وضعیت — اجرا می‌شود.  یعنی راه‌اندازی کامل قابل آزمودن
   * است بی‌آنکه دادهٔ آزمایشی به سازمان برسد.
   */
  async processQueue(companyId: string, limit = 20) {
    const setting = await this.rawSettings(companyId);
    if (!setting?.isEnabled) return { processed: 0, sent: 0, failed: 0 };

    const queued = await this.db.query<{
      id: string;
      taxId: string;
      attempts: number;
      payload: unknown;
    }>(
      `SELECT t.id, t."taxId", t.attempts, t.payload
         FROM "TaxInvoice" t
         JOIN "Sale" s ON s.id = t."saleId"
        WHERE t."companyId" = $1
          AND t.status = 'QUEUED'
          AND s.status NOT IN ('CANCELLED', 'RETURNED')
        ORDER BY t."createdAt"
        LIMIT ${Math.min(Number(limit) || 20, 100)}`,
      [companyId],
    );

    let sent = 0;
    let failed = 0;

    for (const row of queued) {
      await this.db.query(
        `UPDATE "TaxInvoice" SET status = 'SENDING', attempts = attempts + 1,
                                 "updatedAt" = now()
          WHERE id = $1`,
        [row.id],
      );

      try {
        const result = setting.isSandbox
          ? { referenceNo: `SANDBOX-${row.taxId}`, httpStatus: 200 }
          : await this.send(setting, row.payload);

        await this.db.query(
          `UPDATE "TaxInvoice"
              SET status = 'SENT', "referenceNo" = $1, "sentAt" = now(),
                  "lastError" = NULL, "updatedAt" = now()
            WHERE id = $2`,
          [result.referenceNo, row.id],
        );

        await this.log(companyId, row.id, 'SEND', result.httpStatus, result);
        sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // پس از سقف تلاش، سطر شکست‌خورده می‌شود: تکرار بی‌پایان یک خطای
        // دائمی، فقط صف را می‌بندد و خطاهای واقعی را پنهان می‌کند.
        const nextStatus =
          row.attempts + 1 >= MAX_ATTEMPTS ? 'FAILED' : 'QUEUED';

        await this.db.query(
          `UPDATE "TaxInvoice" SET status = $1, "lastError" = $2,
                                   "updatedAt" = now()
            WHERE id = $3`,
          [nextStatus, message.slice(0, 500), row.id],
        );

        await this.log(companyId, row.id, 'ERROR', null, { message });
        failed += 1;
      }
    }

    return { processed: queued.length, sent, failed };
  }

  /**
   * ارسال واقعی.
   *
   * عمداً جدا و کوچک نگه داشته شده: این تنها جایی است که به مشخصات دقیق
   * سامانه و کلید خصوصی وابسته است، و تا تأیید نشود بقیهٔ ماژول نباید به
   * آن گره بخورد.
   */
  private async send(
    setting: Setting,
    payload: unknown,
  ): Promise<{ referenceNo: string; httpStatus: number }> {
    if (!setting.privateKeyPem) {
      throw new Error('کلید خصوصی تنظیم نشده است');
    }

    const response = await fetch(`${setting.apiBaseUrl}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(setting.clientId ? { 'x-client-id': setting.clientId } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    const data = (await response.json().catch(() => null)) as
      | { referenceNumber?: string; result?: Array<{ referenceNumber?: string }> }
      | null;

    if (!response.ok) {
      throw new Error(`سامانه پاسخ ${response.status} داد`);
    }

    const referenceNo =
      data?.referenceNumber ?? data?.result?.[0]?.referenceNumber ?? null;

    if (!referenceNo) {
      throw new Error('پاسخ سامانه شمارهٔ پیگیری نداشت');
    }

    return { referenceNo, httpStatus: response.status };
  }

  private async log(
    companyId: string,
    taxInvoiceId: string,
    action: string,
    httpStatus: number | null,
    response: unknown,
  ) {
    await this.db.query(
      `INSERT INTO "TaxInvoiceLog"
         (id, "companyId", "taxInvoiceId", action, "httpStatus", response)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        randomUUID(),
        companyId,
        taxInvoiceId,
        action,
        httpStatus,
        JSON.stringify(response),
      ],
    );
  }

  // ------------------------------------------------------------ گزارش

  async list(companyId: string, status?: string) {
    const values: unknown[] = [companyId];
    let filter = '';

    if (status) {
      values.push(status);
      filter = ` AND t.status = $${values.length}`;
    }

    return this.db.query<Row>(
      `SELECT t.id, t."taxId", t.status, t."referenceNo", t.attempts,
              t."lastError", t."sentAt", t."createdAt",
              s."invoiceNo", s.total, s."createdAt" AS "saleDate"
         FROM "TaxInvoice" t
         JOIN "Sale" s ON s.id = t."saleId"
        WHERE t."companyId" = $1${filter}
        ORDER BY t."createdAt" DESC
        LIMIT 500`,
      values,
    );
  }

  async stats(companyId: string) {
    const [row] = await this.db.query<Record<string, string>>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'QUEUED')    AS queued,
         COUNT(*) FILTER (WHERE status = 'SENT')      AS sent,
         COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed,
         COUNT(*) FILTER (WHERE status IN ('FAILED','REJECTED')) AS failed,
         (SELECT COUNT(*) FROM "Sale" s
           WHERE s."companyId" = $1 AND s.status <> 'CANCELLED'
             AND s."taxInvoiceId" IS NULL) AS "notQueued"
        FROM "TaxInvoice" WHERE "companyId" = $1`,
      [companyId],
    );

    return {
      queued: Number(row?.queued ?? 0),
      sent: Number(row?.sent ?? 0),
      confirmed: Number(row?.confirmed ?? 0),
      failed: Number(row?.failed ?? 0),
      // فاکتورهایی که هنوز وارد صف نشده‌اند — مهم‌ترین عدد این صفحه، چون
      // چیزی که در صف نیست، هرگز به سازمان نمی‌رسد.
      notQueued: Number(row?.notQueued ?? 0),
    };
  }

  /** افزودن گروهی فاکتورهای ارسال‌نشده به صف. */
  async enqueuePending(companyId: string, limit = 100) {
    const pending = await this.db.query<{ id: string }>(
      `SELECT id FROM "Sale"
        WHERE "companyId" = $1 AND status <> 'CANCELLED'
          AND "taxInvoiceId" IS NULL
        ORDER BY "createdAt"
        LIMIT ${Math.min(Number(limit) || 100, 500)}`,
      [companyId],
    );

    let added = 0;
    const errors: string[] = [];

    for (const sale of pending) {
      try {
        await this.enqueue(companyId, sale.id);
        added += 1;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    return { added, skipped: pending.length - added, errors: errors.slice(0, 5) };
  }
}
