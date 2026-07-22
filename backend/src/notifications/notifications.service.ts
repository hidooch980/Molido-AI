import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * همه هشدارهای مهم کسب‌وکار در یک درخواست
   */
  async getAllAlerts(companyId: string) {
    const [lowStock, expiring, unpaidSales, pendingPurchases] =
      await Promise.all([
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

  /**
   * هشدار کمبود موجودی بر اساس حداقل موجودی هر کالا
   */
  async getLowStockAlerts(companyId: string) {
    const inventories = await this.prisma.inventory.findMany({
      where: { warehouse: { companyId } },
      include: {
        product: {
          select: { id: true, name: true, sku: true, minStock: true, unit: true },
        },
        warehouse: { select: { id: true, name: true } },
      },
    });

    return inventories.filter(
      (inv: any) => Number(inv.quantity) <= Number(inv.product.minStock),
    );
  }

  /**
   * هشدار کالاهای نزدیک به تاریخ انقضا (۳۰ روز آینده)
   */
  async getExpiryAlerts(companyId: string) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + 30);

    return this.prisma.product.findMany({
      where: {
        companyId,
        expiryDate: { not: null, lte: threshold },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        expiryDate: true,
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  /**
   * فاکتورهای پرداخت‌نشده یا بدهی‌دار
   */
  async getUnpaidSales(companyId: string) {
    return this.prisma.sale.findMany({
      where: {
        companyId,
        status: { in: ['PENDING', 'PARTIAL'] },
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * فاکتورهای خرید در انتظار دریافت
   */
  async getPendingPurchases(companyId: string) {
    return this.prisma.purchase.findMany({
      where: { companyId, status: 'PENDING' },
      include: {
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getRecentSalesAlerts(companyId: string) {
    return this.prisma.sale.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }
}
