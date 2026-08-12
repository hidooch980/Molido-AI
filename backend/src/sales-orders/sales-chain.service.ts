import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { SalesService } from '../sales/sales.service';

/**
 * زنجیرهٔ فروش: پیش‌فاکتور ← سفارش فروش ← ارسال ← فاکتور
 *
 * پیش از این جدول‌های این زنجیره در دیتابیس بودند ولی هیچ منطقی نداشتند و
 * هر کدام یک CRUD جزیره‌ای بود.  نکتهٔ اصلی این سرویس «تبدیل» است: هر مرحله
 * مرحلهٔ بعد را می‌سازد و پیوندش را نگه می‌دارد، پس همیشه می‌شود از یک فاکتور
 * به سفارش و از سفارش به پیش‌فاکتورش رسید.
 *
 * ثبت فاکتور عمداً به `SalesService.create` واگذار می‌شود، نه اینکه اینجا
 * دوباره نوشته شود: کسر موجودی، سند حسابداری، شیفت صندوق و بهای تمام‌شده
 * همه آنجا و در یک تراکنش انجام می‌شوند.  دو مسیر موازی برای ساخت فاکتور
 * یعنی دو رفتار متفاوت که دیر یا زود از هم واگرا می‌شوند.
 */

type Row = Record<string, unknown>;

type ItemInput = {
  productId?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
};

