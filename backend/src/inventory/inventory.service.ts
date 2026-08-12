import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';

type InventoryRow = Record<string, unknown> & { id: string; quantity: string };

/** Joins the product and warehouse columns the API has always returned. */
const WITH_RELATIONS = `
  SELECT i.*,
         p.name AS "productName", p.sku AS "productSku", p.unit AS "productUnit",
         p."minStock" AS "productMinStock", p."salePrice" AS "productSalePrice",
         w.name AS "warehouseName", w.code AS "warehouseCode"
  FROM "Inventory" i
  JOIN "Product" p ON p.id = i."productId"
  JOIN "Warehouse" w ON w.id = i."warehouseId"
`;

/**
 * Adds `delta` to a warehouse/product pair, creating the row when absent.
 * Runs as a single statement so concurrent movements cannot lose an update.
 */
/** زمینهٔ هر حرکت موجودی — چرا و از روی کدام سند. */
export type StockContext = {
  companyId: string;
  reason:
    | 'SALE' | 'SALE_CANCEL' | 'PURCHASE' | 'PURCHASE_CANCEL'
    | 'ADJUST' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'COUNT' | 'RETURN' | 'OTHER';
  refType?: string | null;
  refId?: string | null;
  userId?: string | null;
  note?: string | null;
};

