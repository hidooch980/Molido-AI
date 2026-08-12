import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/** How far ahead an expiry date counts as an alert. */
const EXPIRY_WINDOW_DAYS = 30;
const ALERT_LIMIT = 50;

const SALE_WITH_CUSTOMER = `
  SELECT s.*, c."firstName" AS "customerFirstName", c."lastName" AS "customerLastName"
  FROM "Sale" s LEFT JOIN "Customer" c ON c.id = s."customerId"
`;

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  /** همه هشدارهای مهم کسب‌وکار در یک درخواست */
  async getAllAlerts(companyId: string) {
    const [lowStock, expiring, unpaidSales, pendingPurchases] = await Promise.all([
      this.getLowStockAlerts(companyId),
      this.getExpiryAlerts(companyId),
      this.getUnpaidSales(companyId),
      this.getPendingPurchases(companyId),
    ]);

    return {
      lowStockCount: lowStock.length,
      expiringCount: expiring.length,
      unpaidSalesCount: unpaidSales.length,
      pendingPurchasesCount: pendingPurchases.length,
      lowStock,
      expiring,
      unpaidSales,
      pendingPurchases,
    };
  }

  /** هشدار کمبود موجودی بر اساس حداقل موجودی هر کالا */
  async getLowStockAlerts(companyId: string) {
    return this.db.query(
      `SELECT i.*, p.name AS "productName", p.sku AS "productSku",
              p."minStock" AS "productMinStock", p.unit AS "productUnit",
              w.name AS "warehouseName"
       FROM "Inventory" i
       JOIN "Product" p ON p.id = i."productId"
       JOIN "Warehouse" w ON w.id = i."warehouseId"
       WHERE w."companyId" = $1 AND i.quantity <= p."minStock"`,
      [companyId],
    );
  }

  /** هشدار کالاهای نزدیک به تاریخ انقضا (۳۰ روز آینده) */
  async getExpiryAlerts(companyId: string) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + EXPIRY_WINDOW_DAYS);

    return this.db.query(
      `SELECT id, name, sku, "expiryDate" FROM "Product"
       WHERE "companyId" = $1 AND "expiryDate" IS NOT NULL AND "expiryDate" <= $2
       ORDER BY "expiryDate" ASC`,
      [companyId, threshold],
    );
  }

  /** فاکتورهای پرداخت‌نشده یا بدهی‌دار */
  async getUnpaidSales(companyId: string) {
    return this.db.query(
      `${SALE_WITH_CUSTOMER}
       WHERE s."companyId" = $1 AND s.status = ANY($2)
       ORDER BY s."createdAt" DESC LIMIT $3`,
      [companyId, ['PENDING', 'PARTIAL'], ALERT_LIMIT],
    );
  }

  /** فاکتورهای خرید در انتظار دریافت */
  async getPendingPurchases(companyId: string) {
    return this.db.query(
      `SELECT p.*, s.name AS "supplierName" FROM "Purchase" p
       LEFT JOIN "Supplier" s ON s.id = p."supplierId"
       WHERE p."companyId" = $1 AND p.status = 'PENDING'
       ORDER BY p."createdAt" DESC LIMIT $2`,
      [companyId, ALERT_LIMIT],
    );
  }

  async getRecentSalesAlerts(companyId: string) {
    return this.db.query(
      `${SALE_WITH_CUSTOMER} WHERE s."companyId" = $1 ORDER BY s."createdAt" DESC LIMIT 10`,
      [companyId],
    );
  }
}
