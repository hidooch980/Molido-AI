import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LlmService } from './llm.service';

/** Sale statuses that never count as turnover. */
const IGNORED_STATUSES = ['CANCELLED', 'DRAFT'];

/** پنجرهٔ محاسبهٔ سرعت فروش (روز). */
const VELOCITY_WINDOW_DAYS = 30;
/** فاصلهٔ سفارش تا تحویل، وقتی کاربر عددی ندهد. */
const DEFAULT_LEAD_TIME_DAYS = 7;
/** چند روز موجودی پس از تحویل پوشش داده شود. */
const DEFAULT_COVER_DAYS = 14;
const DEFAULT_DEAD_STOCK_DAYS = 60;
const DEFAULT_ANOMALY_DAYS = 30;
/** کمتر از این تعداد شیفت، انحراف معیار معنادار نیست. */
const MIN_SHIFTS_FOR_STDDEV = 5;
/** انحراف بیش از دو سیگما مشکوک تلقی می‌شود. */
const ANOMALY_Z_THRESHOLD = 2;
const FORECAST_WINDOW_DAYS = 56;
const DEFAULT_FORECAST_DAYS = 7;

/** getDay() از یکشنبه شروع می‌شود. */
const DAY_NAMES = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
  'شنبه',
];

@Injectable()
export class AiService {
  constructor(
    private readonly db: DatabaseService,
    private readonly llm: LlmService,
  ) {}

  /**
   * تحلیل هوشمند فروش: روند، رشد و پیشنهاد
   */
  async salesAnalysis(companyId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 60);

    const sales = await this.db.query<{ total: string; createdAt: Date }>(
      `SELECT total, "createdAt" FROM "Sale"
       WHERE "companyId" = $1 AND NOT (status = ANY($2)) AND "createdAt" >= $3
       ORDER BY "createdAt" ASC`,
      [companyId, IGNORED_STATUSES, since],
    );

    if (sales.length === 0) {
      return {
        summary: 'داده فروشی برای تحلیل وجود ندارد',
        insights: [],
      };
    }

    const midpoint = new Date();
    midpoint.setDate(midpoint.getDate() - 30);

    const firstHalf = sales.filter((sale) => new Date(sale.createdAt) < midpoint);
    const secondHalf = sales.filter((sale) => new Date(sale.createdAt) >= midpoint);

