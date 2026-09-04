'use client';

/**
 * تحلیل‌ها.
 *
 * یازده مسیر API داشت و هیچ صفحه‌ای صدایشان نمی‌زد — بیشترین تعداد
 * در میانِ ماژول‌های **هسته**، یعنی چیزی که در هر سه محصول بار می‌شود
 * و هیچ‌کدام از مشتری‌ها نمی‌دیدندش.
 *
 * ⚠️ برخلافِ نامِ ماژول (`ai`)، این عددها از سرویسِ بیرونی نمی‌آیند.
 *
 *    آزموده شد: هر ده نقطه بدونِ `AI_API_KEY` پاسخِ ۲۰۰ می‌دهند —
 *    همه از SQL محاسبه می‌شوند.  فقط `/ai/ask` به مدل نیاز دارد و
 *    عمداً اینجا نیست: این صفحه باید بدونِ هیچ پیکربندیِ اضافه کار
 *    کند.
 *
 * ⚠️ همین توضیح یک بار **دروغ** بود و کسی متوجه نشد.
 *
 *    می‌گفت «هر هشت نقطه» پوشش داده شده، در حالی که کد فقط چهار تا
 *    را صدا می‌زد و شش تحلیل — تحلیل فروش، گزارش مدیریتی، پیشنهاد
 *    قیمت، سرعت مصرف انبار، ناهنجاری صندوق، و نزدیک به انقضا —
 *    ساخته و آزموده شده بودند و هیچ راهی به دستِ کاربر نداشتند.
 *
 *    توضیحی که با کد نخواند از نبودش بدتر است: خواننده باورش می‌کند
 *    و دنبالِ شکاف نمی‌گردد.  اگر بخشی اضافه یا حذف شد، این عدد هم
 *    باید عوض شود.
 *
 * ⚠️ چیزی که این صفحه باید بی‌درنگ جواب بدهد:
 *    **کجا پول خوابیده و کجا دارد تمام می‌شود.**
 *    بقیه مرجع است.
 *
 * ⚠️ هر بخش نقشِ متفاوتی می‌خواهد و ۴۰۳ گرفتن طبیعی است.
 *
 *    انباردار «ناهنجاریِ صندوق» را نمی‌بیند و حسابدار «سفارشِ خرید»
 *    را.  پس شکستِ یک بخش نباید بقیه را از کار بیندازد — هر کدام
 *    جداگانه بارگذاری و جداگانه خطا می‌دهد.
 */

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type DeadStock = {
  daysWithoutSale: number;
  count: number;
  tiedUpCapital: number;
  items: {
    productId: string;
    name: string;
    sku: string | null;
    unit: string | null;
    onHand: number;
    tiedUpCapital: number;
    daysSinceLastSale: number | null;
  }[];
};

type Reorder = {
  period: string;
  leadTimeDays: number;
  count: number;
  estimatedTotal: number;
  items: {
    productId: string;
    name: string;
    sku: string | null;
    unit: string | null;
    onHand: number;
    daysToStockout: number | null;
    suggestedQty: number;
    estimatedCost: number;
    urgent: boolean;
  }[];
};

type Forecast = {
  window: string;
  dailyAverage: number;
  expectedTotal: number;
  forecast: { date: string; dayName: string; expectedSales: number; basedOnDays: number }[];
};

type Briefing = {
  generatedAt: string;
  today: { salesTotal: number; salesCount: number; inventoryValue: number };
  highlights: { level: string; text: string }[];
};

const money = (v: number) =>
  Number(v ?? 0).toLocaleString('fa-IR', { maximumFractionDigits: 0 });

const LEVEL_COLOR: Record<string, string> = {
  critical: 'var(--danger)',
  warning: 'var(--warning)',
  info: 'var(--accent)',
};

/**
 * بارگذاریِ مستقلِ هر بخش.
 *
 * ⚠️ `Promise.all` اینجا غلط بود: یک ۴۰۳ همهٔ صفحه را خالی می‌کرد،
 *    در حالی که کاربر حق دیدنِ سه بخشِ دیگر را دارد.
 */
