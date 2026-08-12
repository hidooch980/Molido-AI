import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { applyStockDelta } from '../inventory/inventory.service';
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
        `SELECT i.*, p.name AS "productName", p.sku AS "productSku", p.unit AS "productUnit"
         FROM "PurchaseItem" i JOIN "Product" p ON p.id = i."productId"
         WHERE i."purchaseId" = $1`,
        [id],
      ),
    ]);

    return {
      ...purchases[0],
      supplier: suppliers[0] ?? null,
      warehouse: warehouses[0] ?? null,
      items,
    };
  }

  /** ثبت فاکتور خرید (وضعیت اولیه: PENDING) */
  async create(dto: CreatePurchaseDto, companyId: string) {
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

    return this.db.transaction(async (tx) => {
      const created = await tx.query<Purchase>(
        `INSERT INTO "Purchase"
           (id, "companyId", "supplierId", "warehouseId", "purchaseNo", status,
            subtotal, discount, tax, total, note)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, $9, $10) RETURNING *`,
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
        ],
      );
      const purchase = created.rows[0];

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
        'SELECT * FROM "PurchaseItem" WHERE "purchaseId" = $1',
        [id],
      );
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
