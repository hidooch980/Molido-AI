import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Params } from '../database/sql';

/** Sale and purchase statuses that never count as turnover. */
const IGNORED_STATUSES = ['CANCELLED', 'DRAFT'];

const INVENTORY_WITH_PRODUCT = `
  SELECT i.*,
         p.name AS "productName", p.sku AS "productSku", p.unit AS "productUnit",
         p."minStock" AS "productMinStock", p."purchasePrice" AS "productPurchasePrice",
         p."salePrice" AS "productSalePrice",
         w.name AS "warehouseName"
  FROM "Inventory" i
  JOIN "Product" p ON p.id = i."productId"
  JOIN "Warehouse" w ON w.id = i."warehouseId"
`;

/** Byte-order mark, so Excel opens the CSV as UTF-8 rather than mojibake. */
const BOM = '﻿';

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  /** Appends an optional created-at range to a WHERE clause under `alias`. */
  private range(params: Params, alias: string, from?: string, to?: string): string {
    const parts: string[] = [];
    if (from) parts.push(`AND ${alias}."createdAt" >= ${params.next(new Date(from))}`);
    if (to) parts.push(`AND ${alias}."createdAt" <= ${params.next(new Date(to))}`);
    return parts.join(' ');
  }

  /** داشبورد کلی کسب‌وکار */
  async dashboard(companyId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const rows = await this.db.query<Record<string, string>>(
      `SELECT
         (SELECT COALESCE(sum(total), 0)::text FROM "Sale"
          WHERE "companyId" = $1 AND NOT (status = ANY($2)) AND "createdAt" >= $3) AS today_total,
         (SELECT count(*)::text FROM "Sale"
          WHERE "companyId" = $1 AND NOT (status = ANY($2)) AND "createdAt" >= $3) AS today_count,
         (SELECT COALESCE(sum(total), 0)::text FROM "Sale"
          WHERE "companyId" = $1 AND NOT (status = ANY($2)) AND "createdAt" >= $4) AS month_total,
         (SELECT count(*)::text FROM "Sale"
          WHERE "companyId" = $1 AND NOT (status = ANY($2)) AND "createdAt" >= $4) AS month_count,
         (SELECT COALESCE(sum(amount), 0)::text FROM "Expense"
          WHERE "companyId" = $1 AND status = 'PAID' AND "createdAt" >= $4) AS month_expenses,
         (SELECT count(*)::text FROM "Product" WHERE "companyId" = $1) AS products_count,
         (SELECT count(*)::text FROM "Customer" WHERE "companyId" = $1) AS customers_count,
         (SELECT count(*)::text FROM "Purchase"
          WHERE "companyId" = $1 AND status = 'PENDING') AS pending_purchases,
         (SELECT count(*)::text FROM "Inventory" i
            JOIN "Product" p ON p.id = i."productId"
            JOIN "Warehouse" w ON w.id = i."warehouseId"
          WHERE w."companyId" = $1 AND i.quantity <= p."minStock") AS low_stock_count,
         (SELECT COALESCE(sum(i.quantity * p."purchasePrice"), 0)::text FROM "Inventory" i
            JOIN "Product" p ON p.id = i."productId"
            JOIN "Warehouse" w ON w.id = i."warehouseId"
          WHERE w."companyId" = $1) AS inventory_value`,
      [companyId, IGNORED_STATUSES, startOfDay, startOfMonth],
    );

    const row = rows[0] ?? {};
    return {
      todaySalesTotal: Number(row.today_total ?? 0),
      todaySalesCount: Number(row.today_count ?? 0),
      monthSalesTotal: Number(row.month_total ?? 0),
      monthSalesCount: Number(row.month_count ?? 0),
      monthExpensesTotal: Number(row.month_expenses ?? 0),
      productsCount: Number(row.products_count ?? 0),
      customersCount: Number(row.customers_count ?? 0),
      pendingPurchases: Number(row.pending_purchases ?? 0),
      lowStockCount: Number(row.low_stock_count ?? 0),
      inventoryValue: Number(row.inventory_value ?? 0),
    };
  }

  /** گزارش فروش روزانه در بازه زمانی */
  async salesReport(companyId: string, from?: string, to?: string) {
    const params = new Params();
    const companyParam = params.next(companyId);
    const statusParam = params.next(IGNORED_STATUSES);
    const dates = this.range(params, 's', from, to);

    const daily = await this.db.query<{ date: string; total: string; count: string }>(
      `SELECT to_char(date_trunc('day', s."createdAt"), 'YYYY-MM-DD') AS date,
              COALESCE(sum(s.total), 0)::text AS total,
              count(*)::text AS count
       FROM "Sale" s
       WHERE s."companyId" = ${companyParam} AND NOT (s.status = ANY(${statusParam})) ${dates}
       GROUP BY 1 ORDER BY 1 ASC`,
      params.values,
    );

    return {
      totalRevenue: daily.reduce((sum, row) => sum + Number(row.total), 0),
      totalInvoices: daily.reduce((sum, row) => sum + Number(row.count), 0),
      daily: daily.map((row) => ({
        date: row.date,
        total: Number(row.total),
        count: Number(row.count),
      })),
    };
  }

  /** گزارش سود: درآمد فروش منهای قیمت خرید کالاهای فروخته‌شده */
  async profitReport(companyId: string, from?: string, to?: string) {
    const params = new Params();
    const companyParam = params.next(companyId);
    const statusParam = params.next(IGNORED_STATUSES);
    const dates = this.range(params, 's', from, to);

    const rows = await this.db.query<{ revenue: string; cost: string }>(
      `SELECT COALESCE(sum(i.total), 0)::text AS revenue,
              COALESCE(sum(i.quantity * p."purchasePrice"), 0)::text AS cost
       FROM "SaleItem" i
       JOIN "Sale" s ON s.id = i."saleId"
       JOIN "Product" p ON p.id = i."productId"
       WHERE s."companyId" = ${companyParam} AND NOT (s.status = ANY(${statusParam})) ${dates}`,
      params.values,
    );

    const revenue = Number(rows[0]?.revenue ?? 0);
    const cost = Number(rows[0]?.cost ?? 0);
    return {
      revenue,
      cost,
      profit: revenue - cost,
      margin: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0,
    };
  }

  /** گزارش پرفروش‌ترین کالاها */
  async topProducts(companyId: string, limit = 10) {
    const rows = await this.db.query<{
      productId: string;
      name: string;
      sku: string;
      quantity: string;
      revenue: string;
    }>(
      `SELECT i."productId", p.name, p.sku,
              sum(i.quantity)::text AS quantity,
              sum(i.total)::text AS revenue
       FROM "SaleItem" i
       JOIN "Sale" s ON s.id = i."saleId"
       JOIN "Product" p ON p.id = i."productId"
       WHERE s."companyId" = $1 AND NOT (s.status = ANY($2))
       GROUP BY i."productId", p.name, p.sku
       ORDER BY sum(i.total) DESC LIMIT $3`,
      [companyId, IGNORED_STATUSES, limit],
    );

    return rows.map((row) => ({
      productId: row.productId,
      name: row.name,
      sku: row.sku,
      quantity: Number(row.quantity),
      revenue: Number(row.revenue),
    }));
  }

  async purchasesReport(companyId: string) {
    const purchases = await this.db.query<Record<string, unknown>>(
      `SELECT p.*, s.name AS "supplierName" FROM "Purchase" p
       LEFT JOIN "Supplier" s ON s.id = p."supplierId"
       WHERE p."companyId" = $1 AND NOT (p.status = ANY($2))
       ORDER BY p."createdAt" DESC`,
      [companyId, IGNORED_STATUSES],
    );

    return {
      totalAmount: purchases.reduce((sum, purchase) => sum + Number(purchase.total), 0),
      totalCount: purchases.length,
      purchases,
    };
  }

  async inventoryReport(companyId: string) {
    const items = await this.db.query<Record<string, unknown>>(
      `${INVENTORY_WITH_PRODUCT} WHERE w."companyId" = $1`,
      [companyId],
    );

    return {
      totalItems: items.length,
      totalValue: items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.productPurchasePrice),
        0,
      ),
      lowStock: items.filter(
        (item) => Number(item.quantity) <= Number(item.productMinStock),
      ),
      items,
    };
  }

  /** خروجی CSV گزارش فروش */
  async salesReportCsv(companyId: string, from?: string, to?: string) {
    const params = new Params();
    const companyParam = params.next(companyId);
    const dates = this.range(params, 's', from, to);

    const sales = await this.db.query<Record<string, unknown>>(
      `SELECT s.*, c."firstName" AS "customerFirstName", c."lastName" AS "customerLastName"
       FROM "Sale" s LEFT JOIN "Customer" c ON c.id = s."customerId"
       WHERE s."companyId" = ${companyParam} ${dates} ORDER BY s."createdAt" DESC`,
      params.values,
    );

    const header = [
      'invoiceNo',
      'date',
      'customer',
      'status',
      'subtotal',
      'discount',
      'tax',
      'total',
    ].join(',');

    const rows = sales.map((sale) =>
      [
        csvCell(sale.invoiceNo),
        csvCell(new Date(sale.createdAt as string).toISOString().slice(0, 10)),
        csvCell(
          sale.customerFirstName
            ? `${sale.customerFirstName} ${sale.customerLastName ?? ''}`.trim()
            : '',
        ),
        csvCell(sale.status),
        Number(sale.subtotal),
        Number(sale.discount),
        Number(sale.tax),
        Number(sale.total),
      ].join(','),
    );

    return BOM + [header, ...rows].join('\n');
  }

  /** خروجی CSV موجودی انبار */
  async inventoryReportCsv(companyId: string) {
    const items = await this.db.query<Record<string, unknown>>(
      `${INVENTORY_WITH_PRODUCT} WHERE w."companyId" = $1`,
      [companyId],
    );

    const header = ['warehouse', 'product', 'sku', 'quantity', 'minStock', 'value'].join(',');

    const rows = items.map((item) =>
      [
        csvCell(item.warehouseName),
        csvCell(item.productName),
        csvCell(item.productSku),
        Number(item.quantity),
        Number(item.productMinStock ?? 0),
        Number(item.quantity) * Number(item.productPurchasePrice ?? 0),
      ].join(','),
    );

    return BOM + [header, ...rows].join('\n');
  }
  /**
   * گزارش تفصیلی فروش — همهٔ برش‌ها در یک رفت‌وبرگشت.
   *
   * چهار پرس‌وجوی جدا برای مشتری/ساعت/صندوق‌دار/روش پرداخت گرفته می‌شود، نه
   * یک پرس‌وجوی بزرگ با چند GROUP BY: ترکیبشان سطرها را ضرب می‌کند و مبالغ
   * را چند بار می‌شمارد — همان خطایی که در گزارش‌های دست‌ساز رایج است.
   *
   * مبلغ فروش همیشه `total` سربرگ فاکتور است تا با دفتر کل یکی بماند؛
   * جمع‌زدن سطرها به‌خاطر تخفیف و مالیات عدد دیگری می‌دهد.
   */
  async salesBreakdown(companyId: string, from?: string, to?: string) {
    const statuses = IGNORED_STATUSES.map((item) => `'${item}'`).join(',');

    const fromIndex = 2;
    const toIndex = from ? 3 : 2;

    const where = (alias: string) => {
      const parts = [`${alias}."companyId" = $1`, `${alias}.status NOT IN (${statuses})`];
      // شمارهٔ پارامتر پویاست: اگر `from` نباشد، `to` می‌شود $2 نه $3.
      if (from) parts.push(`${alias}."createdAt" >= $${fromIndex}::timestamptz`);
      if (to) parts.push(`${alias}."createdAt" <= $${toIndex}::timestamptz`);
      return parts.join(' AND ');
    };

    // فقط پارامترهایی فرستاده می‌شوند که واقعاً در SQL آمده‌اند: PostgreSQL
    // پارامتر اضافه را خطا می‌گیرد، نه نادیده.
    const values: unknown[] = [companyId];
    if (from) values.push(from);
    if (to) values.push(to);

    const [byCustomer, byHour, byUser, byMethod, byProduct, tax, returns] =
      await Promise.all([
        this.db.query(
          `SELECT COALESCE(
                    NULLIF(TRIM(COALESCE(c."firstName",'') || ' ' || COALESCE(c."lastName",'')), ''),
                    'مشتری متفرقه') AS name,
                  COUNT(*) AS invoices, SUM(s.total) AS total
             FROM "Sale" s LEFT JOIN "Customer" c ON c.id = s."customerId"
            WHERE ${where('s')}
            GROUP BY 1 ORDER BY SUM(s.total) DESC LIMIT 50`,
          values,
        ),

        // ساعت‌های اوج: برای تصمیم دربارهٔ شیفت و تعداد صندوق‌دار
        this.db.query(
          `SELECT EXTRACT(HOUR FROM s."createdAt")::int AS hour,
                  COUNT(*) AS invoices, SUM(s.total) AS total
             FROM "Sale" s WHERE ${where('s')}
            GROUP BY 1 ORDER BY 1`,
          values,
        ),

        this.db.query(
          `SELECT TRIM(COALESCE(u."firstName",'') || ' ' || COALESCE(u."lastName",'')) AS name,
                  COUNT(*) AS invoices, SUM(s.total) AS total
             FROM "Sale" s LEFT JOIN "User" u ON u.id = s."userId"
            WHERE ${where('s')}
            GROUP BY 1 ORDER BY SUM(s.total) DESC`,
          values,
        ),

        // روش پرداخت از جدول Payment می‌آید نه Sale: یک فاکتور می‌تواند
        // نقد + کارت باشد و در سربرگ فقط یک روش نمی‌گنجد.
        this.db.query(
          `SELECT p.method, COUNT(*) AS count, SUM(p.amount) AS total
             FROM "Payment" p JOIN "Sale" s ON s.id = p."saleId"
            WHERE ${where('s')} AND p.status = 'COMPLETED'
            GROUP BY 1 ORDER BY SUM(p.amount) DESC`,
          values,
        ),

        // سود به تفکیک کالا — درآمد منهای بهای تمام‌شده
        this.db.query(
          `SELECT pr.id AS "productId", pr.name, pr.sku,
                  SUM(si.quantity) AS quantity,
                  SUM(si.total) AS revenue,
                  SUM(si.quantity * pr."purchasePrice") AS cost,
                  SUM(si.total) - SUM(si.quantity * pr."purchasePrice") AS profit
             FROM "SaleItem" si
             JOIN "Sale" s ON s.id = si."saleId"
             JOIN "Product" pr ON pr.id = si."productId"
            WHERE ${where('s')}
            GROUP BY pr.id, pr.name, pr.sku
            ORDER BY 7 DESC LIMIT 50`,
          values,
        ),

        this.db.query(
          `SELECT COALESCE(SUM(s.tax),0) AS "outputVat",
                  COALESCE(SUM(s.subtotal),0) AS "taxableBase",
                  COUNT(*) AS invoices
             FROM "Sale" s WHERE ${where('s')}`,
          values,
        ),

        this.db.query(
          `SELECT COUNT(*) AS count, COALESCE(SUM(r."totalAmount"),0) AS total
             FROM "ProductReturn" r
            WHERE r."companyId" = $1 AND r.type = 'SALE' AND r.status = 'APPLIED'
              ${from ? `AND r."createdAt" >= $${fromIndex}::timestamptz` : ''}
              ${to ? `AND r."createdAt" <= $${toIndex}::timestamptz` : ''}`,
          values,
        ),
      ]);

    return {
      byCustomer,
      byHour,
      byUser,
      byMethod,
      byProduct,
      tax: tax[0] ?? {},
      returns: returns[0] ?? {},
    };
  }

}
