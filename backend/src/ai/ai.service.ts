import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * تحلیل هوشمند فروش: روند، رشد و پیشنهاد
   */
  async salesAnalysis(companyId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 60);

    const sales = await this.prisma.sale.findMany({
      where: {
        companyId,
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        createdAt: { gte: since },
      },
      select: { total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    if (sales.length === 0) {
      return {
        summary: 'داده فروشی برای تحلیل وجود ندارد',
        insights: [],
      };
    }

    const midpoint = new Date();
    midpoint.setDate(midpoint.getDate() - 30);

    const firstHalf = sales.filter((s: any) => s.createdAt < midpoint);
    const secondHalf = sales.filter((s: any) => s.createdAt >= midpoint);

    const sum = (rows: Array<{ total: unknown }>) =>
      rows.reduce((acc: number, r: any) => acc + Number(r.total), 0);

    const firstTotal = sum(firstHalf);
    const secondTotal = sum(secondHalf);

    const growth =
      firstTotal > 0
        ? Math.round(((secondTotal - firstTotal) / firstTotal) * 100)
        : secondTotal > 0
          ? 100
          : 0;

    // پرفروش‌ترین روز هفته
    const dayTotals = new Map<number, number>();

    for (const sale of sales) {
      const day = sale.createdAt.getDay();
      dayTotals.set(day, (dayTotals.get(day) ?? 0) + Number(sale.total));
    }

    const dayNames = [
      'یکشنبه',
      'دوشنبه',
      'سه‌شنبه',
      'چهارشنبه',
      'پنجشنبه',
      'جمعه',
      'شنبه',
    ];

    const bestDayEntry = Array.from(dayTotals.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0];

    const insights: string[] = [];

    if (growth > 10) {
      insights.push(`فروش ماه اخیر ${growth}٪ رشد داشته است — روند مثبت است`);
    } else if (growth < -10) {
      insights.push(
        `فروش ماه اخیر ${Math.abs(growth)}٪ کاهش داشته است — بررسی قیمت‌گذاری و موجودی توصیه می‌شود`,
      );
    } else {
      insights.push('فروش در ماه اخیر تقریباً ثابت بوده است');
    }

    if (bestDayEntry) {
      insights.push(
        `پرفروش‌ترین روز هفته: ${dayNames[bestDayEntry[0]]} — برای تبلیغات و تأمین موجودی روی این روز تمرکز کنید`,
      );
    }

    const avgInvoice = sum(sales) / sales.length;

    return {
      period: '۶۰ روز اخیر',
      totalRevenue: sum(sales),
      invoiceCount: sales.length,
      averageInvoice: Math.round(avgInvoice),
      growthPercent: growth,
      bestDay: bestDayEntry ? dayNames[bestDayEntry[0]] : null,
      insights,
    };
  }

  /**
   * تحلیل موجودی: پیش‌بینی اتمام موجودی بر اساس سرعت فروش
   */
  async inventoryAnalysis(companyId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [inventories, soldItems] = await Promise.all([
      this.prisma.inventory.findMany({
        where: { warehouse: { companyId } },
        include: {
          product: {
            select: { id: true, name: true, sku: true, minStock: true },
          },
        },
      }),
      this.prisma.saleItem.findMany({
        where: {
          sale: {
            companyId,
            status: { notIn: ['CANCELLED', 'DRAFT'] },
            createdAt: { gte: since },
          },
        },
        select: { productId: true, quantity: true },
      }),
    ]);

    // سرعت فروش روزانه هر کالا
    const dailyVelocity = new Map<string, number>();

    for (const item of soldItems) {
      dailyVelocity.set(
        item.productId,
        (dailyVelocity.get(item.productId) ?? 0) + Number(item.quantity) / 30,
      );
    }

    const analysis = inventories.map((inv: any) => {
      const velocity = dailyVelocity.get(inv.productId) ?? 0;
      const quantity = Number(inv.quantity);

      const daysToStockout =
        velocity > 0 ? Math.round(quantity / velocity) : null;

      return {
        productId: inv.productId,
        name: inv.product.name,
        sku: inv.product.sku,
        quantity,
        minStock: Number(inv.product.minStock),
        dailySalesVelocity: Math.round(velocity * 1000) / 1000,
        daysToStockout,
        needsRestock:
          quantity <= Number(inv.product.minStock) ||
          (daysToStockout !== null && daysToStockout <= 7),
      };
    });

    return {
      period: '۳۰ روز اخیر',
      needsRestock: analysis.filter((a: any) => a.needsRestock),
      items: analysis,
    };
  }

  /**
   * پیشنهاد قیمت بر اساس حاشیه سود
   */
  async priceSuggestions(companyId: string, targetMarginPercent = 25) {
    const products = await this.prisma.product.findMany({
      where: { companyId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        sku: true,
        purchasePrice: true,
        salePrice: true,
      },
    });

    return products.map((product: any) => {
      const purchasePrice = Number(product.purchasePrice);
      const salePrice = Number(product.salePrice);

      const currentMargin =
        salePrice > 0
          ? Math.round(((salePrice - purchasePrice) / salePrice) * 100)
          : 0;

      const suggestedPrice = Math.round(
        purchasePrice / (1 - targetMarginPercent / 100),
      );

      return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        purchasePrice,
        currentPrice: salePrice,
        currentMarginPercent: currentMargin,
        suggestedPrice,
        recommendation:
          currentMargin < targetMarginPercent
            ? `حاشیه سود کمتر از هدف (${targetMarginPercent}٪) است — افزایش قیمت به ${suggestedPrice} پیشنهاد می‌شود`
            : 'قیمت‌گذاری مناسب است',
      };
    });
  }

  /**
   * هشدار کالاهای نزدیک به انقضا
   */
  async expiryAnalysis(companyId: string, daysAhead = 30) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysAhead);

    const products = await this.prisma.product.findMany({
      where: {
        companyId,
        expiryDate: { not: null, lte: threshold },
      },
      select: {
        id: true,
        name: true,
        sku: true,
        expiryDate: true,
        inventories: { select: { quantity: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });

    const now = Date.now();

    return products.map((product: any) => {
      const expiry = product.expiryDate as Date;
      const daysLeft = Math.ceil(
        (expiry.getTime() - now) / (1000 * 60 * 60 * 24),
      );

      const totalQuantity = product.inventories.reduce((sum: number, inv: any) => sum + Number(inv.quantity),
        0,
      );

      return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        expiryDate: expiry,
        daysLeft,
        totalQuantity,
        status: daysLeft < 0 ? 'منقضی‌شده' : daysLeft <= 7 ? 'بحرانی' : 'نزدیک انقضا',
      };
    });
  }

  /**
   * گزارش مدیریتی هوشمند — با OpenAI در صورت وجود کلید، در غیر این صورت تحلیل داخلی
   */
  async managerReport(companyId: string, lang: string = 'fa') {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [sales, expenses, productsCount, customersCount] = await Promise.all(
      [
        this.prisma.sale.findMany({
          where: {
            companyId,
            createdAt: { gte: monthStart },
            status: { not: 'CANCELLED' as never },
          },
          select: { total: true },
        }),
        this.prisma.expense.findMany({
          where: { companyId, createdAt: { gte: monthStart } },
          select: { amount: true },
        }),
        this.prisma.product.count({ where: { companyId } }),
        this.prisma.customer.count({ where: { companyId } }),
      ],
    );

    const totalSales = (sales as Array<any>).reduce(
      (sum: number, sale: any) => sum + Number(sale.total),
      0,
    );
    const totalExpenses = (expenses as Array<any>).reduce(
      (sum: number, expense: any) => sum + Number(expense.amount),
      0,
    );

    const stats = {
      period: 'ماه جاری',
      salesCount: sales.length,
      totalSales,
      totalExpenses,
      netCashFlow: totalSales - totalExpenses,
      productsCount,
      customersCount,
    };

    const g = globalThis as never as {
      process?: { env?: Record<string, string | undefined> };
      fetch?: (
        url: string,
        init?: unknown,
      ) => Promise<{ ok: boolean; json: () => Promise<any> }>;
    };

    const apiKey = g.process?.env?.OPENAI_API_KEY;

    if (apiKey && g.fetch) {
      try {
        const response = await g.fetch(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content:
                    lang === 'en'
                      ? 'You are a financial analyst. Based on the given stats, write a short, actionable management report in English.'
                      : lang === 'ar'
                        ? 'أنت محلل مالي. بناءً على الإحصائيات المعطاة، اكتب تقريراً إدارياً قصيراً وعملياً باللغة العربية.'
                        : 'تو یک تحلیل‌گر مالی هستی. بر اساس آمار داده‌شده یک گزارش مدیریتی کوتاه و کاربردی به فارسی بنویس.',
                },
                { role: 'user', content: JSON.stringify(stats) },
              ],
              max_tokens: 500,
            }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          const text = data?.choices?.[0]?.message?.content;

          if (text) {
            return { source: 'openai', stats, report: text };
          }
        }
      } catch {
        // در صورت خطا از تحلیل داخلی استفاده می‌شود
      }
    }

    const net = totalSales - totalExpenses;

    const linesByLang: Record<string, Array<string>> = {
      fa: [
      `در ماه جاری ${stats.salesCount} فاکتور فروش به ارزش ${totalSales.toLocaleString('fa-IR')} ثبت شده است.`,
      `هزینه‌های این ماه ${totalExpenses.toLocaleString('fa-IR')} بوده است.`,
      net >= 0
        ? `جریان نقدی مثبت است (${net.toLocaleString('fa-IR')}).`
        : `⚠️ جریان نقدی منفی است (${net.toLocaleString('fa-IR')}) — کاهش هزینه‌ها یا افزایش فروش توصیه می‌شود.`,
      `تعداد کالاها: ${productsCount} | تعداد مشتریان: ${customersCount}`,
      ],
      en: [
        `This month, ${stats.salesCount} sales invoices totaling ${Number(stats.totalSales).toLocaleString()} were recorded.`,
        `Paid expenses this month: ${Number(stats.totalExpenses).toLocaleString()}.`,
        Number(stats.netCashFlow) >= 0
          ? `Cash flow is positive (${Number(stats.netCashFlow).toLocaleString()}).`
          : `⚠️ Cash flow is negative (${Number(stats.netCashFlow).toLocaleString()}) — reduce costs or boost sales.`,
        `Products: ${stats.productsCount} | Customers: ${stats.customersCount}`,
      ],
      ar: [
        `تم هذا الشهر تسجيل ${stats.salesCount} فاتورة بيع بإجمالي ${Number(stats.totalSales).toLocaleString()}.`,
        `المصروفات المدفوعة هذا الشهر: ${Number(stats.totalExpenses).toLocaleString()}.`,
        Number(stats.netCashFlow) >= 0
          ? `التدفق النقدي إيجابي (${Number(stats.netCashFlow).toLocaleString()}).`
          : `⚠️ التدفق النقدي سلبي (${Number(stats.netCashFlow).toLocaleString()}) — قلل التكاليف أو زد المبيعات.`,
        `المنتجات: ${stats.productsCount} | العملاء: ${stats.customersCount}`,
      ],
    };

    const lines = linesByLang[lang] ?? linesByLang['fa'];

    return { source: 'internal', stats, report: lines.join('\n') };
  }

}
