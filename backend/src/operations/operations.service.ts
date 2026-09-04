import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { fingerprint, isWorthRecording } from './fingerprint';

/**
 * عملیات: ثبت خطا، سلامت نصب، و پشتیبانی از راه دور.
 *
 * سه چیزی که یک سامانهٔ نصب‌شده در فروشگاه لازم دارد و تا امروز نداشت.
 * بدون این‌ها، تنها راه فهمیدن اینکه چیزی خراب شده، تماس مشتری است — و
 * تا آن تماس، هفته‌ها می‌گذرد.
 */

type Row = Record<string, unknown>;

/** خطاها گروه می‌شوند؛ فهرست هزارتایی را کسی نمی‌خواند. */
@Injectable()
export class OperationsService {
  constructor(private readonly db: DatabaseService) {}

  // ------------------------------------------------------------ خطا

  /**
   * ثبت یک خطا.
   *
   * **هرگز پرتاب نمی‌کند.**  این تابع از داخل فیلتر خطا صدا زده می‌شود؛
   * اگر خودش خطا بدهد، پاسخ کاربر هم می‌شکند و یک مشکل کوچک به یک صفحهٔ
   * سفید تبدیل می‌شود.
   */
  async record(input: {
    companyId?: string | null;
    message: string;
    statusCode: number;
    path?: string;
    method?: string;
    stack?: string;
    userId?: string | null;
  }): Promise<void> {
    if (!isWorthRecording(input.statusCode)) return;

    try {
      const key = fingerprint({
        message: input.message,
        path: input.path,
        statusCode: input.statusCode,
      });

      // درج-یا-افزایش در یک رفت‌وبرگشت.  خواندن و بعد نوشتن، در بار
      // زیاد دو سطر موازی می‌سازد و شمارنده را می‌شکند.
      await this.db.query(
        `INSERT INTO "ErrorGroup"
           (id, "companyId", fingerprint, message, "statusCode", path, method,
            "lastStack", "lastUserId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (COALESCE("companyId", ''), fingerprint) DO UPDATE
           SET count = "ErrorGroup".count + 1,
               "lastSeenAt" = now(),
               "lastStack" = EXCLUDED."lastStack",
               "lastUserId" = EXCLUDED."lastUserId",
               "updatedAt" = now(),
               -- خطایی که دوباره رخ داده، دیگر «حل‌شده» نیست.
               status = CASE WHEN "ErrorGroup".status = 'RESOLVED'
                             THEN 'OPEN' ELSE "ErrorGroup".status END`,
        [
          randomUUID(),
          input.companyId ?? null,
          key,
          String(input.message ?? '').slice(0, 500),
          input.statusCode,
          input.path?.slice(0, 200) ?? null,
          input.method ?? null,
          input.stack?.slice(0, 4000) ?? null,
          input.userId ?? null,
        ],
      );
    } catch {
      // ثبت خطا نباید خودش خطا بدهد.  اگر جدول نباشد یا دیتابیس قطع
      // باشد، سکوت درست‌ترین کار است — کاربر پاسخش را می‌گیرد.
    }
  }

  async errors(companyId: string, status = 'OPEN') {
    return this.db.query<Row>(
      `SELECT * FROM "ErrorGroup"
        WHERE ("companyId" = $1 OR "companyId" IS NULL)
          AND ($2 = 'ALL' OR status = $2)
        ORDER BY "lastSeenAt" DESC
        LIMIT 200`,
      [companyId, status],
    );
  }

  async setErrorStatus(companyId: string, id: string, status: string, note?: string) {
    const allowed = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'IGNORED'];

    if (!allowed.includes(status)) {
      throw new BadRequestException('وضعیت نامعتبر است');
    }

    const rows = await this.db.query<Row>(
      `UPDATE "ErrorGroup" SET status = $1, note = COALESCE($2, note),
                               "updatedAt" = now()
        WHERE id = $3 AND ("companyId" = $4 OR "companyId" IS NULL)
        RETURNING *`,
      [status, note ?? null, id, companyId],
    );