function useSection<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError('');
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading };
}

/* ─────────── شش تحلیلی که ساخته شده بودند و راهی نداشتند ───────────
   ⚠️ توضیحِ بالای همین فایل می‌گفت «هر هشت نقطه» پوشش داده شده‌اند،
      ولی کد فقط پنج تا را صدا می‌زد.  توضیحی که با کد نخواند، از
      نبودش بدتر است: خواننده باورش می‌کند و دنبالِ شکاف نمی‌گردد. */

type SalesAnalysis = {
  period: string;
  totalRevenue: number;
  invoiceCount: number;
  averageInvoice: number;
  growthPercent: number;
  bestDay: string | null;
  insights: string[];
};

type ManagerReport = {
  source: string;
  stats: {
    period: string;
    salesCount: number;
    totalSales: number;
    totalExpenses: number;
    netCashFlow: number;
    productsCount: number;
    customersCount: number;
  };
  report: string;
};

type PriceSuggestion = {
  productId: string;
  name: string;
  sku: string | null;
  purchasePrice: number;
  currentPrice: number;
  currentMarginPercent: number;
  suggestedPrice: number;
  recommendation: string;
};

type InventoryAnalysis = {
  period: string;
  needsRestock: unknown[];
  items: {
    productId: string;
    name: string;
    sku: string | null;
    quantity: number;
    minStock: number;
    dailySalesVelocity: number;
    daysToStockout: number | null;
    needsRestock: boolean;
  }[];
};

type CashierAnomalies = {
  period: string;
  shiftsReviewed: number;
  anomalies: {
    shiftId?: string;
    cashierName?: string;
    difference?: number;
    reason?: string;
  }[];
  cashiers: { name?: string; shifts?: number; totalDifference?: number }[];
};

type ExpiryItem = {
  productId?: string;
  name?: string;
  batchNo?: string | null;
  quantity?: number;
  expiryDate?: string | null;
  daysLeft?: number | null;
};

