import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { applyStockDelta } from './inventory.service';

/**
 * انبارگردانی (شمارش فیزیکی) و کاردکس.
 *
 * منطق اصلی: مقدار سیستمی در لحظهٔ *باز شدن* شمارش قفل می‌شود.  اگر بین
 * شمارش و اعمال فروشی اتفاق بیفتد، اختلافِ ثبت‌شده همچنان همان چیزی است که
 * انباردار دیده — وگرنه فروشِ میانی به‌حساب «کسری انبار» نوشته می‌شود و
 * انباردار بی‌گناه پاسخگو می‌شود.
 */
@Injectable()
export class StockCountService {
  constructor(private readonly db: DatabaseService) {}

  /** کاردکس یک کالا در یک انبار — چرا موجودی این عدد است. */
  async kardex(
    companyId: string,
    productId: string,
    warehouseId?: string,
    limit = 100,
  ) {
    const values: unknown[] = [companyId, productId];
    let where = 'm."companyId" = $1 AND m."productId" = $2';

    if (warehouseId) {
      values.push(warehouseId);
      where += ` AND m."warehouseId" = $${values.length}`;
    }

    values.push(Math.min(Number(limit) || 100, 500));

    return this.db.query(
      // نام کاربر در دو ستون جدا نگه‌داری می‌شود، مثل Customer.
      `SELECT m.*, w.name AS "warehouseName",
              NULLIF(TRIM(CONCAT_WS(' ', u."firstName", u."lastName")), '')
                AS "userName"
         FROM "StockMovement" m
         LEFT JOIN "Warehouse" w ON w.id = m."warehouseId"
         LEFT JOIN "User" u      ON u.id = m."userId"
        WHERE ${where}
        ORDER BY m."createdAt" DESC
        LIMIT $${values.length}`,
      values,
    );
  }

  async list(companyId: string) {
    return this.db.query(
      `SELECT c.*, w.name AS "warehouseName",
              (SELECT COUNT(*) FROM "StockCountLine" l WHERE l."countId" = c.id) AS "lineCount"
         FROM "StockCount" c
         LEFT JOIN "Warehouse" w ON w.id = c."warehouseId"
        WHERE c."companyId" = $1
        ORDER BY c."createdAt" DESC
        LIMIT 100`,
      [companyId],
    );
  }

  /**
   * باز کردن شمارش: همهٔ اقلام موجودِ انبار با مقدار سیستمی فعلی ثبت می‌شوند.
   * نمایهٔ جزئی «یک شمارش باز به ازای هر انبار» جلوی شمارش موازی را می‌گیرد.
   */
  async open(
    companyId: string,
    userId: string,
    dto: { warehouseId: string; note?: string },
  ) {
    return this.db.transaction(async (tx) => {
      const warehouse = await tx.query(
        'SELECT id FROM "Warehouse" WHERE id = $1 AND "companyId" = $2',
        [dto.warehouseId, companyId],
      );
      if (!warehouse.rows[0]) throw new NotFoundException('انبار یافت نشد');

      const seq = await tx.query<{ n: string | null }>(
        `SELECT MAX(NULLIF(regexp_replace("countNo", '\\D', '', 'g'), '')::bigint) AS n
           FROM "StockCount" WHERE "companyId" = $1`,
        [companyId],
      );
      const countNo = `SC-${String(Number(seq.rows[0]?.n ?? 0) + 1).padStart(5, '0')}`;
      const id = randomUUID();

      let header;
      try {
        header = await tx.query(
          `INSERT INTO "StockCount"
             (id, "companyId", "warehouseId", "countNo", status, note, "userId")
           VALUES ($1,$2,$3,$4,'OPEN',$5,$6) RETURNING *`,
          [id, companyId, dto.warehouseId, countNo, dto.note ?? null, userId],
        );
      } catch (error) {
        // نمایهٔ جزئیِ «یک شمارش باز» — پیام خام دیتابیس برای کاربر بی‌معناست.
        if ((error as { code?: string }).code === '23505') {
          throw new BadRequestException(
            'برای این انبار یک انبارگردانی باز وجود دارد؛ اول آن را اعمال یا لغو کنید',
          );
        }
        throw error;
      }

      await tx.query(
        `INSERT INTO "StockCountLine" (id, "countId", "productId", "systemQty")
         SELECT gen_random_uuid()::text, $1, i."productId", i.quantity
           FROM "Inventory" i
          WHERE i."warehouseId" = $2`,
        [id, dto.warehouseId],
      );

      // اقلام همراه سربرگ برگردانده می‌شوند: فراخوان تازه شمارش را باز
      // کرده و بلافاصله به فهرست اقلام نیاز دارد؛ برگرداندن سربرگِ تنها
      // یعنی هر کلاینت باید فوراً یک درخواست دیگر بزند.
      const lines = await tx.query(
        `SELECT l.*, p.name AS "productName", p.sku AS "productSku",
                p.unit AS "productUnit"
           FROM "StockCountLine" l
           JOIN "Product" p ON p.id = l."productId"
          WHERE l."countId" = $1
          ORDER BY p.name`,
        [id],
      );

      return { ...header.rows[0], lines: lines.rows };
    });
  }