export async function applyStockDelta(
  tx: PoolClient,
  warehouseId: string,
  productId: string,
  delta: number,
  // اختیاری است تا فراخوان‌های قدیمی نشکنند، ولی بدون آن حرکت ثبت نمی‌شود؛
  // هر مسیر تازه باید حتماً آن را بدهد.
  context?: StockContext,
): Promise<InventoryRow | null> {
  const result = await tx.query<InventoryRow>(
    // The SELECT guard keeps a negative delta from creating a negative row when
    // the pair has no stock record yet; the ON CONFLICT guard covers the update.
    // Update the existing row when there is one, otherwise create it — but only
    // a non-negative delta may create a row, and neither branch may drive the
    // quantity below zero.  $4 is cast explicitly because it appears both as a
    // column value and inside arithmetic, which defeats type inference.
    `WITH updated AS (
       UPDATE "Inventory" SET quantity = quantity + $4::numeric, "updatedAt" = now()
       WHERE "warehouseId" = $2 AND "productId" = $3 AND quantity + $4::numeric >= 0
       RETURNING *
     ), inserted AS (
       INSERT INTO "Inventory" (id, "warehouseId", "productId", quantity)
       SELECT $1, $2, $3, $4::numeric
       WHERE $4::numeric >= 0
         AND NOT EXISTS (
           SELECT 1 FROM "Inventory" WHERE "warehouseId" = $2 AND "productId" = $3
         )
       ON CONFLICT ("warehouseId", "productId")
       DO UPDATE SET quantity = "Inventory".quantity + $4::numeric, "updatedAt" = now()
       RETURNING *
     )
     SELECT * FROM updated UNION ALL SELECT * FROM inserted`,
    [randomUUID(), warehouseId, productId, delta],
  );
  const row = result.rows[0] ?? null;

  // ثبت کاردکس در همان تراکنش: اگر حرکت ثبت نشود، تغییر موجودی هم نباید
  // بماند — وگرنه دقیقاً همان وضعیتی پیش می‌آید که این جدول برای رفعش
  // ساخته شده (موجودیِ بی‌توضیح).
  if (row && context && delta !== 0) {
    await tx.query(
      `INSERT INTO "StockMovement"
         (id, "companyId", "warehouseId", "productId", delta, balance,
          reason, "refType", "refId", "userId", note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        randomUUID(),
        context.companyId,
        warehouseId,
        productId,
        delta,
        row.quantity,
        context.reason,
        context.refType ?? null,
        context.refId ?? null,
        context.userId ?? null,
        context.note ?? null,
      ],
    );
  }

  return row;
}

@Injectable()
export class InventoryService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(companyId: string, warehouseId?: string) {
    const values: unknown[] = [companyId];
    let where = 'w."companyId" = $1';
    if (warehouseId) {
      values.push(warehouseId);
      where += ` AND i."warehouseId" = $${values.length}`;
    }
    return this.db.query<InventoryRow>(
      `${WITH_RELATIONS} WHERE ${where} ORDER BY i."updatedAt" DESC`,
      values,
    );
  }

  async findOne(id: string, companyId: string) {
    const rows = await this.db.query<InventoryRow>(
      `${WITH_RELATIONS} WHERE i.id = $1 AND w."companyId" = $2`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('رکورد موجودی یافت نشد');
    return rows[0];
  }

  /** تنظیم دستی موجودی (افزایش یا کاهش) */
  async adjust(
    companyId: string,
    data: {
      productId: string;
      warehouseId: string;
      quantityChange: number;
      userId?: string | null;
      note?: string | null;
    },
  ) {
    await this.requirePair(companyId, data.warehouseId, data.productId);

    return this.db.transaction(async (tx) => {
      const row = await applyStockDelta(
        tx,
        data.warehouseId,
        data.productId,
        data.quantityChange,
        { companyId, reason: 'ADJUST', userId: data.userId ?? null, note: data.note ?? null },
      );
      if (!row) throw new BadRequestException('موجودی نمی‌تواند منفی شود');
      return row;
    });
  }

  /** انتقال موجودی بین دو انبار */
  async transfer(
    companyId: string,
    data: {
      productId: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      quantity: number;
      userId?: string | null;
    },
  ) {
    if (data.quantity <= 0) {
      throw new BadRequestException('مقدار انتقال باید بزرگ‌تر از صفر باشد');
    }
    if (data.fromWarehouseId === data.toWarehouseId) {
      throw new BadRequestException('انبار مبدأ و مقصد یکسان است');
    }

    await this.requirePair(companyId, data.fromWarehouseId, data.productId);
    await this.requirePair(companyId, data.toWarehouseId, data.productId);

    return this.db.transaction(async (tx) => {
      // یک شناسه برای هر دو سرِ انتقال تا در کاردکس به هم وصل باشند.
      const transferId = randomUUID();

      const debited = await applyStockDelta(
        tx,
        data.fromWarehouseId,
        data.productId,
        -data.quantity,
        {
          companyId,
          reason: 'TRANSFER_OUT',
          refType: 'TRANSFER',
          refId: transferId,
          userId: data.userId ?? null,
        },
      );
      if (!debited) throw new BadRequestException('موجودی انبار مبدأ کافی نیست');

      return applyStockDelta(
        tx,
        data.toWarehouseId,
        data.productId,
        data.quantity,
        {
          companyId,
          reason: 'TRANSFER_IN',
          refType: 'TRANSFER',
          refId: transferId,
          userId: data.userId ?? null,
        },
      );
    });
  }

  async lowStock(companyId: string) {
    return this.db.query<InventoryRow>(
      `${WITH_RELATIONS} WHERE w."companyId" = $1 AND i.quantity <= p."minStock"`,
      [companyId],
    );
  }

  /** Confirms both sides of a movement belong to the caller's company. */
  private async requirePair(companyId: string, warehouseId: string, productId: string) {
    const [warehouses, products] = await Promise.all([
      this.db.query<{ id: string }>(
        'SELECT id FROM "Warehouse" WHERE id = $1 AND "companyId" = $2',
        [warehouseId, companyId],
      ),
      this.db.query<{ id: string }>(
        'SELECT id FROM "Product" WHERE id = $1 AND "companyId" = $2',
        [productId, companyId],
      ),
    ]);
    if (!warehouses[0]) throw new NotFoundException('انبار یافت نشد');
    if (!products[0]) throw new NotFoundException('کالا یافت نشد');
  }
  /**
   * محموله‌های رو به انقضا.
   *
   * بر پایهٔ `BatchNumber` است نه `Product.expiryDate`: هر محموله تاریخ خودش
   * را دارد، و یک تاریخ مشترک روی کالا یا زودتر از موعد هشدار می‌دهد یا
   * اصلاً نمی‌دهد.  محموله‌های تمام‌شده کنار گذاشته می‌شوند.
   */
  async expiringBatches(companyId: string, days = 30) {
    return this.db.query<Record<string, unknown>>(
      `SELECT b.id, b."batchNo", b.qty, b."remainingQty", b."expiryDate",
              p.name AS "productName", p.sku AS "productSku", p.unit AS "productUnit",
              w.name AS "warehouseName",
              (b."expiryDate" - CURRENT_DATE) AS "daysLeft"
         FROM "BatchNumber" b
         JOIN "Product" p ON p.id = b."productId"
         LEFT JOIN "Warehouse" w ON w.id = b."warehouseId"
        WHERE b."companyId" = $1
          AND b."expiryDate" IS NOT NULL
          AND COALESCE(b."remainingQty", b.qty) > 0
          AND b."expiryDate" <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
        ORDER BY b."expiryDate" ASC`,
      [companyId, days],
    );
  }

}
