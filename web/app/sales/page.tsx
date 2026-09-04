'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import AppShell from '../../components/AppShell';
import { Grid, type Column } from '../../components/Grid';
import { Icon } from '../../components/icons';
import { StatCard, TOUCH, statusColor } from '../../components/ui';
import { API_URL, api, getToken } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';
import { amountOnly, loadCurrency, money } from '../../lib/money';

/**
 * نام ستون‌ها همان است که بک‌اند می‌دهد.
 *
 * تا امروز این صفحه `customer.firstName` و `_count.items` می‌خواند که هیچ‌کدام
 * در پاسخ نیستند — پس هر فاکتوری «نقدی» و «۰ قلم» نشان داده می‌شد، مهم
 * نبود واقعیت چه بود.
 */
type Sale = {
  id: string;
  invoiceNo: string;
  status: string;
  subtotal: string | number;
  discount: string | number;
  tax: string | number;
  total: string | number;
  createdAt: string;
  customerFirstName: string | null;
  customerLastName: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  itemsCount: number;
};

type Page = { data: Sale[]; total: number; page: number; totalPages: number };

const STATUS_KEY: Record<string, string> = {
  PAID: 'paid',
  PARTIAL: 'partial',
  PENDING: 'pending',
  CANCELLED: 'cancelled',
  RETURNED: 'returned',
};

const LIMIT = 200;

/** بازه‌های آماده — چیزی که واقعاً پرسیده می‌شود، نه تقویم خالی. */
const RANGES = ['today', 'week', 'month', 'all'] as const;
type Range = (typeof RANGES)[number];

function rangeStart(range: Range): string | null {
  const now = new Date();

  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }

  const days = range === 'week' ? 7 : range === 'month' ? 30 : 0;
  if (!days) return null;

  const start = new Date(now);
  start.setDate(now.getDate() - days);
  return start.toISOString();
}

