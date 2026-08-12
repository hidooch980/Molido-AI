import { Inject, Injectable, Optional } from '@nestjs/common';
import { AiService } from './ai.service';
import { LlmService } from './llm.service';
import { TOOLS, extractNumber, matchTool } from './tools';
import { ReportsService } from '../reports/reports.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RevenueService } from '../revenue/revenue.service';
import { RationService } from '../ration/ration.service';

export type Answer = {
  /** ابزاری که برای پاسخ اجرا شد؛ null یعنی پرسش فهمیده نشد. */
  tool: string | null;
  /** پاسخ فارسی، قابل نمایش مستقیم. */
  answer: string;
  /** دادهٔ خام برای رسم نمودار یا جدول در رابط کاربری. */
  data: unknown;
  /** 'llm' یعنی مدل زبانی پاسخ را نوشته، 'internal' یعنی تحلیل محلی. */
  source: 'llm' | 'internal';
};

const fa = (value: unknown) => Number(value ?? 0).toLocaleString('fa-IR');

/** موضوعی که در بریفینگ روزانه اهمیت دارد. */
type Highlight = { level: 'critical' | 'warning' | 'info'; text: string };

/**
 * دستیار فروشگاه
 *
 * پرسش فارسی را به یکی از تحلیل‌های موجود می‌رساند، اجرا می‌کند و پاسخ
 * می‌نویسد.  دو مسیر دارد:
 *
 *   ۱. با مدل زبانی — مدل ابزار را انتخاب و پاسخ را روان می‌نویسد.
 *   ۲. بدون مدل — تطبیق واژگانی ابزار را انتخاب و پاسخ از قالب ساخته می‌شود.
 *
 * مسیر دوم عمداً کامل نگه داشته شده: بسیاری از فروشگاه‌ها دسترسی خارجی ندارند
 * و سامانه باید همان‌جا هم پاسخگو باشد.
 *
 * `companyId` هرگز به مدل داده نمی‌شود؛ از درخواست احراز هویت‌شده می‌آید.
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly ai: AiService,
    private readonly reports: ReportsService,
    private readonly notifications: NotificationsService,
    private readonly revenue: RevenueService,
    // کالابرگ فقط در محصول فروشگاه هست؛ دستیار در بقیهٔ محصول‌ها بدون آن کار می‌کند.
    @Optional() @Inject(RationService)
    private readonly ration: RationService | null,
    private readonly llm: LlmService,
  ) {}

  // ---------- اجرای ابزار ----------

  private async run(
    companyId: string,
    tool: string,
    args: Record<string, number | string> = {},
  ): Promise<unknown> {
    const number = (key: string, fallback: number): number => {
      const value = Number(args[key]);
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };

    switch (tool) {
      case 'dashboard':
        return this.reports.dashboard(companyId);
      case 'salesAnalysis':
        return this.ai.salesAnalysis(companyId);
      case 'salesForecast':
        return this.ai.salesForecast(companyId, number('daysAhead', 7));
      case 'reorderSuggestions':
        return this.ai.reorderSuggestions(companyId, {
          leadTimeDays: number('leadTimeDays', 7),
          coverDays: number('coverDays', 14),
        });
      case 'inventoryAnalysis':
        return this.ai.inventoryAnalysis(companyId);
      case 'deadStock':
        return this.ai.deadStock(companyId, number('days', 60));
      case 'expiryAnalysis':
        return this.ai.expiryAnalysis(companyId, number('daysAhead', 30));
      case 'topProducts':
        return this.reports.topProducts(companyId, number('limit', 10));
      case 'profitReport':
        return this.reports.profitReport(companyId);
      case 'priceSuggestions':
        return this.ai.priceSuggestions(companyId, number('targetMargin', 25));
      case 'cashierAnomalies':
        return this.ai.cashierAnomalies(companyId, number('days', 30));
      case 'lowStockAlerts':
        return this.notifications.getLowStockAlerts(companyId);
      case 'unpaidSales':
        return this.notifications.getUnpaidSales(companyId);
      case 'revenueStats':
        return this.revenue.stats(companyId);
      case 'rationSettlement':
        return this.ration?.settlementReport(companyId) ?? null;
      default:
        return null;
    }
  }

  // ---------- پرسش و پاسخ ----------

  async ask(companyId: string, question: string): Promise<Answer> {
    const text = (question ?? '').trim();

    if (!text) {
      return {
        tool: null,
        answer: 'پرسشی وارد نشده است.',
        data: null,
        source: 'internal',
      };
    }

    const chosen = await this.choose(text);

    if (!chosen) {
      return {
        tool: null,
        answer: this.help(),
        data: null,
        source: 'internal',
      };
    }

    const data = await this.run(companyId, chosen.tool, chosen.args);

    // پاسخ محلی همیشه ساخته می‌شود: هم پشتیبان مدل است و هم اگر مدل کند بود
    // کاربر بی‌پاسخ نمی‌ماند.
    const local = this.describe(chosen.tool, data);

    const written = await this.llm.complete(
      [
        {
          role: 'system',
          content:
            'تو دستیار یک فروشگاه هستی. بر اساس دادهٔ داده‌شده به پرسش کاربر ' +
            'کوتاه، دقیق و به فارسی پاسخ بده. عدد را از خودت نساز و فقط از داده ' +
            'استفاده کن. اگر داده خالی است، همین را صادقانه بگو.',
        },
        {
          role: 'user',
          content: `پرسش: ${text}\n\nداده (${chosen.tool}):\n${JSON.stringify(data)}`,
        },
      ],
      400,
    );

    return {
      tool: chosen.tool,
      answer: written ?? local,
      data,
      source: written ? 'llm' : 'internal',
    };
  }

  /** ابزار را با مدل انتخاب می‌کند و در نبود آن به تطبیق واژگانی برمی‌گردد. */
  private async choose(
    question: string,
  ): Promise<{ tool: string; args: Record<string, number | string> } | null> {
    if (this.llm.enabled) {
      const catalogue = TOOLS.map((tool) => {
        const params = tool.params.map((param) => param.name).join(', ');
        return `- ${tool.name}: ${tool.description}${params ? ` (پارامترها: ${params})` : ''}`;
      }).join('\n');

      const picked = await this.llm.chooseTool(question, catalogue);
      // نام ابزار راستی‌آزمایی می‌شود؛ مدل نباید بتواند چیزی خارج از فهرست
      // را اجرا کند.
      if (picked && TOOLS.some((tool) => tool.name === picked.tool)) return picked;
    }

    const matched = matchTool(question);
    if (!matched) return null;

    const args: Record<string, number | string> = {};
    const number = extractNumber(question);
    if (number !== null && matched.tool.params.length) {
      args[matched.tool.params[0].name] = number;
    }

    return { tool: matched.tool.name, args };
  }

  private help(): string {
    return [
      'پرسش را متوجه نشدم. نمونه‌هایی که می‌توانم پاسخ بدهم:',
      '',
      '• امروز اوضاع فروشگاه چطور است؟',
      '• این هفته چه کالایی باید سفارش بدهم؟',
      '• کدام کالاها راکد مانده‌اند؟',
      '• هفتهٔ آینده چقدر فروش خواهیم داشت؟',
      '• کدام صندوق‌دار مغایرت مشکوک دارد؟',
      '• سود این دوره چقدر بوده است؟',
      '• چه کالایی نزدیک انقضاست؟',
    ].join('\n');
  }

  // ---------- توصیف محلی ----------

  /** از دادهٔ خام یک پاسخ فارسی می‌سازد، بدون نیاز به مدل زبانی. */
  private describe(tool: string, data: unknown): string {
    if (!data) return 'داده‌ای برای این پرسش یافت نشد.';

    const value = data as Record<string, never>;

    switch (tool) {
      case 'dashboard':
        return [
          `فروش امروز: ${fa(value.todaySalesTotal)} در ${fa(value.todaySalesCount)} فاکتور`,
          `فروش ماه جاری: ${fa(value.monthSalesTotal)}`,
          `هزینهٔ ماه: ${fa(value.monthExpensesTotal)}`,
          `ارزش موجودی انبار: ${fa(value.inventoryValue)}`,
          Number(value.lowStockCount) > 0
            ? `⚠️ ${fa(value.lowStockCount)} کالا به حداقل موجودی رسیده است.`
            : 'موجودی همهٔ کالاها بالاتر از حداقل است.',
        ].join('\n');

      case 'salesAnalysis': {
        const growth = Number(value.growthPercent);
        return [
          `درآمد ۶۰ روز اخیر: ${fa(value.totalRevenue)} در ${fa(value.invoiceCount)} فاکتور`,
          `میانگین هر فاکتور: ${fa(value.averageInvoice)}`,
          growth > 0 ? `رشد ${fa(growth)}٪` : growth < 0 ? `افت ${fa(Math.abs(growth))}٪` : 'بدون تغییر محسوس',
          value.bestDay ? `پرفروش‌ترین روز هفته: ${String(value.bestDay)}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }

      case 'salesForecast': {
        const days = (value.forecast ?? []) as Array<{ dayName: string; expectedSales: number }>;
        return [
          `پیش‌بینی مجموع: ${fa(value.expectedTotal)}`,
          ...days.map((day) => `  ${day.dayName}: ${fa(day.expectedSales)}`),
        ].join('\n');
      }

      case 'reorderSuggestions': {
        const items = (value.items ?? []) as Array<{
          name: string;
          suggestedQty: number;
          unit: string;
          urgent: boolean;
        }>;
        if (!items.length) return 'در حال حاضر نیازی به سفارش خرید نیست.';
        return [
          `${fa(value.count)} قلم پیشنهاد سفارش، برآورد هزینه ${fa(value.estimatedTotal)}:`,
          ...items
            .slice(0, 10)
            .map(
              (item) =>
                `  ${item.urgent ? '🔴' : '•'} ${item.name} — ${fa(item.suggestedQty)} ${item.unit}`,
            ),
        ].join('\n');
      }

      case 'deadStock': {
        const items = (value.items ?? []) as Array<{ name: string; tiedUpCapital: number }>;
        if (!items.length) return 'کالای راکدی وجود ندارد.';
        return [
          `${fa(value.count)} کالای راکد، سرمایهٔ خوابیده ${fa(value.tiedUpCapital)}:`,
          ...items.slice(0, 10).map((item) => `  • ${item.name} — ${fa(item.tiedUpCapital)}`),
        ].join('\n');
      }

      case 'cashierAnomalies': {
        const anomalies = (value.anomalies ?? []) as Array<{
          cashierName: string;
          difference: number;
        }>;
        if (!anomalies.length) {
          return `در ${fa(value.shiftsReviewed)} شیفت بررسی‌شده، مغایرت غیرعادی دیده نشد.`;
        }
        return [
          `${fa(anomalies.length)} مغایرت قابل بررسی:`,
          ...anomalies
            .slice(0, 10)
            .map(
              (row) =>
                `  • ${row.cashierName} — ${row.difference < 0 ? 'کسری' : 'اضافه'} ${fa(Math.abs(row.difference))}`,
            ),
        ].join('\n');
      }

      case 'profitReport':
        return [
          `درآمد: ${fa(value.revenue)}`,
          `بهای تمام‌شده: ${fa(value.cost)}`,
          `سود: ${fa(value.profit)} (حاشیه ${fa(value.margin)}٪)`,
        ].join('\n');

      case 'rationSettlement':
        return [
          `مصرف کالابرگ: ${fa(value.spent)}`,
          `برگشتی: ${fa(value.reversed)}`,
          `خالص قابل تسویه: ${fa(value.net)}`,
          `اعتبار باقی‌مانده نزد خانوارها: ${fa(value.outstandingBalance)}`,
        ].join('\n');

      case 'revenueStats':
        return `درآمد وصول‌شده: ${fa(value.totalAmount)} در ${fa(value.total)} رسید`;

      default: {
        // ابزارهایی که خروجی‌شان فهرست است
        if (Array.isArray(data)) {
          if (!data.length) return 'موردی یافت نشد.';
          return `${fa(data.length)} مورد یافت شد.`;
        }
        return JSON.stringify(data);
      }
    }
  }

  // ---------- بریفینگ روزانه ----------

  /**
   * آنچه مدیر فروشگاه باید امروز بداند — بدون آنکه بپرسد.
   *
   * چند تحلیل هم‌زمان اجرا و فقط موارد قابل اقدام نگه داشته می‌شوند؛ گزارشی
   * که همه‌چیز را بگوید، هیچ‌چیز نمی‌گوید.
   */
  async briefing(companyId: string) {
    const [dashboard, reorder, expiry, anomalies, unpaid, forecast] = await Promise.all([
      this.reports.dashboard(companyId),
      this.ai.reorderSuggestions(companyId),
      this.ai.expiryAnalysis(companyId),
      this.ai.cashierAnomalies(companyId),
      this.notifications.getUnpaidSales(companyId),
      this.ai.salesForecast(companyId, 1),
    ]);

    const highlights: Highlight[] = [];

    const urgent = reorder.items.filter((item) => item.urgent);
    if (urgent.length) {
      highlights.push({
        level: 'critical',
        text: `${fa(urgent.length)} کالا زیر حداقل موجودی است — سفارش فوری لازم است.`,
      });
    }

    const expiring = (expiry as Array<{ daysLeft: number }>).filter((row) => row.daysLeft <= 7);
    if (expiring.length) {
      highlights.push({
        level: 'critical',
        text: `${fa(expiring.length)} کالا تا یک هفتهٔ آینده منقضی می‌شود.`,
      });
    }

    if (anomalies.anomalies.length) {
      highlights.push({
        level: 'warning',
        text: `${fa(anomalies.anomalies.length)} مغایرت صندوق نیازمند بررسی است.`,
      });
    }

    if (reorder.count > 0 && !urgent.length) {
      highlights.push({
        level: 'warning',
        text: `${fa(reorder.count)} قلم به نقطهٔ سفارش نزدیک شده — برآورد ${fa(reorder.estimatedTotal)}.`,
      });
    }

    if (unpaid.length) {
      highlights.push({
        level: 'warning',
        text: `${fa(unpaid.length)} فاکتور پرداخت‌نشده باقی مانده است.`,
      });
    }

    const tomorrow = forecast.forecast[0];
    if (tomorrow) {
      highlights.push({
        level: 'info',
        text: `فروش پیش‌بینی‌شدهٔ ${tomorrow.dayName}: ${fa(tomorrow.expectedSales)}`,
      });
    }

    if (!highlights.some((item) => item.level !== 'info')) {
      highlights.unshift({ level: 'info', text: 'هیچ مورد فوری‌ای وجود ندارد.' });
    }

    return {
      generatedAt: new Date().toISOString(),
      today: {
        salesTotal: Number(dashboard.todaySalesTotal),
        salesCount: Number(dashboard.todaySalesCount),
        inventoryValue: Number(dashboard.inventoryValue),
      },
      highlights,
      actions: {
        reorder: urgent.slice(0, 5),
        expiring: expiring.slice(0, 5),
        cashierAnomalies: anomalies.anomalies.slice(0, 5),
      },
    };
  }
}
