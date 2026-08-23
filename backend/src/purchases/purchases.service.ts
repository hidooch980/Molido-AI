import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { applyStockDelta } from '../inventory/inventory.service';
import {
  allocateFreight,
  inboundFreightEntry,
} from '../accounting/posting-rules';
import { PostingService } from '../accounting/posting.service';
import { purchaseEntry } from '../accounting/posting-rules';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

type Purchase = Record<string, unknown> & {
  id: string;
  status: string;
  warehouseId: string;
  purchaseNo: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
};
type PurchaseItem = Record<string, unknown> & {
  id: string;
  productId: string;
  quantity: string;
};

@Injectable()
export class PurchasesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly posting: PostingService,
  ) {}

  async findAll(companyId: string, status?: string) {
    const values: unknown[] = [companyId];
    let where = 'p."companyId" = $1';
    if (status) {
      values.push(status);
      where += ` AND p.status = $${values.length}`;
    }
    return this.db.query<Purchase>(
      `SELECT p.*, s.name AS "supplierName", w.name AS "warehouseName",
              (SELECT count(*)::int FROM "PurchaseItem" i WHERE i."purchaseId" = p.id) AS "itemsCount"
       FROM "Purchase" p
       LEFT JOIN "Supplier" s ON s.id = p."supplierId"
       LEFT JOIN "Warehouse" w ON w.id = p."warehouseId"
       WHERE ${where} ORDER BY p."createdAt" DESC`,
      values,
    );
  }

  async findOne(id: string, companyId: string) {
    const purchases = await this.db.query<Purchase>(
      'SELECT * FROM "Purchase" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!purchases[0]) throw new NotFoundException('فاکتور خرید یافت نشد');

    const [suppliers, warehouses, items] = await Promise.all([
      this.db.query('SELECT * FROM "Supplier" WHERE id = $1', [purchases[0].supplierId]),
      this.db.query('SELECT id, name FROM "Warehouse" WHERE id = $1', [
        purchases[0].warehouseId,
      ]),
      this.db.query<PurchaseItem>(
        `SELECT i.*,
                p.name AS "productName", p.sku AS "productSku", p.unit AS "productUnit",
                p."salePrice",
                p."expiryDate" AS "productExpiry",
                COALESCE(i."landedUnitCost", i."purchasePrice") AS "unitCost",
                (p."salePrice" - COALESCE(i."landedUnitCost", i."purchasePrice"))
                  AS "unitProfit",
                (p."salePrice" - COALESCE(i."landedUnitCost", i."purchasePrice")) * i.quantity
                  AS "lineProfit",
                CASE
                  WHEN COALESCE(i."landedUnitCost", i."purchasePrice") > 0
                  THEN ROUND(
                    (p."salePrice" - COALESCE(i."landedUnitCost", i."purchasePrice"))
                    / COALESCE(i."landedUnitCost", i."purchasePrice") * 100, 1)
                  ELSE NULL
                END AS "marginPercent"
         FROM "PurchaseItem" i JOIN "Product" p ON p.id = i."productId"
         WHERE i."purchaseId" = $1`,
        [id],
      ),
    ]);

    // خلاصهٔ سود کل فاکتور — همان چیزی که خریدار می‌خواهد ببیند پیش از
    // تأیید: «این خرید چقدر برایم می‌ماند».
    const profit = items.reduce(
      (acc, item) => {
        const line = Number((item as Record<string, unknown>).lineProfit ?? 0);
        const revenue = Number((item as Record<string, unknown>).salePrice ?? 0) *
          Number(item.quantity ?? 0);
        return {
          totalProfit: acc.totalProfit + line,
          totalRevenue: acc.totalRevenue + revenue,
          // قلمی که با قیمت فروش فعلی ضرر می‌دهد — باید همان لحظه
          // دیده شود، نه در گزارش ماه بعد.
          loseMoney: acc.loseMoney + (line < 0 ? 1 : 0),
        };
      },
      { totalProfit: 0, totalRevenue: 0, loseMoney: 0 },
    );

    return {
      ...purchases[0],
      profit: {
        ...profit,
        totalProfit: Math.round(profit.totalProfit),
        totalRevenue: Math.round(profit.totalRevenue),
        marginPercent:
          profit.totalRevenue > 0
            ? Math.round((profit.totalProfit / profit.totalRevenue) * 1000) / 10
            : null,
      },
      supplier: suppliers[0] ?? null,
      warehouse: warehouses[0] ?? null,
      items,
    };
  }

  /**
   * ثبتِ فاکتور خرید — با یکتاسازی و دریافتِ اختیاری.
   *
   * ⚠️ کلیدِ یکتاسازی **پیش از** هر کاری ثبت می‌شود، نه بعدش.
   *
   *    اگر بعد ثبت می‌شد، دو تلاشِ هم‌زمان هر دو از بررسی رد می‌شدند و
   *    دو فاکتور می‌ساختند — دقیقاً همان چیزی که قرار بود جلویش
   *    گرفته شود.  `ON CONFLICT DO NOTHING` این مسابقه را در خودِ
   *    پایگاه داده حل می‌کند، نه در کدِ ما.
   */
  async create(
    dto: CreatePurchaseDto,
    companyId: string,
  ): Promise<Awaited<ReturnType<PurchasesService['createInner']>>> {
    type Created = Awaited<ReturnType<PurchasesService['createInner']>>;

    const key = dto.idempotencyKey?.trim();
    if (!key) return this.createInner(dto, companyId);

    const claimed = await this.db.query<{ id: string }>(
      `INSERT INTO "IdempotencyKey" (id, "companyId", key, endpoint)
       VALUES ($1, $2, $3, 'POST /purchases')
       ON CONFLICT ("companyId", key) DO NOTHING
       RETURNING id`,
      [randomUUID(), companyId, key],
    );

    if (!claimed[0]) {
      // کلید از قبل هست: یا کار تمام شده و پاسخ ذخیره شده، یا هنوز
      // در جریان است.
      const rows = await this.db.query<{ response: unknown }>(
        `SELECT response FROM "IdempotencyKey"
          WHERE "companyId" = $1 AND key = $2`,
        [companyId, key],
      );

      // پاسخِ ذخیره‌شده همان چیزی است که اولین بار برگشت — عیناً
      // برگردانده می‌شود تا کلاینت فرقی بین بارِ اول و تلاشِ دوباره نبیند.
      const stored = rows[0]?.response;
      if (stored) return stored as Created;

      // ⚠️ ۴۰۹ می‌دهیم، نه اینکه دوباره بسازیم.
      //
      //    تلاشِ هم‌زمان با همان کلید یعنی همان کار در حال انجام است.
      //    ساختنِ دوباره‌اش همان فاکتورِ تکراری است.
      throw new ConflictException('همین درخواست در حال انجام است');
    }

    try {
      const created = await this.createInner(dto, companyId);

      await this.db.query(
        `UPDATE "IdempotencyKey" SET response = $1
          WHERE "companyId" = $2 AND key = $3`,
        [JSON.stringify(created), companyId, key],
      );

      return created;
    } catch (err) {
      // ⚠️ کلیدِ ناموفق آزاد می‌شود.
      //
      //    وگرنه فاکتوری که به‌خاطر یک خطای گذرا نشست، برای همیشه با
      //    همان کلید قابلِ ثبت نبود — و صف تا ابد ۴۰۹ می‌گرفت.
      await this.db
        .query('DELETE FROM "IdempotencyKey" WHERE "companyId" = $1 AND key = $2', [
          companyId,
          key,
        ])
        .catch(() => undefined);
      throw err;
    }
  }

  private async createInner(dto: CreatePurchaseDto, companyId: string) {
    const [suppliers, warehouses] = await Promise.all([
      this.db.query<{ id: string }>(
        'SELECT id FROM "Supplier" WHERE id = $1 AND "companyId" = $2',
        [dto.supplierId, companyId],
      ),
      this.db.query<{ id: string }>(
        'SELECT id FROM "Warehouse" WHERE id = $1 AND "companyId" = $2',
        [dto.warehouseId, companyId],
      ),
    ]);
    if (!suppliers[0]) throw new NotFoundException('تأمین‌کننده یافت نشد');
    if (!warehouses[0]) throw new NotFoundException('انبار یافت نشد');

    const productIds = dto.items.map((item) => item.productId);
    const products = await this.db.query<{ id: string; purchasePrice: string }>(
      'SELECT id, "purchasePrice" FROM "Product" WHERE id = ANY($1) AND "companyId" = $2',
      [productIds, companyId],
    );
    if (products.length !== new Set(productIds).size) {
      throw new BadRequestException('برخی کالاها یافت نشدند');
    }
    const productMap = new Map(products.map((product) => [product.id, product]));

    let subtotal = 0;
    const itemsData = dto.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const price = item.purchasePrice ?? Number(product.purchasePrice);
      const total = price * item.quantity;
      subtotal += total;
      return {
        productId: item.productId,
        quantity: item.quantity,
        purchasePrice: price,
        total,
        batchNo: item.batchNo,
        expiryDate: item.expiryDate,
        manufactureDate: item.manufactureDate,
      };
    });

    const discount = dto.discount ?? 0;
    const tax = dto.tax ?? 0;
    const total = subtotal - discount + tax;

    const created = await this.db.transaction(async (tx) => {
      const inserted = await tx.query<Purchase>(
        `INSERT INTO "Purchase"
           (id, "companyId", "supplierId", "warehouseId", "purchaseNo", status,
            subtotal, discount, tax, total, note,
            "freightCost", "freightCarrier", "capitalizeFreight")
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          randomUUID(),
          companyId,
          dto.supplierId,
          dto.warehouseId,
          `PUR-${Date.now()}`,
          subtotal,
          discount,
          tax,
          total,
          dto.note ?? null,
          dto.freightCost ?? 0,
          dto.freightCarrier ?? null,
          // پیش‌فرض سرشکن است: کرایه بخشی از بهای تمام‌شدهٔ کالاست.
          dto.capitalizeFreight ?? true,
        ],
      );
      const purchase = inserted.rows[0];

      const items: PurchaseItem[] = [];
      for (const item of itemsData) {
        const row = await tx.query<PurchaseItem>(
          `INSERT INTO "PurchaseItem"
             (id, "purchaseId", "productId", quantity, "purchasePrice", total,
              "batchNo", "expiryDate", "manufactureDate")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [
            randomUUID(),
            purchase.id,
            item.productId,
            item.quantity,
            item.purchasePrice,
            item.total,
            item.batchNo ?? null,
            item.expiryDate ?? null,
            item.manufactureDate ?? null,
          ],
        );
        items.push(row.rows[0]);
      }

      return { ...purchase, items };
    });

    // ⚠️ دریافت **پس از** تراکنشِ ساخت انجام می‌شود، نه داخلش.
    //
    //    `receive` خودش تراکنشی است و `FOR UPDATE` می‌زند؛ تودرتو
    //    کردنش یعنی بازنویسیِ مسیرِ مالی‌ای که از قبل آزموده شده.
    //
    //    اگر بینِ این دو چیزی بشکند، فاکتورِ ثبت‌شدهٔ دریافت‌نشده
    //    می‌ماند — حالتی که کاربر با یک کلیک جبرانش می‌کند.  برخلافِ
    //    فاکتورِ تکراری، این حالت داده را خراب نمی‌کند.
    if (dto.receive) {
      return this.receive(created.id, companyId);
    }

    return created;
  }

  /** دریافت کالا: افزایش خودکار موجودی انبار (تراکنشی) */
  async receive(id: string, companyId: string) {
    return this.db.transaction(async (tx) => {
      const purchases = await tx.query<Purchase>(
        'SELECT * FROM "Purchase" WHERE id = $1 AND "companyId" = $2 FOR UPDATE',
        [id, companyId],
      );
      const purchase = purchases.rows[0];
      if (!purchase) throw new NotFoundException('فاکتور خرید یافت نشد');
      if (purchase.status === 'RECEIVED') {
        throw new BadRequestException('این فاکتور قبلاً دریافت شده است');
      }
      if (purchase.status === 'CANCELLED') {
        throw new BadRequestException('فاکتور لغوشده قابل دریافت نیست');
      }

      const items = await tx.query<PurchaseItem>(
        'SELECT * FROM "PurchaseItem" WHERE "purchaseId" = $1 ORDER BY id',
        [id],
      );

      // کرایهٔ حمل بخشی از بهای تمام‌شدهٔ رسیده است، نه هزینهٔ دوره.  به
      // نسبت ارزش هر قلم سرشکن می‌شود و در بهای واحد می‌نشیند؛ اگر هزینه
      // شود، بهای موجودی کمتر از واقع می‌ماند و سود ناخالص بیش از واقع
      // گزارش می‌شود.
      const freight = Number(purchase.freightCost ?? 0);
      const capitalize = purchase.capitalizeFreight !== false;

      const shares =
        freight > 0 && capitalize
          ? allocateFreight(
              items.rows.map((row) => ({ total: Number(row.total) })),
              freight,
            )
          : items.rows.map(() => 0);

      for (const [index, row] of items.rows.entries()) {
        const share = shares[index] ?? 0;
        if (share === 0) continue;

        const qty = Number(row.quantity) || 1;
        const landed =
          Math.round((Number(row.purchasePrice) + share / qty) * 100) / 100;

        await tx.query(
          `UPDATE "PurchaseItem"
              SET "freightShare" = $1::numeric, "landedUnitCost" = $2::numeric
            WHERE id = $3`,
          [share, landed, row.id],
        );

        // بهای خرید کالا با بهای تمام‌شدهٔ رسیده به‌روز می‌شود تا بهای
        // تمام‌شدهٔ فروش هم کرایه را در بر بگیرد.
        await tx.query(
          'UPDATE "Product" SET "purchasePrice" = $1::numeric WHERE id = $2',
          [landed, row.productId],
        );
      }

      for (const item of items.rows) {
        await applyStockDelta(
          tx,
          purchase.warehouseId,
          item.productId,
          Number(item.quantity),
          { companyId, reason: 'PURCHASE', refType: 'PURCHASE', refId: id },
        );

        // محموله فقط وقتی ثبت می‌شود که سری یا تاریخ انقضا داشته باشد؛
        // برای کالای بدون انقضا (مثل ظرف یا لوازم) رکورد بی‌مصرف نسازیم.
        if (item.batchNo || item.expiryDate) {
          const batchNo =
            item.batchNo ??
            `AUTO-${String(item.expiryDate).slice(0, 10).replace(/-/g, '')}`;

          // چند سطر با یک سری در یک فاکتور جمع می‌شوند؛ نمایهٔ یکتا هم
          // همین را تضمین می‌کند.
          await tx.query(
            `INSERT INTO "BatchNumber"
               (id, "companyId", "productId", "warehouseId", "purchaseId",
                "batchNo", qty, "remainingQty", "expiryDate", "manufactureDate")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)
             ON CONFLICT ("companyId", "productId", "warehouseId", "batchNo")
             DO UPDATE SET
               qty = "BatchNumber".qty + EXCLUDED.qty,
               "remainingQty" = "BatchNumber"."remainingQty" + EXCLUDED.qty,
               "updatedAt" = now()`,
            [
              randomUUID(),
              companyId,
              item.productId,
              purchase.warehouseId,
              id,
              batchNo,
              Number(item.quantity),
              item.expiryDate ?? null,
              item.manufactureDate ?? null,
            ],
          );
        }
      }

      // سند در لحظهٔ دریافت صادر می‌شود، نه ثبت سفارش: تا اینجا نه کالایی
      // رسیده بود و نه بدهی قطعی شده بود.
      await this.posting.postAuto(tx, companyId, {
        sourceType: 'Purchase',
        sourceId: id,
        description: `دریافت کالای فاکتور خرید ${purchase.purchaseNo}`,
        lines: purchaseEntry({
          subtotal: Number(purchase.subtotal),
          discount: Number(purchase.discount),
          tax: Number(purchase.tax),
          total: Number(purchase.total),
        }),
      });

      // سند کرایه جدا از سند خرید است: مبلغ به باربری داده می‌شود نه به
      // تأمین‌کننده، و اغلب سند و زمان‌بندی جداگانه دارد.
      if (freight > 0) {
        await this.posting.postAuto(tx, companyId, {
          sourceType: 'PurchaseFreight',
          sourceId: id,
          description: `کرایه حمل خرید ${purchase.purchaseNo}`,
          lines: inboundFreightEntry({
            amount: freight,
            capitalize,
            paid: false,
          }),
        });
      }

      const updated = await tx.query<Purchase>(
        `UPDATE "Purchase" SET status = 'RECEIVED', "updatedAt" = now() WHERE id = $1 RETURNING *`,
        [id],
      );
      return updated.rows[0];
    });
  }

  async cancel(id: string, companyId: string) {
    const purchase = await this.findOne(id, companyId);
    if (purchase.status === 'RECEIVED') {
      throw new BadRequestException('فاکتور دریافت‌شده قابل لغو نیست');
    }

    // فاکتور دریافت‌نشده سندی هم نخورده، ولی برای اطمینان بررسی می‌شود.
    return this.db.transaction(async (tx) => {
      await this.posting.reverseBySourceIn(tx, companyId, 'Purchase', id);

      const rows = await tx.query<Purchase>(
        `UPDATE "Purchase" SET status = 'CANCELLED', "updatedAt" = now() WHERE id = $1 RETURNING *`,
        [id],
      );
      return rows.rows[0];
    });
  }
}