export default function InsightsPage() {
  const { t } = useI18n();

  const brief = useSection<Briefing>('/ai/briefing');
  const dead = useSection<DeadStock>('/ai/dead-stock');
  const reorder = useSection<Reorder>('/ai/reorder-suggestions');
  const forecast = useSection<Forecast>('/ai/sales-forecast');

  // ⚠️ هر کدام جداگانه بارگذاری می‌شوند — همان قاعدهٔ بالای فایل:
  //    انباردار «ناهنجاریِ صندوق» را نمی‌بیند و ۴۰۳ گرفتن طبیعی است،
  //    ولی نباید بقیهٔ صفحه را از کار بیندازد.
  const sales = useSection<SalesAnalysis>('/ai/sales-analysis');
  const manager = useSection<ManagerReport>('/ai/manager-report');
  const prices = useSection<PriceSuggestion[]>('/ai/price-suggestions');
  const stock = useSection<InventoryAnalysis>('/ai/inventory-analysis');
  const cashier = useSection<CashierAnomalies>('/ai/cashier-anomalies');
  const expiry = useSection<ExpiryItem[]>('/ai/expiry-analysis');

  return (
    <AppShell title={t('menuInsights')}>
      <div style={{ display: 'grid', gap: 16 }}>
        {/* ─── خلاصهٔ روز ─── */}
        <Section title={t('inTodaySummary')} state={brief}>
          {brief.data ? (
            <>
              <div style={STATS}>
                <Stat label={t('inTodaySales')} value={money(brief.data.today.salesTotal)} />
                <Stat label={t('inInvoiceCount')} value={money(brief.data.today.salesCount)} />
                <Stat label={t('inInventoryValue')} value={money(brief.data.today.inventoryValue)} />
              </div>
              {brief.data.highlights.length ? (
                <ul style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 6 }}>
                  {brief.data.highlights.map((h, i) => (
                    <li key={i} style={{ color: LEVEL_COLOR[h.level] ?? 'inherit' }}>
                      {h.text}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </Section>

        {/* ─── سرمایهٔ خوابیده ─── */}
        <Section
          title={t('inDeadStock')}
          state={dead}
          note={
            dead.data
              ? `${dead.data.count} قلم، بدون فروش در ${dead.data.daysWithoutSale} روز`
              : undefined
          }
        >
          {dead.data ? (
            dead.data.count === 0 ? (
              <p style={EMPTY}>{t('inNoDeadStock')}</p>
            ) : (
              <>
                {/* بزرگ‌ترین عددِ صفحه، چون بزرگ‌ترین تصمیم را می‌سازد. */}
                <p style={{ margin: 0 }}>
                  <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--warning)' }}>
                    {money(dead.data.tiedUpCapital)}
                  </span>{' '}
                  <span style={{ fontSize: 14, color: 'var(--muted)' }}>
                    {t('inTiedCapital')}
                  </span>
                </p>
                <Table
                  head={['کالا', 'کد', 'موجودی', 'سرمایهٔ خوابیده']}
                  rows={dead.data.items.map((it) => [
                    it.name,
                    it.sku ?? '—',
                    `${money(it.onHand)} ${it.unit ?? ''}`,
                    money(it.tiedUpCapital),
                  ])}
                />
              </>
            )
          ) : null}
        </Section>

        {/* ─── سفارشِ خرید ─── */}
        <Section
          title={t('inReorderSuggestion')}
          state={reorder}
          note={reorder.data ? `${reorder.data.period} — مهلت تأمین ${reorder.data.leadTimeDays} روز` : undefined}
        >
          {reorder.data ? (
            reorder.data.count === 0 ? (
              <p style={EMPTY}>{t('inNoReorder')}</p>
            ) : (
              <>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
                  {reorder.data.count} قلم، برآورد {money(reorder.data.estimatedTotal)} ریال
                </p>
                <Table
                  head={['کالا', 'موجودی', 'تا اتمام', 'پیشنهاد', 'برآورد']}
                  rows={reorder.data.items.map((it) => [
                    // ⚠️ «فوری» کنارِ نام می‌آید نه در ستونِ جدا: ستونِ
                    //    جدا در موبایل از کادر بیرون می‌افتد و همان
                    //    نشانه‌ای است که باید دیده شود.
                    it.urgent ? `⚠ ${it.name}` : it.name,
                    `${money(it.onHand)} ${it.unit ?? ''}`,
                    it.daysToStockout === null ? '—' : `${money(it.daysToStockout)} روز`,
                    money(it.suggestedQty),
                    money(it.estimatedCost),
                  ])}
                  danger={reorder.data.items.map((it) => it.urgent)}
                />
              </>
            )
          ) : null}
        </Section>

        {/* ─── پیش‌بینی ─── */}
        <Section
          title={t('inSalesForecast')}
          state={forecast}
          note={forecast.data ? forecast.data.window : undefined}
        >
          {forecast.data ? (
            <>
              <div style={STATS}>
                <Stat label={t('inDailyAverage')} value={money(forecast.data.dailyAverage)} />
                <Stat label={t('inNextWeekEstimate')} value={money(forecast.data.expectedTotal)} />
              </div>
              <Table
                head={['روز', 'تاریخ', 'برآورد فروش']}
                rows={forecast.data.forecast.map((f) => [
                  f.dayName,
                  new Date(f.date).toLocaleDateString('fa-IR'),
                  money(f.expectedSales),
                ])}
              />
            </>
          ) : null}
        </Section>

        {/* ─── تحلیل فروش ─── */}
        <Section title={t('inSalesAnalysis')} state={sales} note={sales.data?.period}>
          {sales.data ? (
            <>
              <div style={STATS}>
                <Stat label={t('inRevenue')} value={money(sales.data.totalRevenue)} />
                <Stat label={t('inInvoiceCount')} value={money(sales.data.invoiceCount)} />
                <Stat label={t('inAvgInvoice')} value={money(sales.data.averageInvoice)} />
                {/*
                  ⚠️ رشد رنگ دارد چون علامتش تصمیم می‌سازد.
                     عددِ بی‌رنگ در فهرستی از عددها گم می‌شود.
                */}
                <Stat
                  label={t('inGrowth')}
                  value={`${money(sales.data.growthPercent)}٪`}
                />
              </div>
              {sales.data.bestDay ? (
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14 }}>
                  {t('inBestDay')}: <b style={{ color: 'var(--text)' }}>{sales.data.bestDay}</b>
                </p>
              ) : null}
              {sales.data.insights?.length ? (
                <ul style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 6 }}>
                  {sales.data.insights.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </Section>

        {/* ─── گزارش مدیر ─── */}
        <Section
          title={t('inManagerReport')}
          state={manager}
          note={manager.data?.stats.period}
        >
          {manager.data ? (
            <>
              <div style={STATS}>
                <Stat label={t('inTotalSales')} value={money(manager.data.stats.totalSales)} />
                <Stat label={t('inExpenses')} value={money(manager.data.stats.totalExpenses)} />
                <Stat label={t('inNetCashFlow')} value={money(manager.data.stats.netCashFlow)} />
                <Stat label={t('inCustomers')} value={money(manager.data.stats.customersCount)} />
              </div>
              {manager.data.report ? (
                <p style={{ margin: 0, lineHeight: 1.9 }}>{manager.data.report}</p>
              ) : null}
            </>
          ) : null}
        </Section>

        {/* ─── پیشنهاد قیمت ─── */}
        <Section
          title={t('inPriceSuggestions')}
          state={prices}
          // ⚠️ عددِ خام گمراه‌کننده بود: «۱۱۴» کلِ کالاها بود، در حالی
          //    که جدول فقط مواردِ نیازمندِ تغییر را نشان می‌دهد.
          //    برچسبِ بی‌واحد هم در مرورگر «پیشنهاد قیمت 114» می‌شد.
          note={
            prices.data
              ? `${prices.data.filter((r) => r.suggestedPrice !== r.currentPrice).length} از ${prices.data.length} کالا`
              : undefined
          }
        >
          {prices.data ? (
            prices.data.length === 0 ? (
              <p style={EMPTY}>{t('inNoPriceSuggestion')}</p>
            ) : (
              // ⚠️ فقط مواردی که پیشنهادشان با قیمتِ فعلی فرق دارد.
              //
              //    فهرستِ صدوچهارده‌تایی که بیشترش «مناسب است» می‌گوید،
              //    خوانده نمی‌شود.  چیزی که خوانده نشود، تصمیمی
              //    نمی‌سازد.
              <Table
                head={[t('product'), t('purchasePrice'), t('currentPrice'), t('inMargin'), t('inSuggested')]}
                rows={prices.data
                  .filter((row) => row.suggestedPrice !== row.currentPrice)
                  .slice(0, 30)
                  .map((row) => [
                    row.name,
                    money(row.purchasePrice),
                    money(row.currentPrice),
                    `${money(row.currentMarginPercent)}٪`,
                    money(row.suggestedPrice),
                  ])}
              />
            )
          ) : null}
        </Section>

        {/* ─── سرعت مصرف انبار ─── */}
        <Section title={t('inStockVelocity')} state={stock} note={stock.data?.period}>
          {stock.data ? (
            stock.data.items.length === 0 ? (
              <p style={EMPTY}>{t('inNoStockData')}</p>
            ) : (
              <Table
                head={[t('product'), t('quantity'), t('inDailyVelocity'), t('inDaysToStockout')]}
                // ⚠️ کم‌ترین «روز تا اتمام» اول: همان چیزی که فردا
                //    مشکل می‌سازد، نه چیزی که الفبایی اول است.
                rows={[...stock.data.items]
                  .sort((a, b) => (a.daysToStockout ?? 1e9) - (b.daysToStockout ?? 1e9))
                  .slice(0, 30)
                  .map((row) => [
                    row.name,
                    money(row.quantity),
                    money(row.dailySalesVelocity),
                    row.daysToStockout === null ? '—' : money(Math.round(row.daysToStockout)),
                  ])}
              />
            )
          ) : null}
        </Section>

        {/* ─── ناهنجاری صندوق ─── */}
        <Section
          title={t('inCashierAnomalies')}
          state={cashier}
          note={
            cashier.data
              ? `${cashier.data.period} — ${money(cashier.data.shiftsReviewed)} شیفت بررسی شد`
              : undefined
          }
        >
          {cashier.data ? (
            cashier.data.anomalies.length === 0 ? (
              // ⚠️ «چیزی پیدا نشد» با «بررسی نشد» فرق دارد و باید
              //    دیده شود: تعدادِ شیفت‌های بررسی‌شده در `note` است.
              <p style={EMPTY}>{t('inNoAnomaly')}</p>
            ) : (
              <Table
                head={[t('cashier'), t('inDifference'), t('reason')]}
                rows={cashier.data.anomalies.map((row) => [
                  row.cashierName ?? '—',
                  money(row.difference ?? 0),
                  row.reason ?? '—',
                ])}
                // هر ناهنجاری به‌خودیِ‌خود هشدار است.
                danger={cashier.data.anomalies.map(() => true)}
              />
            )
          ) : null}
        </Section>

        {/* ─── نزدیک به انقضا ─── */}
        <Section title={t('inExpiring')} state={expiry}>
          {expiry.data ? (
            expiry.data.length === 0 ? (
              <p style={EMPTY}>{t('inNoExpiring')}</p>
            ) : (
              <Table
                head={[t('product'), t('batchNo'), t('quantity'), t('inDaysLeft')]}
                rows={expiry.data.slice(0, 30).map((row) => [
                  row.name ?? '—',
                  row.batchNo ?? '—',
                  money(row.quantity ?? 0),
                  row.daysLeft === null || row.daysLeft === undefined
                    ? '—'
                    : money(row.daysLeft),
                ])}
                // ⚠️ زیر هفت روز قرمز — نه هر قلمی که در فهرست است.
                //    اگر همه قرمز باشند، قرمز معنایش را از دست می‌دهد.
                danger={expiry.data
                  .slice(0, 30)
                  .map((row) => (row.daysLeft ?? 999) <= 7)}
              />
            )
          ) : null}
        </Section>
      </div>
    </AppShell>
  );
}

function Section({
  title,
  note,
  state,
  children,
}: {
  title: string;
  note?: string;
  state: { error: string; loading: boolean };
  children: React.ReactNode;
}) {
  // ⚠️ `Section` کامپوننتِ جداست، پس `t` والد را نمی‌بیند و هوکِ
  //    خودش را لازم دارد.  اسکریپتِ انتقالِ i18n این را نمی‌دانست و
  //    `tsc` گرفتش — یعنی خطا در همان لحظه دیده شد، نه در مرورگر.
  const { t } = useI18n();

  return (
    <section style={CARD}>
      <h2 style={H2}>
        {title}{' '}
        {note ? (
          <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 14 }}>{note}</span>
        ) : null}
      </h2>
      {state.loading ? (
        <p style={EMPTY}>{t('ttComputing')}</p>
      ) : state.error ? (
        // ⚠️ خطای یک بخش، بقیهٔ صفحه را نمی‌بندد.  ۴۰۳ اینجا طبیعی
        //    است و پیامش هم همان را می‌گوید.
        <p style={{ ...EMPTY, color: 'var(--muted)' }}>{state.error}</p>
      ) : (
        children
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 2 }}>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function Table({
  head,
  rows,
  danger,
}: {
  head: string[];
  rows: (string | number)[][];
  danger?: boolean[];
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} style={{ ...TH, textAlign: i === 0 ? 'start' : 'end' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td
                  key={c}
                  style={{
                    ...TD,
                    textAlign: c === 0 ? 'start' : 'end',
                    color: c === 0 && danger?.[r] ? 'var(--danger)' : 'inherit',
                    fontWeight: c === row.length - 1 ? 700 : 400,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const CARD: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 16,
  display: 'grid',
  gap: 12,
};

const H2: React.CSSProperties = { margin: 0, fontSize: 17 };

const STATS: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
};

const TH: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--muted)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '10px',
  borderBottom: '1px solid var(--border)',
};

const EMPTY: React.CSSProperties = {
  padding: 24,
  textAlign: 'center',
  color: 'var(--muted)',
  margin: 0,
};