export default function SalesPage() {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [page, setPage] = useState<Page | null>(null);
  const [range, setRange] = useState<Range>('today');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [pageNo, setPageNo] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fa = useCallback((value: unknown) => amountOnly(value), []);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const query = new URLSearchParams({
        limit: String(LIMIT),
        page: String(pageNo),
      });

      const from = rangeStart(range);
      if (from) query.set('from', from);
      if (status) query.set('status', status);

      const result = await api<Page | Sale[]>(`/sales?${query}`);

      // پاسخ بدون صفحه‌بندی آرایه است؛ هر دو شکل پذیرفته می‌شود.
      setPage(
        Array.isArray(result)
          ? { data: result, total: result.length, page: 1, totalPages: 1 }
          : result,
      );
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('invoicesError'));
    } finally {
      setLoading(false);
    }
  }, [pageNo, range, status, t]);

  useEffect(() => {
    void loadCurrency();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // تغییر فیلتر باید به صفحهٔ اول برگردد، وگرنه کاربر صفحهٔ ۴ از نتیجه‌ای
  // می‌بیند که فقط دو صفحه دارد و فهرست خالی درمی‌آید.
  useEffect(() => {
    setPageNo(1);
  }, [range, status]);

  const rows = useMemo(() => {
    const list = page?.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;

    return list.filter(
      (sale) =>
        sale.invoiceNo.toLowerCase().includes(needle) ||
        `${sale.customerFirstName ?? ''} ${sale.customerLastName ?? ''}`
          .toLowerCase()
          .includes(needle),
    );
  }, [page, search]);

  /** خلاصهٔ همان چیزی که فیلتر شده. */
  const summary = useMemo(() => {
    const live = rows.filter((sale) => sale.status !== 'CANCELLED');

    return {
      count: page?.total ?? rows.length,
      sum: live.reduce((total, sale) => total + Number(sale.total), 0),
      discount: live.reduce((total, sale) => total + Number(sale.discount ?? 0), 0),
      unpaid: live
        .filter((sale) => sale.status === 'PENDING' || sale.status === 'PARTIAL')
        .reduce((total, sale) => total + Number(sale.total), 0),
    };
  }, [rows, page]);

  /** فاکتور چاپی با توکن گرفته و در پنجرهٔ تازه باز می‌شود. */
  const openInvoice = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`${API_URL}/sales/${id}/print`, {
          headers: { Authorization: `Bearer ${getToken() ?? ''}` },
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const html = await response.text();
        const win = window.open('', '_blank');

        if (win) {
          win.document.write(html);
          win.document.close();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('invoiceError'));
      }
    },
    [t],
  );

  const columns = useMemo<Array<Column<Sale>>>(
    () => [
      {
        key: 'invoiceNo',
        label: t('colNumber'),
        value: (sale) => sale.invoiceNo,
        render: (sale) => <strong>{sale.invoiceNo}</strong>,
      },
      {
        key: 'date',
        label: t('date'),
        value: (sale) => sale.createdAt,
        render: (sale) =>
          new Date(sale.createdAt).toLocaleString(locale, {
            dateStyle: 'short',
            timeStyle: 'short',
          }),
      },
      {
        key: 'customer',
        label: t('customer'),
        value: (sale) =>
          `${sale.customerFirstName ?? ''} ${sale.customerLastName ?? ''}`.trim() ||
          t('cash'),
      },
      {
        key: 'cashier',
        label: t('cashierCol'),
        optional: true,
        value: (sale) => `${sale.userFirstName ?? ''} ${sale.userLastName ?? ''}`.trim(),
      },
      {
        key: 'items',
        label: t('colItems'),
        numeric: true,
        total: true,
        value: (sale) => Number(sale.itemsCount ?? 0),
        render: (sale) => fa(sale.itemsCount),
      },
      {
        key: 'subtotal',
        label: t('colAmount'),
        numeric: true,
        total: true,
        optional: true,
        value: (sale) => Number(sale.subtotal),
        render: (sale) => fa(sale.subtotal),
      },
      {
        key: 'discount',
        label: t('discount'),
        numeric: true,
        total: true,
        optional: true,
        value: (sale) => Number(sale.discount ?? 0),
        render: (sale) => fa(sale.discount),
      },
      {
        key: 'total',
        label: t('total'),
        numeric: true,
        total: true,
        value: (sale) => Number(sale.total),
        render: (sale) => <strong>{fa(sale.total)}</strong>,
      },
      {
        key: 'status',
        label: t('status'),
        value: (sale) =>
          STATUS_KEY[sale.status] ? t(STATUS_KEY[sale.status]) : sale.status,
        render: (sale) => (
          <span className="badge" style={{ color: statusColor(sale.status) }}>
            {STATUS_KEY[sale.status] ? t(STATUS_KEY[sale.status]) : sale.status}
          </span>
        ),
      },
    ],
    [t, locale, fa],
  );

  const totalPages = page?.totalPages ?? 1;

  return (
    <AppShell
      title={t('salesTitle')}
      subtitle={t('salesSubtitle')}
      actions={
        <>
          {/* راه ورود به فرم فاکتور.  بدون این، صفحهٔ تازه‌ساخته فقط با
              تایپ آدرس پیدا می‌شد — یعنی عملاً وجود نداشت. */}
          <button type="button" className="btn-sm" onClick={() => router.push('/sales/new')}>
            {t('salesNewInvoice')}
          </button>
          <button type="button" className="btn-sm" onClick={() => void load()}>
            {t('refresh')}
          </button>
        </>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {/* خلاصه پیش از جزئیات: مدیر اول می‌خواهد بداند چقدر فروخته، بعد
          می‌رود سراغ اینکه به چه کسی. */}
      <div className="stats-grid">
        <StatCard icon="receipt" label={t('invoicesCountLabel')} value={fa(summary.count)} />
        <StatCard icon="chart" label={t('salesSum')} value={money(summary.sum)} />
        <StatCard icon="tag" label={t('discountSum')} value={fa(summary.discount)} />
        <StatCard
          icon="clock"
          label={t('unpaidSum')}
          value={fa(summary.unpaid)}
          accent={summary.unpaid > 0 ? 'var(--warning)' : undefined}
        />
      </div>

      <Grid
        rows={rows}
        columns={columns}
        rowKey={(sale) => sale.id}
        loading={loading}
        empty={t('noInvoices')}
        exportName="sales"
        t={t}
        rowActions={(sale) => (
          <button
            type="button"
            className="btn-sm ghost"
            onClick={() => void openInvoice(sale.id)}
          >
            <Icon name="print" size={15} />
          </button>
        )}
        toolbar={
          <>
            <div className="seg" role="group" aria-label={t('dateRange')}>
              {RANGES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={range === item ? 'active' : ''}
                  onClick={() => setRange(item)}
                >
                  {t(`range_${item}`)}
                </button>
              ))}
            </div>

            <select
              style={{ ...TOUCH, minHeight: 38 }}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label={t('status')}
            >
              <option value="">{t('allStatuses')}</option>
              {Object.entries(STATUS_KEY).map(([code, key]) => (
                <option key={code} value={code}>
                  {t(key)}
                </option>
              ))}
            </select>

            <input
              style={{ ...TOUCH, minHeight: 38, minWidth: 210 }}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchInvoice')}
              type="search"
            />
          </>
        }
      />

      {totalPages > 1 ? (
        <div className="pager">
          <button
            type="button"
            className="btn-sm ghost"
            disabled={pageNo <= 1}
            onClick={() => setPageNo((n) => n - 1)}
          >
            {t('prev')}
          </button>
          <span className="muted">
            {fa(pageNo)} / {fa(totalPages)}
          </span>
          <button
            type="button"
            className="btn-sm ghost"
            disabled={pageNo >= totalPages}
            onClick={() => setPageNo((n) => n + 1)}
          >
            {t('next')}
          </button>
        </div>
      ) : null}
    </AppShell>
  );
}
