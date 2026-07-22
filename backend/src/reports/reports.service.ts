import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * داشبورد کلی کسب‌وکار
   */
  async dashboard(companyId: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      todaySales,
      monthSales,
      monthExpenses,
      productsCount,
      customersCount,
      pendingPurchases,
      inventories,
    ] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          companyId,
          status: { notIn: ['CANCELLED', 'DRAFT'] },
          createdAt: { gte: startOfDay },
        },
        select: { total: true },
      }),
      this.prisma.sale.findMany({
        where: {
          companyId,
          status: { notIn: ['CANCELLED', 'DRAFT'] },
          createdAt: { gte: startOfMonth },
        },
        select: { total: true },
      }),
      this.prisma.expense.findMany({
        where: {
          companyId,
          status: 'PAID',
          createdAt: { gte: startOfMonth },
        },
        select: { amount: true },
      }),
      this.prisma.product.count({ where: { companyId } }),
      this.prisma.customer.count({ where: { companyId } }),
      this.prisma.purchase.count({
        where: { companyId, status: 'PENDING' },
      }),
      this.prisma.inventory.findMany({
        where: { warehouse: { companyId } },
        include: {
          product: { select: { minStock: true, purchasePrice: true } },
        },
      }),
    ]);

    const sumTotals = (rows: Array<{ total: unknown }>) =>
      rows.reduce((sum: number, r: any) => sum + Number(r.total), 0);

    const lowStockCount = inventories.filter(
      (inv: any) => Number(inv.quantity) <= Number(inv.product.minStock),
    ).length;

    const inventoryValue = inventories.reduce((sum: number, inv: any) =>
        sum + Number(inv.quantity) * Number(inv.product.purchasePrice),
      0,
    );

    return {
      todaySalesTotal: sumTotals(todaySales),
      todaySalesCount: todaySales.length,
      monthSalesTotal: sumTotals(monthSales),
      monthSalesCount: monthSales.length,
      monthExpensesTotal: monthExpenses.reduce((sum: number, e: any) => sum + Number(e.amount),
        0,
      ),
      productsCount,
      customersCount,
      pendingPurchases,
      lowStockCount,
      inventoryValue,
    };
  }

  /**
   * گزارش فروش روزانه در بازه زمانی
   */
  async salesReport(companyId: string, from?: string, to?: string) {
    const sales = await this.prisma.sale.findMany({
      where: {
        companyId,
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      select: { total: true, discount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const byDay = new Map<
      string,
      { date: string; total: number; count: number }
    >();

    for (const sale of sales) {
      const day = sale.createdAt.toISOString().slice(0, 10);
      const entry = byDay.get(day) ?? { date: day, total: 0, count: 0 };

      entry.total += Number(sale.total);
      entry.count += 1;

      byDay.set(day, entry);
    }

    return {
      totalRevenue: sales.reduce((sum: number, s: any) => sum + Number(s.total), 0),
      totalInvoices: sales.length,
      daily: Array.from(byDay.values()),
    };
  }

  /**
   * گزارش سود: درآمد فروش منهای قیمت خرید کالاهای فروخته‌شده
   */
  async profitReport(companyId: string, from?: string, to?: string) {
    const items = await this.prisma.saleItem.findMany({
      where: {
        sale: {
          companyId,
          status: { notIn: ['CANCELLED', 'DRAFT'] },
          ...(from || to
            ? {
                createdAt: {
                  ...(from ? { gte: new Date(from) } : {}),
                  ...(to ? { lte: new Date(to) } : {}),
                },
              }
            : {}),
        },
      },
      include: {
        product: {
          select: { id: true, name: true, purchasePrice: true },
        },
      },
    });

    let revenue = 0;
    let cost = 0;

    for (const item of items) {
      revenue += Number(item.total);
      cost += Number(item.quantity) * Number(item.product.purchasePrice);
    }

    return {
      revenue,
      cost,
      profit: revenue - cost,
      margin: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0,
    };
  }

  /**
   * گزارش پرفروش‌ترین کالاها
   */
  async topProducts(companyId: string, limit = 10) {
    const items = await this.prisma.saleItem.findMany({
      where: {
        sale: { companyId, status: { notIn: ['CANCELLED', 'DRAFT'] } },
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
    });

    const byProduct = new Map<
      string,
      { productId: string; name: string; sku: string; quantity: number; revenue: number }
    >();

    for (const item of items) {
      const entry = byProduct.get(item.productId) ?? {
        productId: item.productId,
        name: item.product.name,
        sku: item.product.sku,
        quantity: 0,
        revenue: 0,
      };

      entry.quantity += Number(item.quantity);
      entry.revenue += Number(item.total);

      byProduct.set(item.productId, entry);
    }

    return Array.from(byProduct.values())
      .sort((a: any, b: any) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  async purchasesReport(companyId: string) {
    const purchases = await this.prisma.purchase.findMany({
      where: { companyId, status: { notIn: ['CANCELLED', 'DRAFT'] } },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      totalAmount: purchases.reduce((sum: number, p: any) => sum + Number(p.total), 0),
      totalCount: purchases.length,
      purchases,
    };
  }

  async inventoryReport(companyId: string) {
    const inventories = await this.prisma.inventory.findMany({
      where: { warehouse: { companyId } },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            minStock: true,
            purchasePrice: true,
            salePrice: true,
          },
        },
        warehouse: { select: { id: true, name: true } },
      },
    });

    const totalValue = inventories.reduce((sum: number, inv: any) =>
        sum + Number(inv.quantity) * Number(inv.product.purchasePrice),
      0,
    );

    return {
      totalItems: inventories.length,
      totalValue,
      lowStock: inventories.filter(
        (inv: any) => Number(inv.quantity) <= Number(inv.product.minStock),
      ),
      items: inventories,
    };
  }

  /**
   * خروجی CSV گزارش فروش
   */
  async salesReportCsv(companyId: string, from?: string, to?: string) {
    const sales: Array<any> = await this.prisma.sale.findMany({
      where: {
        companyId,
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: {
        customer: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const esc = (value: unknown) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;

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

    const rows = sales.map((sale: any) =>
      [
        esc(sale.invoiceNo),
        esc(new Date(sale.createdAt).toISOString().slice(0, 10)),
        esc(
          sale.customer
            ? `${sale.customer.firstName} ${sale.customer.lastName ?? ''}`.trim()
            : '',
        ),
        esc(sale.status),
        Number(sale.subtotal),
        Number(sale.discount),
        Number(sale.tax),
        Number(sale.total),
      ].join(','),
    );

    return '\uFEFF' + [header, ...rows].join('\n');
  }

  /**
   * خروجی CSV موجودی انبار
   */
  async inventoryReportCsv(companyId: string) {
    const inventories: Array<any> = await this.prisma.inventory.findMany({
      where: { warehouse: { companyId } },
      include: {
        product: {
          select: {
            name: true,
            sku: true,
            purchasePrice: true,
            minStock: true,
          },
        },
        warehouse: { select: { name: true } },
      },
    });

    const esc = (value: unknown) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;

    const header = [
      'warehouse',
      'product',
      'sku',
      'quantity',
      'minStock',
      'value',
    ].join(',');

    const rows = inventories.map((inventory: any) =>
      [
        esc(inventory.warehouse?.name),
        esc(inventory.product?.name),
        esc(inventory.product?.sku),
        Number(inventory.quantity),
        Number(inventory.product?.minStock ?? 0),
        Number(inventory.quantity) *
          Number(inventory.product?.purchasePrice ?? 0),
      ].join(','),
    );

    return '\uFEFF' + [header, ...rows].join('\n');
  }

}