    if (!rows[0]) throw new NotFoundException('خطا یافت نشد');
    return rows[0];
  }

  // --------------------------------------------------------- سلامت

  /**
   * عکس لحظه‌ای از وضعیت نصب.
   *
   * چیزهایی سنجیده می‌شوند که **خرابی‌شان دیر معلوم می‌شود**: پشتیبانی که
   * سه هفته است ساخته نشده، خطایی که هر روز تکرار می‌شود، فاکتوری که در
   * صف مالیاتی گیر کرده.  چیزی که فوراً معلوم می‌شود — مثل قطع بودن
   * سرور — به این گزارش نیازی ندارد.
   */
  async snapshot(companyId: string) {
    const [metrics] = await this.db.query<Record<string, string>>(
      `SELECT
         (SELECT COUNT(*) FROM "ErrorGroup"
           WHERE status = 'OPEN'
             AND "lastSeenAt" > now() - interval '24 hours') AS "errors24h",
         (SELECT COALESCE(SUM(count), 0) FROM "ErrorGroup"
           WHERE status = 'OPEN'
             AND "lastSeenAt" > now() - interval '24 hours') AS "errorHits24h",
         (SELECT COUNT(*) FROM "Sale"
           WHERE "companyId" = $1 AND "createdAt" > now() - interval '24 hours')
             AS "sales24h",
         (SELECT COUNT(*) FROM "Product"
           WHERE "companyId" = $1 AND status = 'ACTIVE') AS products,
         (SELECT COUNT(*) FROM "Inventory" i
            JOIN "Product" p ON p.id = i."productId"
           WHERE p."companyId" = $1 AND i.quantity < 0) AS "negativeStock",
         (SELECT COUNT(*) FROM "CashierShift"
           WHERE "companyId" = $1 AND "endedAt" IS NULL
             AND "startedAt" < now() - interval '24 hours') AS "staleShifts",
         (SELECT COUNT(*) FROM "TaxInvoice"
           WHERE "companyId" = $1 AND status IN ('FAILED','REJECTED')) AS "taxFailed",
         (SELECT COUNT(*) FROM "ParkedSale"
           WHERE "companyId" = $1 AND "createdAt" < now() - interval '7 days')
             AS "staleParked"`,
      [companyId],
    );

    const value = (key: string) => Number(metrics?.[key] ?? 0);

    /**
     * شدت.
     *
     * موجودی منفی بحرانی است چون یعنی حساب انبار از واقعیت جدا شده و هر
     * گزارشی از آن به بعد غلط است.  شیفت باز مانده هم بحرانی است: تا
     * بسته نشود، کسری صندوق معلوم نمی‌شود.
     */
    const critical = value('negativeStock') > 0 || value('staleShifts') > 0;
    const warn =
      value('errors24h') > 0 || value('taxFailed') > 0 || value('staleParked') > 0;

    const severity = critical ? 'CRITICAL' : warn ? 'WARN' : 'OK';

    const payload = {
      errors24h: value('errors24h'),
      errorHits24h: value('errorHits24h'),
      sales24h: value('sales24h'),
      products: value('products'),
      negativeStock: value('negativeStock'),
      staleShifts: value('staleShifts'),
      taxFailed: value('taxFailed'),
      staleParked: value('staleParked'),
    };

    await this.db.query(
      `INSERT INTO "HealthSnapshot" (id, "companyId", version, metrics, severity)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        randomUUID(),
        companyId,
        process.env.APP_VERSION ?? null,
        JSON.stringify(payload),
        severity,
      ],
    );

    return { severity, metrics: payload };
  }

  async healthHistory(companyId: string) {
    return this.db.query<Row>(
      `SELECT * FROM "HealthSnapshot"
        WHERE "companyId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 60`,
      [companyId],
    );
  }

  // ------------------------------------------------ پشتیبانی از راه دور

  /**
   * ساخت جلسهٔ پشتیبانی.
   *
   * سه قید که این را از یک درِ پشتی جدا می‌کند:
   *   • کد را **صاحب فروشگاه** می‌سازد، نه پشتیبان
   *   • خودش منقضی می‌شود، حتی اگر کسی یادش برود ببندد
   *   • دسترسی پیش‌فرض فقط خواندن است
   */
  async grantSupport(
    companyId: string,
    userId: string,
    dto: { minutes?: number; scope?: string; reason?: string },
  ) {
    const minutes = Math.min(Math.max(Number(dto.minutes ?? 30), 5), 240);
    const scope = dto.scope === 'WRITE' ? 'WRITE' : 'READ';

    // کد شش‌رقمی: کاربر آن را تلفنی می‌خواند.  حروف داخلش نیست چون
    // «B» و «P» در تلفن اشتباه شنیده می‌شوند.
    let code = '';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(
        6,
        '0',
      );

      const [taken] = await this.db.query<{ id: string }>(
        'SELECT id FROM "SupportSession" WHERE code = $1 AND "expiresAt" > now()',
        [candidate],
      );

      if (!taken) {
        code = candidate;
        break;
      }
    }

    if (!code) throw new BadRequestException('ساخت کد ممکن نشد');

    const expiresAt = new Date(Date.now() + minutes * 60_000);

    await this.db.query(
      `INSERT INTO "SupportSession"
         (id, "companyId", code, scope, "grantedBy", reason, "expiresAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), companyId, code, scope, userId, dto.reason ?? null, expiresAt],
    );

    return { code, scope, expiresAt: expiresAt.toISOString(), minutes };
  }

  async supportSessions(companyId: string) {
    return this.db.query<Row>(
      `SELECT id, code, scope, reason, "expiresAt", "usedAt", "revokedAt",
              "supportName", "createdAt",
              ("expiresAt" > now() AND "revokedAt" IS NULL) AS "isActive"
         FROM "SupportSession"
        WHERE "companyId" = $1
        ORDER BY "createdAt" DESC
        LIMIT 50`,
      [companyId],
    );
  }

  /** لغو فوری — صاحب فروشگاه باید هر لحظه بتواند در را ببندد. */
  async revokeSupport(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      `UPDATE "SupportSession" SET "revokedAt" = now()
        WHERE id = $1 AND "companyId" = $2 AND "revokedAt" IS NULL
        RETURNING *`,
      [id, companyId],
    );

    if (!rows[0]) throw new NotFoundException('جلسه یافت نشد یا از قبل بسته است');
    return rows[0];
  }
}
