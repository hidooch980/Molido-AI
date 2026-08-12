import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';

import { DatabaseService } from '../database/database.service';
import { PostingService } from '../accounting/posting.service';
import { applyStockDelta } from '../inventory/inventory.service';
import {
  purchaseReturnEntry,
  returnCogsEntry,
  salesReturnEntry,
} from '../accounting/posting-rules';

/**
 * برگشت از فروش و برگشت از خرید.
 *
 * پیش از این `ProductReturn` فقط یک CRUD بود: مرجوعی ثبت می‌شد ولی نه کالایی
 * جابه‌جا می‌شد، نه پولی برمی‌گشت، نه سندی زده می‌شد — یعنی مرجوعی هیچ اثری
 * نداشت.
 *
 * سه نکتهٔ طراحی:
 *
 * ۱. **سقف مرجوعی** با `returnedQty` روی قلم فاکتور کنترل می‌شود و قید
 *    `returnedQty <= quantity` در دیتابیس است.  بدون آن می‌شد ۳ عدد خرید و
 *    ۱۰ عدد مرجوع کرد — یعنی ۷ کالای ناموجود به انبار اضافه و پولش پرداخت.
 *
 * ۲. **سند مستقل، نه معکوسِ فاکتور.**  مرجوعی معمولاً جزئی است؛ معکوس کردن
 *    سند اصلی کل فروش را خنثی می‌کند.  پس سند تازه‌ای فقط برای سهم برگشتی.
 *
 * ۳. **عودت نقدی از صندوق کم می‌شود.**  اگر نشود، موجودی سیستمی صندوق از پول
 *    واقعی بیشتر می‌ماند و در پایان شیفت به‌شکل کسری کاذب ظاهر می‌شود — همان
 *    اشتباهی که یک بار در «لغو فاکتور» رخ داده بود.
 */

type ReturnLine = { sourceItemId: string; qty: number };

type Row = Record<string, unknown>;