  async detail(companyId: string, countId: string) {
    const header = await this.db.query(
      `SELECT c.*, w.name AS "warehouseName"
         FROM "StockCount" c
         LEFT JOIN "Warehouse" w ON w.id = c."warehouseId"
        WHERE c.id = $1 AND c."companyId" = $2`,
      [countId, companyId],
    );
    if (!header[0]) throw new NotFoundException('انبارگردانی یافت نشد');

    const lines = await this.db.query(
      `SELECT l.*, p.name AS "productName", p.sku AS "productSku", p.unit AS "productUnit"
         FROM "StockCountLine" l
         JOIN "Product" p ON p.id = l."productId"
        WHERE l."countId" = $1
        ORDER BY p.name`,
      [countId],
    );

    return { ...header[0], lines };
  }

  /** ثبت مقدار شمرده‌شده برای یک قلم. */
  async setCounted(
    companyId: string,
    countId: string,
    lineId: string,
    countedQty: number,
  ) {
    if (!Number.isFinite(countedQty) || countedQty < 0) {
      throw new BadRequestException('مقدار شمرده‌شده نامعتبر است');
    }

    const rows = await this.db.query(
      `UPDATE "StockCountLine" l
          SET "countedQty" = $1
         FROM "StockCount" c
        WHERE l.id = $2 AND l."countId" = c.id
          AND c.id = $3 AND c."companyId" = $4 AND c.status = 'OPEN'
        RETURNING l.*`,
      [countedQty, lineId, countId, companyId],
    );

    if (!rows[0]) {
      throw new BadRequestException('قلم یافت نشد یا انبارگردانی باز نیست');
    }
    return rows[0];
  }

  /**
   * اعمال: برای هر قلمِ شمرده‌شده که با سیستم اختلاف دارد، یک حرکت COUNT
   * ثبت می‌شود.  اقلامِ شمرده‌نشده دست‌نخورده می‌مانند — «نشمردم» با
   * «صفر شمردم» یکی نیست.
   */
  async apply(companyId: string, userId: string, countId: string) {
    return this.db.transaction(async (tx) => {
      const header = await tx.query<{ warehouseId: string; countNo: string }>(
        `UPDATE "StockCount"
            SET status = 'APPLIED', "appliedAt" = now(), "updatedAt" = now()
          WHERE id = $1 AND "companyId" = $2 AND status = 'OPEN'
          RETURNING "warehouseId", "countNo"`,
        [countId, companyId],
      );

      if (!header.rows[0]) {
        throw new BadRequestException('انبارگردانی یافت نشد یا قبلاً اعمال شده است');
      }

      const { warehouseId, countNo } = header.rows[0];

      const lines = await tx.query<{
        productId: string;
        systemQty: string;
        countedQty: string | null;
      }>(
        `SELECT "productId", "systemQty", "countedQty"
           FROM "StockCountLine" WHERE "countId" = $1 AND "countedQty" IS NOT NULL`,
        [countId],
      );

      let applied = 0;
      let surplus = 0;
      let shortage = 0;

      for (const line of lines.rows) {
        const delta = Number(line.countedQty) - Number(line.systemQty);
        if (delta === 0) continue;

        const row = await applyStockDelta(
          tx,
          warehouseId,
          line.productId,
          delta,
          {
            companyId,
            reason: 'COUNT',
            refType: 'STOCK_COUNT',
            refId: countId,
            userId,
            note: countNo,
          },
        );

        if (!row) {
          throw new BadRequestException(
            'اعمال انبارگردانی موجودی را منفی می‌کند؛ مقادیر را بررسی کنید',
          );
        }

        applied += 1;
        if (delta > 0) surplus += delta;
        else shortage += -delta;
      }

      return { countNo, applied, surplus, shortage };
    });
  }

  async cancel(companyId: string, countId: string) {
    const rows = await this.db.query(
      `UPDATE "StockCount" SET status = 'CANCELLED', "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2 AND status = 'OPEN' RETURNING *`,
      [countId, companyId],
    );
    if (!rows[0]) {
      throw new BadRequestException('انبارگردانی یافت نشد یا باز نیست');
    }
    return rows[0];
  }
}
