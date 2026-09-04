import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  customerName: string | null;
};

type Summary = { average: number | null; count: number };

/**
 * نظر و امتیازِ کالا.
 *
 * ⚠️ فقط خریدارِ **تحویل‌گرفته** می‌تواند نظر بدهد.
 *
 *    این تنها چیزی است که نظر را از تبلیغ جدا می‌کند.  بدونش، رقیب
 *    یا صاحبِ فروشگاه می‌تواند بی‌نهایت حساب بسازد و امتیاز را هر
 *    جور می‌خواهد بچیند — و آن‌وقت ستاره‌ها هیچ معنایی ندارند.
 *
 *    «سفارش ثبت شده» کافی نیست: سفارشِ لغوشده هم ثبت شده.  معیار
 *    `DELIVERED` است، یعنی کالا واقعاً به دستش رسیده.
 */
@Injectable()
export class ReviewService {
  constructor(private readonly db: DatabaseService) {}

  /** خلاصهٔ امتیاز برای نمایش کنارِ نامِ کالا. */
  async summary(companyId: string, productId: string): Promise<Summary> {
    const rows = await this.db.query<{ avg: string | null; n: string }>(
      `SELECT AVG(rating)::numeric(3,2)::text AS avg, COUNT(*)::text AS n
         FROM "ProductReview"
        WHERE "companyId" = $1 AND "productId" = $2 AND approved = true`,
      [companyId, productId],
    );

    return {
      // ⚠️ تهی می‌ماند، نه صفر.  «۰ از ۵» یعنی کالای بد؛ «بدونِ نظر»
      //    یعنی هنوز کسی نظر نداده.  دو چیزِ کاملاً متفاوت.
      average: rows[0]?.avg ? Number(rows[0].avg) : null,
      count: Number(rows[0]?.n ?? 0),
    };
  }

  /** نظرهای تأییدشدهٔ یک کالا — عمومی. */
  async list(companyId: string, productId: string) {
    return this.db.query<ReviewRow>(
      `SELECT r.id, r.rating, r.comment, r."createdAt",
              -- نامِ خانوادگی نمی‌آید: نظرِ عمومی نباید هویتِ کامل را
              -- لو بدهد.
              c."firstName" AS "customerName"
         FROM "ProductReview" r
         LEFT JOIN "Customer" c ON c.id = r."customerId"
        WHERE r."companyId" = $1 AND r."productId" = $2 AND r.approved = true
        ORDER BY r."createdAt" DESC
        LIMIT 50`,
      [companyId, productId],
    );
  }

  /**
   * ثبت یا ویرایشِ نظر.
   *
   * ⚠️ `ON CONFLICT` به‌جای بررسیِ «قبلاً نظر داده؟».
   *
   *    بررسیِ جدا مسابقه دارد: دو درخواستِ هم‌زمان هر دو رد می‌شدند و
   *    دو رکورد می‌ساختند.  قیدِ یکتا در پایگاه داده این را حل می‌کند.
   *
   * ⚠️ ویرایش، تأیید را **پس می‌گیرد**.
   *
   *    وگرنه کسی نظرِ بی‌آزار می‌نوشت، تأیید می‌گرفت، و بعد متنش را به
   *    تبلیغ عوض می‌کرد.
   */
  async upsert(
    companyId: string,
    productId: string,
    customerId: string,
    input: { rating: number; comment?: string },
  ) {
    const rating = Math.round(Number(input.rating));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('امتیاز باید بین ۱ تا ۵ باشد');
    }

    const bought = await this.db.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM "OnlineOrderItem" i
         JOIN "OnlineOrder" o ON o.id = i."orderId"
        WHERE o."companyId" = $1
          AND o."customerId" = $2
          AND i."productId" = $3
          AND o.status = 'DELIVERED'`,
      [companyId, customerId, productId],
    );

    if (Number(bought[0]?.n ?? 0) === 0) {
      throw new BadRequestException(
        'فقط خریدارانی که کالا را تحویل گرفته‌اند می‌توانند نظر بدهند',
      );
    }

    const comment = (input.comment ?? '').trim().slice(0, 2000) || null;

    await this.db.query(
      `INSERT INTO "ProductReview"
         (id, "companyId", "productId", "customerId", rating, comment, approved)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       ON CONFLICT ("productId", "customerId")
       DO UPDATE SET rating = EXCLUDED.rating,
                     comment = EXCLUDED.comment,
                     approved = false,
                     "updatedAt" = now()`,
      [randomUUID(), companyId, productId, customerId, rating, comment],
    );

    return { ok: true, pending: true };
  }

  /** صفِ بررسیِ مدیر. */
  async pending(companyId: string) {
    return this.db.query(
      `SELECT r.id, r.rating, r.comment, r."createdAt",
              p.name AS "productName",
              c."firstName" AS "customerName"
         FROM "ProductReview" r
         JOIN "Product" p ON p.id = r."productId"
         LEFT JOIN "Customer" c ON c.id = r."customerId"
        WHERE r."companyId" = $1 AND r.approved = false
        ORDER BY r."createdAt" DESC
        LIMIT 200`,
      [companyId],
    );
  }

  /** تأیید یا رد — رد یعنی حذف، چون نگه داشتنش فایده‌ای ندارد. */
  async moderate(companyId: string, id: string, approve: boolean) {
    if (approve) {
      const done = await this.db.execute(
        `UPDATE "ProductReview" SET approved = true, "updatedAt" = now()
          WHERE id = $1 AND "companyId" = $2`,
        [id, companyId],
      );
      return { ok: done > 0 };
    }

    const done = await this.db.execute(
      'DELETE FROM "ProductReview" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    return { ok: done > 0 };
  }
}