type Tx = {
  query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

@Injectable()
export class SalesChainService {
  constructor(
    private readonly db: DatabaseService,
    private readonly sales: SalesService,
  ) {}

  // ---------------------------------------------------------------- کمکی‌ها

  /**
   * شمارهٔ بعدی در سطح شرکت.  شماره‌ها با نمایهٔ یکتای (companyId, no) محافظت
   * می‌شوند، پس اگر دو درخواست هم‌زمان به یک شماره برسند، دومی در دیتابیس رد
   * می‌شود — نه اینکه دو سند با یک شماره ثبت شود.
   */
  private async nextNo(
    tx: Tx,
    table: 'Quotation' | 'SalesOrder' | 'Shipment',
    column: string,
    prefix: string,
    companyId: string,
  ): Promise<string> {
    const { rows } = await tx.query<{ n: string | null }>(
      `SELECT MAX(NULLIF(regexp_replace("${column}", '\\D', '', 'g'), '')::bigint) AS n
         FROM "${table}" WHERE "companyId" = $1`,
      [companyId],
    );

    const next = Number(rows[0]?.n ?? 0) + 1;
    return `${prefix}-${String(next).padStart(5, '0')}`;
  }

  private totals(items: ItemInput[], discount = 0, tax = 0) {
    if (!items?.length) {
      throw new BadRequestException('حداقل یک قلم لازم است');
    }

    const lines = items.map((item) => {
      const qty = Number(item.qty);
      const unitPrice = Number(item.unitPrice);

      if (!Number.isFinite(qty) || qty <= 0) {
        throw new BadRequestException(`مقدار «${item.name}» نامعتبر است`);
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new BadRequestException(`قیمت «${item.name}» نامعتبر است`);
      }

      return { ...item, qty, unitPrice, total: qty * unitPrice };
    });

    const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
    const total = subtotal - Number(discount || 0) + Number(tax || 0);

    if (total < 0) {
      throw new BadRequestException('تخفیف از مبلغ کل بیشتر است');
    }

    return { lines, subtotal, total };
  }

  // ------------------------------------------------------------ پیش‌فاکتور

  async createQuotation(
    companyId: string,
    dto: {
      customerId?: string;
      items: ItemInput[];
      discount?: number;
      tax?: number;
      validUntil?: string;
      note?: string;
    },
  ) {
    const { lines, total } = this.totals(dto.items, dto.discount, dto.tax);

    return this.db.transaction(async (tx) => {
      const quoteNo = await this.nextNo(tx, 'Quotation', 'quoteNo', 'Q', companyId);
      const id = randomUUID();

      const { rows } = await tx.query(
        `INSERT INTO "Quotation"
           (id, "companyId", "quoteNo", "customerId", "validUntil", status,
            "totalAmount", discount, tax, note)
         VALUES ($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$9) RETURNING *`,
        [
          id,
          companyId,
          quoteNo,
          dto.customerId ?? null,
          dto.validUntil ?? null,
          total,
          dto.discount ?? 0,
          dto.tax ?? 0,
          dto.note ?? null,
        ],
      );

      for (const line of lines) {
        await tx.query(
          `INSERT INTO "QuotationItem"
             (id, "quotationId", "productId", name, qty, "unitPrice", total)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            randomUUID(),
            id,
            line.productId ?? null,
            line.name,
            line.qty,
            line.unitPrice,
            line.total,
          ],
        );
      }

      return { ...rows[0], items: lines };
    });
  }

  /**
   * پیش‌فاکتور ← سفارش فروش.
   *
   * پیش‌فاکتورِ منقضی یا رد‌شده نباید تبدیل شود، و هر پیش‌فاکتور فقط یک بار.
   * شرط `status <> 'CONVERTED'` داخل خودِ UPDATE است تا دو درخواست هم‌زمان
   * نتوانند دو سفارش از یک پیش‌فاکتور بسازند.
   */
  async convertQuotationToOrder(
    companyId: string,
    quotationId: string,
    warehouseId?: string,
  ) {
    return this.db.transaction(async (tx) => {
      const quote = await tx.query<Row & { status: string; totalAmount: string }>(
        `UPDATE "Quotation"
            SET status = 'CONVERTED', "updatedAt" = now()
          WHERE id = $1 AND "companyId" = $2
            AND status IN ('DRAFT','SENT','ACCEPTED')
            AND ("validUntil" IS NULL OR "validUntil" >= now())
          RETURNING *`,
        [quotationId, companyId],
      );

      if (!quote.rows[0]) {
        // یا وجود ندارد، یا قبلاً تبدیل شده، یا منقضی است — پیام باید بگوید
        // کدام، وگرنه کاربر نمی‌فهمد چرا کارش انجام نشد.
        const found = await tx.query<{ status: string; expired: boolean }>(
          `SELECT status, ("validUntil" IS NOT NULL AND "validUntil" < now()) AS expired
             FROM "Quotation" WHERE id = $1 AND "companyId" = $2`,
          [quotationId, companyId],
        );

        const row = found.rows[0];
        if (!row) throw new NotFoundException('پیش‌فاکتور یافت نشد');
        if (row.status === 'CONVERTED') {
          throw new BadRequestException('این پیش‌فاکتور قبلاً به سفارش تبدیل شده است');
        }
        if (row.expired) throw new BadRequestException('پیش‌فاکتور منقضی شده است');
        throw new BadRequestException(`پیش‌فاکتور در وضعیت «${row.status}» قابل تبدیل نیست`);
      }

      const header = quote.rows[0];

      const items = await tx.query<{
        productId: string | null;
        name: string;
        qty: string;
        unitPrice: string;
      }>(
        `SELECT "productId", name, qty, "unitPrice" FROM "QuotationItem"
          WHERE "quotationId" = $1`,
        [quotationId],
      );

      const orderNo = await this.nextNo(tx, 'SalesOrder', 'orderNo', 'SO', companyId);
      const orderId = randomUUID();

      const order = await tx.query(
        `INSERT INTO "SalesOrder"
           (id, "companyId", "orderNo", "customerId", "quotationId", "warehouseId",
            status, "totalAmount", discount, tax, note)
         VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,$8,$9,$10) RETURNING *`,
        [
          orderId,
          companyId,
          orderNo,
          header.customerId ?? null,
          quotationId,
          warehouseId ?? null,
          header.totalAmount,
          header.discount ?? 0,
          header.tax ?? 0,
          header.note ?? null,
        ],
      );

      for (const item of items.rows) {
        await tx.query(
          `INSERT INTO "SalesOrderItem"
             (id, "orderId", "productId", name, qty, "unitPrice", total)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            randomUUID(),
            orderId,
            item.productId,
            item.name,
            item.qty,
            item.unitPrice,
            Number(item.qty) * Number(item.unitPrice),
          ],
        );
      }

      await tx.query(
        'UPDATE "Quotation" SET "salesOrderId" = $1 WHERE id = $2',
        [orderId, quotationId],
      );

      return order.rows[0];
    });
  }

  // ---------------------------------------------------------------- ارسال

  /**
   * ارسال (کامل یا جزئی) برای یک سفارش.
   *
   * `shippedQty` روی قلم سفارش بالا می‌رود و قید دیتابیس اجازه نمی‌دهد از
   * مقدار سفارش‌شده بیشتر شود؛ پس ارسال بیش از سفارش حتی با یک درخواست
   * دستکاری‌شده هم رد می‌شود.  وضعیت سفارش از روی همان ستون محاسبه می‌شود،
   * نه از روی چیزی که کلاینت می‌فرستد.
   */
  async createShipment(
    companyId: string,
    dto: {
      salesOrderId: string;
      items: Array<{ orderItemId: string; qty: number }>;
      carrier?: string;
      method?: string;
      fee?: number;
      address?: string;
      note?: string;
    },
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('حداقل یک قلم برای ارسال لازم است');
    }

    return this.db.transaction(async (tx) => {
      const order = await tx.query<{ id: string; status: string }>(
        `SELECT id, status FROM "SalesOrder" WHERE id = $1 AND "companyId" = $2`,
        [dto.salesOrderId, companyId],
      );

      if (!order.rows[0]) throw new NotFoundException('سفارش فروش یافت نشد');
      if (['CANCELLED', 'INVOICED'].includes(order.rows[0].status)) {
        throw new BadRequestException(
          `سفارش در وضعیت «${order.rows[0].status}» قابل ارسال نیست`,
        );
      }

      const trackingNo = await this.nextNo(
        tx, 'Shipment', 'trackingNo', 'SH', companyId,
      );
      const shipmentId = randomUUID();

      const shipment = await tx.query(
        `INSERT INTO "Shipment"
           (id, "companyId", "trackingNo", "salesOrderId", carrier, method, fee,
            status, address, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING',$8,$9) RETURNING *`,
        [
          shipmentId,
          companyId,
          trackingNo,
          dto.salesOrderId,
          dto.carrier ?? null,
          dto.method ?? null,
          dto.fee ?? 0,
          dto.address ?? null,
          dto.note ?? null,
        ],
      );

      for (const line of dto.items) {
        const qty = Number(line.qty);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new BadRequestException('مقدار ارسال نامعتبر است');
        }

        // قید "shippedQty" <= qty در دیتابیس است؛ اگر مازاد باشد این UPDATE
        // خطا می‌دهد و کل تراکنش برمی‌گردد.
        const updated = await tx.query<{
          productId: string | null;
          name: string;
        }>(
          `UPDATE "SalesOrderItem"
              SET "shippedQty" = "shippedQty" + $1::numeric
            WHERE id = $2 AND "orderId" = $3
            RETURNING "productId", name`,
          [qty, line.orderItemId, dto.salesOrderId],
        );

        const item = updated.rows[0];
        if (!item) throw new NotFoundException('قلم سفارش یافت نشد');

        await tx.query(
          `INSERT INTO "ShipmentItem" (id, "shipmentId", "productId", name, qty)
           VALUES ($1,$2,$3,$4,$5)`,
          [randomUUID(), shipmentId, item.productId, item.name, qty],
        );
      }

      await this.refreshOrderShipStatus(tx, dto.salesOrderId);

      return shipment.rows[0];
    });
  }

  /** وضعیت ارسال سفارش از روی مجموع اقلام محاسبه می‌شود، نه ورودی کاربر. */
  private async refreshOrderShipStatus(tx: Tx, orderId: string) {
    const { rows } = await tx.query<{ pending: string; shipped: string }>(
      `SELECT COUNT(*) FILTER (WHERE "shippedQty" < qty) AS pending,
              COUNT(*) FILTER (WHERE "shippedQty" > 0)   AS shipped
         FROM "SalesOrderItem" WHERE "orderId" = $1`,
      [orderId],
    );

    const pending = Number(rows[0]?.pending ?? 0);
    const shipped = Number(rows[0]?.shipped ?? 0);

    const status =
      pending === 0 ? 'SHIPPED' : shipped > 0 ? 'PARTIALLY_SHIPPED' : 'CONFIRMED';

    await tx.query(
      `UPDATE "SalesOrder" SET status = $1, "updatedAt" = now()
        WHERE id = $2 AND status NOT IN ('INVOICED','CANCELLED')`,
      [status, orderId],
    );
  }

  async markDelivered(companyId: string, shipmentId: string) {
    const rows = await this.db.query(
      `UPDATE "Shipment"
          SET status = 'DELIVERED', "deliveredAt" = now(), "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2 AND status <> 'CANCELLED'
        RETURNING *`,
      [shipmentId, companyId],
    );

    if (!rows[0]) throw new NotFoundException('حواله یافت نشد');
    return rows[0];
  }

  // ---------------------------------------------------------------- فاکتور

  /**
   * سفارش ← فاکتور فروش.
   *
   * فاکتور را `SalesService.create` می‌سازد تا کسر موجودی، سند حسابداری و
   * بهای تمام‌شده دقیقاً مثل فروش عادی انجام شود.  به همین دلیل این متد
   * تراکنش خودش را باز نمی‌کند: تراکنش داخل `SalesService` است و باز کردن
   * تراکنش بیرونی، آن را تودرتو می‌کرد.
   */
  async invoiceOrder(companyId: string, userId: string, orderId: string) {
    const order = await this.db.query<{
      id: string;
      status: string;
      customerId: string | null;
      warehouseId: string | null;
      discount: string;
      tax: string;
      note: string | null;
    }>(
      `SELECT id, status, "customerId", "warehouseId", discount, tax, note
         FROM "SalesOrder" WHERE id = $1 AND "companyId" = $2`,
      [orderId, companyId],
    );

    const header = order[0];
    if (!header) throw new NotFoundException('سفارش فروش یافت نشد');
    if (header.status === 'INVOICED') {
      throw new BadRequestException('برای این سفارش قبلاً فاکتور صادر شده است');
    }
    if (header.status === 'CANCELLED') {
      throw new BadRequestException('سفارش لغو شده است');
    }
    if (!header.warehouseId) {
      throw new BadRequestException('انبار سفارش تعیین نشده است');
    }

    const items = await this.db.query<{
      productId: string | null;
      qty: string;
      unitPrice: string;
    }>(
      `SELECT "productId", qty, "unitPrice" FROM "SalesOrderItem" WHERE "orderId" = $1`,
      [orderId],
    );

    // فاکتور بدون کالای شناخته‌شده نمی‌شود ساخت: موجودی و بهای تمام‌شده به
    // productId نیاز دارند.
    const missing = items.filter((item) => !item.productId);
    if (missing.length) {
      throw new BadRequestException(
        'اقلام سفارش باید به کالای تعریف‌شده وصل باشند تا فاکتور صادر شود',
      );
    }

    const sale = await this.sales.create(
      {
        warehouseId: header.warehouseId,
        customerId: header.customerId ?? undefined,
        discount: Number(header.discount ?? 0),
        tax: Number(header.tax ?? 0),
        note: header.note ?? undefined,
        items: items.map((item: { productId: string | null; qty: string; unitPrice: string }) => ({
          productId: item.productId as string,
          quantity: Number(item.qty),
          unitPrice: Number(item.unitPrice),
        })),
      } as never,
      companyId,
      userId,
    );

    const saleId = (sale as { id: string }).id;

    // شرط status <> 'INVOICED' دوباره اینجا هست تا دو درخواست هم‌زمان نتوانند
    // دو فاکتور برای یک سفارش بسازند.
    await this.db.query(
      `UPDATE "SalesOrder"
          SET status = 'INVOICED', "saleId" = $1, "updatedAt" = now()
        WHERE id = $2 AND status <> 'INVOICED'`,
      [saleId, orderId],
    );

    return sale;
  }

  // ---------------------------------------------------------------- نمایش

  /** یک سفارش با اقلام، پیش‌فاکتور مبدأ و حواله‌هایش — برای صفحهٔ جزئیات. */
  async orderDetail(companyId: string, orderId: string) {
    const order = await this.db.query(
      // نام مشتری در دو ستون جدا نگه‌داری می‌شود؛ کلاینت یک رشتهٔ آماده
      // می‌خواهد، پس اینجا چسبانده می‌شود.
      `SELECT o.*, q."quoteNo",
              NULLIF(TRIM(CONCAT_WS(' ', c."firstName", c."lastName")), '')
                AS "customerName"
         FROM "SalesOrder" o
         LEFT JOIN "Quotation" q ON q.id = o."quotationId"
         LEFT JOIN "Customer"  c ON c.id = o."customerId"
        WHERE o.id = $1 AND o."companyId" = $2`,
      [orderId, companyId],
    );

    if (!order[0]) throw new NotFoundException('سفارش فروش یافت نشد');

    const [items, shipments] = await Promise.all([
      this.db.query(
        `SELECT * FROM "SalesOrderItem" WHERE "orderId" = $1 ORDER BY name`,
        [orderId],
      ),
      this.db.query(
        `SELECT * FROM "Shipment" WHERE "salesOrderId" = $1 ORDER BY "createdAt" DESC`,
        [orderId],
      ),
    ]);

    return { ...order[0], items, shipments };
  }

  async stats(companyId: string) {
    const rows = await this.db.query<Row>(
      `SELECT
         (SELECT COUNT(*) FROM "Quotation"
           WHERE "companyId" = $1 AND status IN ('DRAFT','SENT')) AS "openQuotations",
         (SELECT COUNT(*) FROM "SalesOrder"
           WHERE "companyId" = $1 AND status NOT IN ('INVOICED','CANCELLED')) AS "openOrders",
         (SELECT COALESCE(SUM("totalAmount"),0) FROM "SalesOrder"
           WHERE "companyId" = $1 AND status NOT IN ('INVOICED','CANCELLED')) AS "openOrdersValue",
         (SELECT COUNT(*) FROM "Shipment"
           WHERE "companyId" = $1 AND status IN ('PENDING','IN_TRANSIT')) AS "openShipments"`,
      [companyId],
    );

    return rows[0];
  }
}