    const sum = (rows: Array<{ total: string }>) =>
      rows.reduce((acc, row) => acc + Number(row.total), 0);

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
      const day = new Date(sale.createdAt).getDay();
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
      this.db.query<{
        productId: string;
        quantity: string;
        productName: string;
        productSku: string;
        productMinStock: string;
      }>(
        `SELECT i."productId", i.quantity,
                p.name AS "productName", p.sku AS "productSku",
                p."minStock" AS "productMinStock"
         FROM "Inventory" i
         JOIN "Product" p ON p.id = i."productId"
         JOIN "Warehouse" w ON w.id = i."warehouseId"
         WHERE w."companyId" = $1`,
        [companyId],
      ),
      this.db.query<{ productId: string; quantity: string }>(
        `SELECT i."productId", i.quantity FROM "SaleItem" i
         JOIN "Sale" s ON s.id = i."saleId"
         WHERE s."companyId" = $1 AND NOT (s.status = ANY($2)) AND s."createdAt" >= $3`,
        [companyId, IGNORED_STATUSES, since],
      ),
    ]);

    // سرعت فروش روزانه هر کالا
    const dailyVelocity = new Map<string, number>();

    for (const item of soldItems) {
      dailyVelocity.set(
        item.productId,
        (dailyVelocity.get(item.productId) ?? 0) + Number(item.quantity) / 30,
      );
    }

    const analysis = inventories.map((inv) => {
      const velocity = dailyVelocity.get(inv.productId) ?? 0;
      const quantity = Number(inv.quantity);
      const minStock = Number(inv.productMinStock);

      const daysToStockout = velocity > 0 ? Math.round(quantity / velocity) : null;

      return {
        productId: inv.productId,
        name: inv.productName,
        sku: inv.productSku,
        quantity,
        minStock,
        dailySalesVelocity: Math.round(velocity * 1000) / 1000,
        daysToStockout,
        needsRestock:
          quantity <= minStock || (daysToStockout !== null && daysToStockout <= 7),
      };
    });

    return {
      period: '۳۰ روز اخیر',
      needsRestock: analysis.filter((item) => item.needsRestock),
      items: analysis,
    };
  }

  /**
   * پیشنهاد قیمت بر اساس حاشیه سود
   */
  async priceSuggestions(companyId: string, targetMarginPercent = 25) {
    const products = await this.db.query<{
      id: string;
      name: string;
      sku: string;
      purchasePrice: string;
      salePrice: string;
    }>(
      `SELECT id, name, sku, "purchasePrice", "salePrice" FROM "Product"
       WHERE "companyId" = $1 AND status = 'ACTIVE'`,
      [companyId],
    );

    return products.map((product) => {
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

    const products = await this.db.query<{
      id: string;
      name: string;
      sku: string;
      expiryDate: Date;
      totalQuantity: string;
    }>(
      `SELECT p.id, p.name, p.sku, p."expiryDate",
              COALESCE((SELECT sum(i.quantity) FROM "Inventory" i WHERE i."productId" = p.id), 0)
                AS "totalQuantity"
       FROM "Product" p
       WHERE p."companyId" = $1 AND p."expiryDate" IS NOT NULL AND p."expiryDate" <= $2
       ORDER BY p."expiryDate" ASC`,
      [companyId, threshold],
    );

    const now = Date.now();

    return products.map((product) => {
      const expiry = new Date(product.expiryDate);
      const daysLeft = Math.ceil((expiry.getTime() - now) / (1000 * 60 * 60 * 24));
      const totalQuantity = Number(product.totalQuantity);

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

    const rows = await this.db.query<Record<string, string>>(
      `SELECT
         (SELECT count(*)::text FROM "Sale"
          WHERE "companyId" = $1 AND "createdAt" >= $2 AND status <> 'CANCELLED') AS sales_count,
         (SELECT COALESCE(sum(total), 0)::text FROM "Sale"
          WHERE "companyId" = $1 AND "createdAt" >= $2 AND status <> 'CANCELLED') AS sales_total,
         (SELECT COALESCE(sum(amount), 0)::text FROM "Expense"
          WHERE "companyId" = $1 AND "createdAt" >= $2) AS expenses_total,
         (SELECT count(*)::text FROM "Product" WHERE "companyId" = $1) AS products_count,
         (SELECT count(*)::text FROM "Customer" WHERE "companyId" = $1) AS customers_count`,
      [companyId, monthStart],
    );

    const row = rows[0] ?? {};
    const salesCount = Number(row.sales_count ?? 0);
    const totalSales = Number(row.sales_total ?? 0);
    const totalExpenses = Number(row.expenses_total ?? 0);
    const productsCount = Number(row.products_count ?? 0);
    const customersCount = Number(row.customers_count ?? 0);

    const stats = {
      period: 'ماه جاری',
      salesCount,
      totalSales,
      totalExpenses,
      netCashFlow: totalSales - totalExpenses,
      productsCount,
      customersCount,
    };

    const prompts: Record<string, string> = {
      en: 'You are a financial analyst. Based on the given stats, write a short, actionable management report in English.',
      ar: 'أنت محلل مالي. بناءً على الإحصائيات المعطاة، اكتب تقريراً إدارياً قصيراً وعملياً باللغة العربية.',
      fa: 'تو یک تحلیل‌گر مالی هستی. بر اساس آمار داده‌شده یک گزارش مدیریتی کوتاه و کاربردی به فارسی بنویس.',
    };

    const generated = await this.llm.complete([
      { role: 'system', content: prompts[lang] ?? prompts.fa },
      { role: 'user', content: JSON.stringify(stats) },
    ]);

    if (generated) {
      return { source: this.llm.providerName, stats, report: generated };
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

  // ═══════════ تحلیل‌های فروشگاهی ═══════════
  // این‌ها ریاضی ساده روی دادهٔ خود فروشگاه‌اند و بدون اینترنت کار می‌کنند.

  /**
   * پیشنهاد سفارش خرید
   *
   * نقطهٔ سفارش = مصرف روزانه × زمان تأمین + ذخیرهٔ اطمینان.
   * ذخیرهٔ اطمینان از `minStock` کالا گرفته می‌شود، چون همان عددی است که
   * فروشگاه خودش تعیین کرده.
   */
  async reorderSuggestions(
    companyId: string,
    options?: { leadTimeDays?: number; coverDays?: number },
  ) {
    const leadTimeDays = Math.max(1, Number(options?.leadTimeDays ?? DEFAULT_LEAD_TIME_DAYS));
    const coverDays = Math.max(1, Number(options?.coverDays ?? DEFAULT_COVER_DAYS));

    const since = new Date();
    since.setDate(since.getDate() - VELOCITY_WINDOW_DAYS);

    const rows = await this.db.query<{
      productId: string;
      name: string;
      sku: string;
      unit: string;
      minStock: string;
      purchasePrice: string;
      onHand: string;
      sold: string;
    }>(
      `SELECT p.id AS "productId", p.name, p.sku, p.unit, p."minStock", p."purchasePrice",
              COALESCE((SELECT sum(i.quantity) FROM "Inventory" i
                        JOIN "Warehouse" w ON w.id = i."warehouseId"
                        WHERE i."productId" = p.id AND w."companyId" = $1), 0) AS "onHand",
              COALESCE((SELECT sum(si.quantity) FROM "SaleItem" si
                        JOIN "Sale" s ON s.id = si."saleId"
                        WHERE si."productId" = p.id AND s."companyId" = $1
                          AND NOT (s.status = ANY($2)) AND s."createdAt" >= $3), 0) AS sold
       FROM "Product" p
       WHERE p."companyId" = $1 AND p.status = 'ACTIVE' AND p."trackInventory"`,
      [companyId, IGNORED_STATUSES, since],
    );

    const suggestions = rows
      .map((row) => {
        const dailyVelocity = Number(row.sold) / VELOCITY_WINDOW_DAYS;
        const onHand = Number(row.onHand);
        const safetyStock = Number(row.minStock);
        const reorderPoint = Math.ceil(dailyVelocity * leadTimeDays + safetyStock);

        // تا پایان دورهٔ پوشش + زمان تأمین کافی باشد
        const target = Math.ceil(dailyVelocity * (leadTimeDays + coverDays) + safetyStock);
        const suggestedQty = Math.max(0, target - onHand);

        return {
          productId: row.productId,
          name: row.name,
          sku: row.sku,
          unit: row.unit,
          onHand,
          dailyVelocity: Math.round(dailyVelocity * 1000) / 1000,
          daysToStockout: dailyVelocity > 0 ? Math.round(onHand / dailyVelocity) : null,
          reorderPoint,
          suggestedQty,
          estimatedCost: Math.round(suggestedQty * Number(row.purchasePrice)),
          urgent: onHand <= safetyStock,
        };
      })
      // کالایی که نه فروش دارد نه کمبود، پیشنهادی هم ندارد
      .filter((item) => item.suggestedQty > 0 && (item.dailyVelocity > 0 || item.urgent))
      .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.estimatedCost - a.estimatedCost);

    return {
      period: `${VELOCITY_WINDOW_DAYS} روز اخیر`,
      leadTimeDays,
      coverDays,
      count: suggestions.length,
      estimatedTotal: suggestions.reduce((sum, item) => sum + item.estimatedCost, 0),
      items: suggestions,
    };
  }

  /**
   * کالای راکد — سرمایهٔ خوابیده
   *
   * موجودی‌ای که در بازهٔ داده‌شده هیچ فروشی نداشته است.
   */
  async deadStock(companyId: string, daysWithoutSale = DEFAULT_DEAD_STOCK_DAYS) {
    const since = new Date();
    since.setDate(since.getDate() - daysWithoutSale);

    const rows = await this.db.query<{
      productId: string;
      name: string;
      sku: string;
      unit: string;
      onHand: string;
      purchasePrice: string;
      avgCost: string | null;
      lastSoldAt: Date | null;
    }>(
      `SELECT p.id AS "productId", p.name, p.sku, p.unit, p."purchasePrice",
              COALESCE((SELECT sum(i.quantity) FROM "Inventory" i
                        JOIN "Warehouse" w ON w.id = i."warehouseId"
                        WHERE i."productId" = p.id AND w."companyId" = $1), 0) AS "onHand",
              -- میانگینِ موزونِ وزنی روی انبارها؛ ارزشِ واقعیِ خوابیده.
              (SELECT CASE WHEN sum(i.quantity) > 0
                           THEN sum(i.quantity * COALESCE(i."avgCost", p."purchasePrice"))
                                / sum(i.quantity) END
                 FROM "Inventory" i
                 JOIN "Warehouse" w ON w.id = i."warehouseId"
                WHERE i."productId" = p.id AND w."companyId" = $1) AS "avgCost",
              (SELECT max(s."createdAt") FROM "SaleItem" si
               JOIN "Sale" s ON s.id = si."saleId"
               WHERE si."productId" = p.id AND s."companyId" = $1
                 AND NOT (s.status = ANY($2))) AS "lastSoldAt"
       FROM "Product" p
       WHERE p."companyId" = $1 AND p.status = 'ACTIVE'`,
      [companyId, IGNORED_STATUSES],
    );

    const now = Date.now();

    const items = rows
      .filter((row) => {
        if (Number(row.onHand) <= 0) return false;
        return !row.lastSoldAt || new Date(row.lastSoldAt) < since;
      })
      .map((row) => {
        const onHand = Number(row.onHand);
        return {
          productId: row.productId,
          name: row.name,
          sku: row.sku,
          unit: row.unit,
          onHand,
          // سرمایهٔ خوابیده = ارزشِ واقعیِ موجودی، پس میانگین موزون
          // درست است نه آخرین بهای خرید.
          tiedUpCapital: Math.round(onHand * Number(row.avgCost ?? row.purchasePrice)),
          lastSoldAt: row.lastSoldAt,
          daysSinceLastSale: row.lastSoldAt
            ? Math.floor((now - new Date(row.lastSoldAt).getTime()) / 86_400_000)
            : null,
        };
      })
      .sort((a, b) => b.tiedUpCapital - a.tiedUpCapital);

    return {
      daysWithoutSale,
      count: items.length,
      tiedUpCapital: items.reduce((sum, item) => sum + item.tiedUpCapital, 0),
      items,
    };
  }

  /**
   * مغایرت غیرعادی صندوق
   *
   * کسری و اضافهٔ صندوق همیشه پیش می‌آید؛ آنچه اهمیت دارد الگوست.  انحراف هر
   * شیفت نسبت به انحراف معیار همان صندوق‌دار سنجیده می‌شود تا یک صندوق پرگردش
   * به‌اشتباه مشکوک جلوه نکند.
   */
  async cashierAnomalies(companyId: string, days = DEFAULT_ANOMALY_DAYS) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const shifts = await this.db.query<{
      id: string;
      userId: string;
      firstName: string;
      lastName: string;
      startedAt: Date;
      difference: string | null;
      salesTotal: string;
    }>(
      `SELECT c.id, c."userId", u."firstName", u."lastName", c."startedAt",
              c.difference, c."salesTotal"
       FROM "CashierShift" c JOIN "User" u ON u.id = c."userId"
       WHERE c."companyId" = $1 AND c."endedAt" IS NOT NULL AND c."startedAt" >= $2
       ORDER BY c."startedAt" DESC`,
      [companyId, since],
    );

    const byUser = new Map<string, number[]>();
    for (const shift of shifts) {
      if (shift.difference === null) continue;
      const list = byUser.get(shift.userId) ?? [];
      list.push(Number(shift.difference));
      byUser.set(shift.userId, list);
    }

    const stats = new Map<string, { mean: number; stdDev: number; total: number }>();
    for (const [userId, values] of byUser) {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance =
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
      stats.set(userId, {
        mean,
        stdDev: Math.sqrt(variance),
        total: values.reduce((sum, value) => sum + value, 0),
      });
    }

    const anomalies = shifts
      .filter((shift) => shift.difference !== null)
      .map((shift) => {
        const difference = Number(shift.difference);
        const stat = stats.get(shift.userId)!;

        // با کمتر از چند شیفت، انحراف معیار معنا ندارد؛ آستانهٔ ثابت می‌گذاریم.
        const enoughHistory =
          (byUser.get(shift.userId)?.length ?? 0) >= MIN_SHIFTS_FOR_STDDEV;
        const zScore =
          enoughHistory && stat.stdDev > 0
            ? Math.abs(difference - stat.mean) / stat.stdDev
            : 0;

        return {
          shiftId: shift.id,
          userId: shift.userId,
          cashierName: `${shift.firstName} ${shift.lastName}`.trim(),
          startedAt: shift.startedAt,
          difference,
          salesTotal: Number(shift.salesTotal),
          zScore: Math.round(zScore * 100) / 100,
          suspicious: enoughHistory
            ? zScore >= ANOMALY_Z_THRESHOLD
            : Math.abs(difference) > 0,
        };
      })
      .filter((shift) => shift.suspicious)
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

    const cashiers = [...stats.entries()].map(([userId, stat]) => ({
      userId,
      shifts: byUser.get(userId)?.length ?? 0,
      averageDifference: Math.round(stat.mean),
      totalDifference: Math.round(stat.total),
    }));

    return {
      period: `${days} روز اخیر`,
      shiftsReviewed: shifts.length,
      anomalies,
      cashiers,
    };
  }

  /**
   * پیش‌بینی فروش روزانه
   *
   * میانگین هر روز هفته در چند هفتهٔ اخیر — الگوی هفتگی خرده‌فروشی قوی‌تر از
   * روند کلی است، بنابراین همین مدل ساده برای برنامه‌ریزی شیفت و تأمین کافی
   * است و به داده یا کتابخانهٔ اضافه نیاز ندارد.
   */
  async salesForecast(companyId: string, daysAhead = DEFAULT_FORECAST_DAYS) {
    const since = new Date();
    since.setDate(since.getDate() - FORECAST_WINDOW_DAYS);

    const rows = await this.db.query<{ dow: string; total: string; days: string }>(
      `SELECT EXTRACT(DOW FROM s."createdAt")::text AS dow,
              COALESCE(sum(s.total), 0)::text AS total,
              count(DISTINCT date_trunc('day', s."createdAt"))::text AS days
       FROM "Sale" s
       WHERE s."companyId" = $1 AND NOT (s.status = ANY($2)) AND s."createdAt" >= $3
       GROUP BY 1`,
      [companyId, IGNORED_STATUSES, since],
    );

    const averageByDow = new Map<number, number>();
    for (const row of rows) {
      const days = Number(row.days);
      if (days > 0) averageByDow.set(Number(row.dow), Number(row.total) / days);
    }

    const overall = averageByDow.size
      ? [...averageByDow.values()].reduce((sum, value) => sum + value, 0) /
        averageByDow.size
      : 0;

    const forecast = Array.from({ length: daysAhead }, (_, offset) => {
      const date = new Date();
      date.setDate(date.getDate() + offset + 1);
      const expected = averageByDow.get(date.getDay()) ?? overall;

      return {
        date: date.toISOString().slice(0, 10),
        dayName: DAY_NAMES[date.getDay()],
        expectedSales: Math.round(expected),
        // مبنای پیش‌بینی چند روز داده بوده؛ برای قضاوت کاربر شفاف می‌ماند.
        basedOnDays: Number(
          rows.find((row) => Number(row.dow) === date.getDay())?.days ?? 0,
        ),
      };
    });

    return {
      window: `${FORECAST_WINDOW_DAYS} روز اخیر`,
      dailyAverage: Math.round(overall),
      forecast,
      expectedTotal: forecast.reduce((sum, day) => sum + day.expectedSales, 0),
    };
  }
}