@Injectable()
export class ReturnsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly posting: PostingService,
  ) {}

  async findAll(companyId: string) {
    return this.db.query<Row>(
      `SELECT r.*, s."invoiceNo", p."purchaseNo", TRIM(COALESCE(c."firstName",'') || ' ' || COALESCE(c."lastName",'')) AS "customerName"
         FROM "ProductReturn" r
         LEFT JOIN "Sale"     s ON s.id = r."saleId"
         LEFT JOIN "Purchase" p ON p.id = r."purchaseId"
         LEFT JOIN "Customer" c ON c.id = r."customerId"
        WHERE r."companyId" = $1
        ORDER BY r."createdAt" DESC LIMIT 200`,
      [companyId],
    );
  }

  async findOne(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      'SELECT * FROM "ProductReturn" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('مرجوعی یافت نشد');

    const items = await this.db.query<Row>(
      'SELECT * FROM "ProductReturnItem" WHERE "returnId" = $1',
      [id],
    );
    return { ...rows[0], items };
  }

  private async nextNo(tx: PoolClient, companyId: string) {
    const { rows } = await tx.query<{ n: string | null }>(
      `SELECT MAX(NULLIF(regexp_replace("returnNo", '\\D', '', 'g'), '')::bigint) AS n
         FROM "ProductReturn" WHERE "companyId" = $1`,
      [companyId],
    );
    return `RT-${String(Number(rows[0]?.n ?? 0) + 1).padStart(5, '0')}`;
  }

  // ------------------------------------------------------ برگشت از فروش

  /**
   * کالا به انبار برمی‌گردد و وجه عودت می‌شود.
   * `refundMethod`: CASH (از صندوق) | CARD | CREDIT (کاهش بدهی مشتری) | NONE
   */
  async createSaleReturn(
    companyId: string,
    userId: string,
    dto: {
      saleId: string;
      items: ReturnLine[];
      refundMethod?: 'CASH' | 'CARD' | 'CREDIT' | 'NONE';
      cashBoxId?: string;
      reason?: string;
      note?: string;
    },
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('حداقل یک قلم برای مرجوعی لازم است');
    }

    const refundMethod = dto.refundMethod ?? 'CASH';
    if (refundMethod === 'CASH' && !dto.cashBoxId) {
      throw new BadRequestException('برای عودت نقدی باید صندوق مشخص شود');
    }

    return this.db.transaction(async (tx) => {
      const sales = await tx.query<{
        id: string;
        warehouseId: string;
        customerId: string | null;
        status: string;
        tax: string;
        subtotal: string;
      }>('SELECT * FROM "Sale" WHERE id = $1 AND "companyId" = $2 FOR UPDATE', [
        dto.saleId,
        companyId,
      ]);

      const sale = sales.rows[0];
      if (!sale) throw new NotFoundException('فاکتور فروش یافت نشد');
      if (sale.status === 'CANCELLED') {
        throw new BadRequestException('فاکتور لغو شده است؛ مرجوعی معنا ندارد');
      }

      const returnId = randomUUID();
      let subtotal = 0;
      let cost = 0;

      const lines: Array<{
        productId: string;
        name: string;
        qty: number;
        unitPrice: number;
        total: number;
        sourceItemId: string;
      }> = [];

      for (const line of dto.items) {
        const qty = Number(line.qty);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new BadRequestException('مقدار مرجوعی نامعتبر است');
        }

        // سقف مرجوعی هم در WHERE کنترل می‌شود (برای پیام روشن) و هم با قید
        // دیتابیس (به‌عنوان تور ایمنی در برابر مسیرهای آینده).
        const updated = await tx.query<{
          productId: string;
          price: string;
          discount: string;
          quantity: string;
        }>(
          `UPDATE "SaleItem"
              SET "returnedQty" = "returnedQty" + $1::numeric
            WHERE id = $2 AND "saleId" = $3
              AND "returnedQty" + $1::numeric <= quantity
            RETURNING "productId", price, discount, quantity`,
          [qty, line.sourceItemId, dto.saleId],
        );

        const item = updated.rows[0];
        if (!item) {
          // شرط سقف داخل WHERE است تا قید دیتابیس خطای خام ۵۰۰ ندهد؛ حالا
          // باید مشخص شود قلم وجود ندارد یا مقدار از باقی‌ماندهٔ مرجوعی
          // بیشتر است.
          const existing = await tx.query<{ quantity: string; returnedQty: string }>(
            'SELECT quantity, "returnedQty" FROM "SaleItem" WHERE id = $1 AND "saleId" = $2',
            [line.sourceItemId, dto.saleId],
          );
          const row = existing.rows[0];
          if (!row) throw new NotFoundException('قلم فاکتور یافت نشد');

          const left = Number(row.quantity) - Number(row.returnedQty);
          throw new BadRequestException(
            `بیش از مقدار قابل مرجوع درخواست شده است — باقی‌مانده: ${left}`,
          );
        }

        const products = await tx.query<{
          name: string;
          purchasePrice: string;
          trackInventory: boolean;
        }>(
          'SELECT name, "purchasePrice", "trackInventory" FROM "Product" WHERE id = $1',
          [item.productId],
        );
        const product = products.rows[0];

        // قیمت واحدِ خالص همان چیزی است که مشتری پرداخته: قیمت منهای سهم
        // تخفیف همان سطر.  اگر تخفیف نادیده گرفته شود، بیش از دریافتی عودت
        // می‌شود.
        const unitNet =
          Number(item.price) -
          Number(item.discount ?? 0) / Math.max(Number(item.quantity), 1);
        const total = unitNet * qty;

        subtotal += total;
        cost += Number(product?.purchasePrice ?? 0) * qty;

        if (product?.trackInventory) {
          await applyStockDelta(tx, sale.warehouseId, item.productId, qty, {
            companyId,
            reason: 'RETURN',
            refType: 'RETURN',
            refId: returnId,
            userId,
          });
        }

        lines.push({
          productId: item.productId,
          name: product?.name ?? '—',
          qty,
          unitPrice: unitNet,
          total,
          sourceItemId: line.sourceItemId,
        });
      }

      // مالیات به نسبت مبلغ برگشتی از فاکتور اصلی گرفته می‌شود؛ نرخ ثابت
      // فرض نمی‌شود چون فاکتور ممکن است اقلامی با نرخ متفاوت داشته باشد.
      const saleSubtotal = Number(sale.subtotal) || 1;
      const tax = (Number(sale.tax) * subtotal) / saleSubtotal;
      const total = subtotal + tax;

      const returnNo = await this.nextNo(tx, companyId);

      await tx.query(
        `INSERT INTO "ProductReturn"
           (id, "companyId", "returnNo", type, "saleId", "customerId", "warehouseId",
            reason, status, "totalAmount", "refundMethod", "refundAmount",
            "cashBoxId", "userId", note, "appliedAt")
         VALUES ($1,$2,$3,'SALE',$4,$5,$6,$7,'APPLIED',$8,$9,$10,$11,$12,$13,now())`,
        [
          returnId,
          companyId,
          returnNo,
          dto.saleId,
          sale.customerId,
          sale.warehouseId,
          dto.reason ?? 'OTHER',
          total,
          refundMethod,
          refundMethod === 'NONE' ? 0 : total,
          dto.cashBoxId ?? null,
          userId,
          dto.note ?? null,
        ],
      );

      for (const line of lines) {
        await tx.query(
          `INSERT INTO "ProductReturnItem"
             (id, "returnId", "productId", name, qty, "unitPrice", total, "sourceItemId")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            randomUUID(),
            returnId,
            line.productId,
            line.name,
            line.qty,
            line.unitPrice,
            line.total,
            line.sourceItemId,
          ],
        );
      }

      // پول نقد واقعاً از صندوق بیرون می‌رود؛ اگر موجودی صندوق کم نشود، در
      // پایان شیفت به‌شکل کسری ظاهر می‌شود و صندوق‌دار بی‌گناه پاسخگو می‌شود.
      if (refundMethod === 'CASH' && dto.cashBoxId) {
        const box = await tx.query<{ id: string }>(
          `UPDATE "CashBox" SET balance = balance - $1::numeric, "updatedAt" = now()
            WHERE id = $2 AND "companyId" = $3 AND balance >= $1::numeric
            RETURNING id`,
          [total, dto.cashBoxId, companyId],
        );
        if (!box.rows[0]) {
          throw new BadRequestException('موجودی صندوق برای عودت کافی نیست');
        }
      }

      // عودت اعتباری: بدهی مشتری کم می‌شود.
      if (refundMethod === 'CREDIT' && sale.customerId) {
        await tx.query(
          'UPDATE "Customer" SET balance = balance - $1::numeric WHERE id = $2',
          [total, sale.customerId],
        );
      }

      if (refundMethod !== 'NONE') {
        await this.posting.postAuto(tx, companyId, {
          sourceType: 'SalesReturn',
          sourceId: returnId,
          description: `برگشت از فروش ${returnNo}`,
          userId,
          lines: salesReturnEntry({ subtotal, tax, total, refundMethod }),
        });
      }

      if (cost > 0) {
        await this.posting.postAuto(tx, companyId, {
          sourceType: 'SalesReturnCogs',
          sourceId: returnId,
          description: `بهای تمام‌شدهٔ مرجوعی ${returnNo}`,
          userId,
          lines: returnCogsEntry(cost),
        });
      }

      return { id: returnId, returnNo, subtotal, tax, total, items: lines };
    });
  }

  // ------------------------------------------------------- برگشت از خرید

  /** کالا به تأمین‌کننده برمی‌گردد: موجودی کم می‌شود، بدهی تسویه می‌شود. */
  async createPurchaseReturn(
    companyId: string,
    userId: string,
    dto: {
      purchaseId: string;
      items: ReturnLine[];
      reason?: string;
      note?: string;
    },
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('حداقل یک قلم برای مرجوعی لازم است');
    }

    return this.db.transaction(async (tx) => {
      const purchases = await tx.query<{
        id: string;
        warehouseId: string;
        supplierId: string | null;
        subtotal: string;
        tax: string;
        status: string;
      }>(
        'SELECT * FROM "Purchase" WHERE id = $1 AND "companyId" = $2 FOR UPDATE',
        [dto.purchaseId, companyId],
      );

      const purchase = purchases.rows[0];
      if (!purchase) throw new NotFoundException('سند خرید یافت نشد');

      const returnId = randomUUID();
      let subtotal = 0;

      const lines: Array<{
        productId: string;
        name: string;
        qty: number;
        unitPrice: number;
        total: number;
        sourceItemId: string;
      }> = [];

      for (const line of dto.items) {
        const qty = Number(line.qty);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new BadRequestException('مقدار مرجوعی نامعتبر است');
        }

        const updated = await tx.query<{
          productId: string;
          purchasePrice: string;
        }>(
          `UPDATE "PurchaseItem"
              SET "returnedQty" = "returnedQty" + $1::numeric
            WHERE id = $2 AND "purchaseId" = $3
              AND "returnedQty" + $1::numeric <= quantity
            RETURNING "productId", "purchasePrice"`,
          [qty, line.sourceItemId, dto.purchaseId],
        );

        const item = updated.rows[0];
        if (!item) {
          const existing = await tx.query<{ quantity: string; returnedQty: string }>(
            'SELECT quantity, "returnedQty" FROM "PurchaseItem" WHERE id = $1 AND "purchaseId" = $2',
            [line.sourceItemId, dto.purchaseId],
          );
          const row = existing.rows[0];
          if (!row) throw new NotFoundException('قلم سند خرید یافت نشد');

          const left = Number(row.quantity) - Number(row.returnedQty);
          throw new BadRequestException(
            `بیش از مقدار قابل مرجوع درخواست شده است — باقی‌مانده: ${left}`,
          );
        }

        const total = Number(item.purchasePrice) * qty;
        subtotal += total;

        // کالای مرجوعی از انبار خارج می‌شود؛ اگر موجودی کافی نباشد
        // applyStockDelta مقدار null برمی‌گرداند و کل تراکنش لغو می‌شود.
        const moved = await applyStockDelta(
          tx,
          purchase.warehouseId,
          item.productId,
          -qty,
          {
            companyId,
            reason: 'RETURN',
            refType: 'PURCHASE_RETURN',
            refId: returnId,
            userId,
          },
        );
        if (!moved) {
          throw new BadRequestException(
            'موجودی انبار برای برگشت این کالا کافی نیست',
          );
        }

        const products = await tx.query<{ name: string }>(
          'SELECT name FROM "Product" WHERE id = $1',
          [item.productId],
        );

        lines.push({
          productId: item.productId,
          name: products.rows[0]?.name ?? '—',
          qty,
          unitPrice: Number(item.purchasePrice),
          total,
          sourceItemId: line.sourceItemId,
        });
      }

      const purchaseSubtotal = Number(purchase.subtotal) || 1;
      const tax = (Number(purchase.tax) * subtotal) / purchaseSubtotal;
      const total = subtotal + tax;

      const returnNo = await this.nextNo(tx, companyId);

      await tx.query(
        `INSERT INTO "ProductReturn"
           (id, "companyId", "returnNo", type, "purchaseId", "supplierId",
            "warehouseId", reason, status, "totalAmount", "refundMethod",
            "refundAmount", "userId", note, "appliedAt")
         VALUES ($1,$2,$3,'PURCHASE',$4,$5,$6,$7,'APPLIED',$8,'NONE',$9,$10,$11,now())`,
        [
          returnId,
          companyId,
          returnNo,
          dto.purchaseId,
          purchase.supplierId,
          purchase.warehouseId,
          dto.reason ?? 'OTHER',
          total,
          total,
          userId,
          dto.note ?? null,
        ],
      );

      for (const line of lines) {
        await tx.query(
          `INSERT INTO "ProductReturnItem"
             (id, "returnId", "productId", name, qty, "unitPrice", total, "sourceItemId")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            randomUUID(),
            returnId,
            line.productId,
            line.name,
            line.qty,
            line.unitPrice,
            line.total,
            line.sourceItemId,
          ],
        );
      }

      await this.posting.postAuto(tx, companyId, {
        sourceType: 'PurchaseReturn',
        sourceId: returnId,
        description: `برگشت از خرید ${returnNo}`,
        userId,
        lines: purchaseReturnEntry({ subtotal, tax, total }),
      });

      return { id: returnId, returnNo, subtotal, tax, total, items: lines };
    });
  }

  async stats(companyId: string) {
    const rows = await this.db.query<Row>(
      `SELECT
         COUNT(*) FILTER (WHERE type = 'SALE')     AS "saleReturns",
         COUNT(*) FILTER (WHERE type = 'PURCHASE') AS "purchaseReturns",
         COALESCE(SUM("totalAmount") FILTER (WHERE type = 'SALE'), 0) AS "saleReturnValue",
         COALESCE(SUM("refundAmount") FILTER (WHERE "refundMethod" = 'CASH'), 0) AS "cashRefunded"
       FROM "ProductReturn" WHERE "companyId" = $1 AND status = 'APPLIED'`,
      [companyId],
    );
    return rows[0];
  }
}
