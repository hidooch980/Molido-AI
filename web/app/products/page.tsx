'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Grid, type Column } from '../../components/Grid';
import { Icon } from '../../components/icons';
import { StatCard, TOUCH, statusColor } from '../../components/ui';
import { API_URL, api, getToken } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';
import { amountOnly, loadCurrency } from '../../lib/money';

/**
 * ستون‌ها همان است که بک‌اند می‌دهد.
 *
 * پیش از این صفحه `category.name` می‌خواند در حالی که پاسخ `categoryName`
 * دارد — پس ستون دسته‌بندی همیشه خالی بود و کسی متوجه نمی‌شد چرا.
 */
type Product = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  salePrice: string | number;
  purchasePrice: string | number;
  unit: string;
  status: string;
  minStock: string | number | null;
  isWeighed: boolean;
  isOnline: boolean;
  categoryName: string | null;
  imageUrl: string | null;
  inventories?: Array<{ quantity: string | number }>;
};

type Page = { data: Product[]; total: number; page: number; totalPages: number };

/** فروشگاه بزرگ هزاران کالا دارد؛ صد تا کافی نیست. */
const LIMIT = 500;

export default function ProductsPage() {
  const { t } = useI18n();

  const [page, setPage] = useState<Page | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [pageNo, setPageNo] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fa = useCallback((value: unknown) => amountOnly(value), []);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        page: String(pageNo),
      });
      if (query) params.set('search', query);
      if (status) params.set('status', status);

      const result = await api<Page | Product[]>(`/products?${params}`);

      setPage(
        Array.isArray(result)
          ? { data: result, total: result.length, page: 1, totalPages: 1 }
          : result,
      );
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('productsError'));
    } finally {
      setLoading(false);
    }
  }, [pageNo, query, status, t]);

  useEffect(() => {
    void loadCurrency();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPageNo(1);
  }, [query, status]);

  // جستجو با تأخیر: تایپ «برنج ایرانی» یازده درخواست می‌فرستد که ده‌تایش
  // پیش از رسیدن بی‌فایده شده.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const rows = page?.data ?? [];

  const stock = useCallback(
    (product: Product) =>
      (product.inventories ?? []).reduce(
        (sum, row) => sum + Number(row.quantity ?? 0),
        0,
      ),
    [],
  );

  const summary = useMemo(() => {
    const low = rows.filter(
      (product) =>
        product.minStock !== null && stock(product) <= Number(product.minStock),
    ).length;

    return {
      count: page?.total ?? rows.length,
      low,
      // ارزش انبار به قیمت خرید — همان عددی که در ترازنامه می‌نشیند، نه
      // قیمت فروش که هنوز محقق نشده.
      value: rows.reduce(
        (sum, product) => sum + stock(product) * Number(product.purchasePrice ?? 0),
        0,
      ),
      online: rows.filter((product) => product.isOnline).length,
    };
  }, [rows, page, stock]);

  /**
   * ذخیرهٔ قیمت پس از ویرایش درجا.
   *
   * فهرست از سرور دوباره خوانده می‌شود نه اینکه در حافظه دست‌کاری شود:
   * قیمت ممکن است قواعد دیگری را هم فعال کند (سطح قیمت، تخفیف)، و
   * نمایشِ حدسیِ ما با آنچه واقعاً ثبت شده فرق می‌کند.
   */
  const savePrice = useCallback(
    async (product: Product, value: string) => {
      const price = Number(value);

      if (!Number.isFinite(price) || price < 0) {
        throw new Error(t('invalidPrice'));
      }

      await api(`/products/${product.id}`, {
        method: 'PATCH',
        body: { salePrice: price },
      });

      await load();
    },
    [load, t],
  );

  /**
   * آپلود تصویر کالا.
   *
   * فایل مستقیم به `/uploads` می‌رود و نشانی برگشتی روی کالا می‌نشیند.
   * دو مرحله است نه یکی، چون آپلود `multipart` است و به‌روزرسانی کالا
   * JSON — قاطی کردنشان یعنی یک مسیر خاص فقط برای همین کار.
   */
  const uploadImage = useCallback(
    async (product: Product, file: File) => {
      // حجم پیش از فرستادن بررسی می‌شود: ده مگابایت روی اتصال فروشگاه
      // یک دقیقه طول می‌کشد و بعد سرور ردش می‌کند.
      if (file.size > 10 * 1024 * 1024) {
        setError(t('imageTooLarge'));
        return;
      }

      if (!file.type.startsWith('image/')) {
        setError(t('notAnImage'));
        return;
      }

      setError('');

      try {
        const form = new FormData();
        form.append('file', file);
        form.append('entityType', 'PRODUCT');
        form.append('entityId', product.id);

        const response = await fetch(`${API_URL}/uploads`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken() ?? ''}` },
          body: form,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const attachment = (await response.json()) as { filePath: string };

        await api(`/products/${product.id}`, {
          method: 'PATCH',
          body: { imageUrl: attachment.filePath },
        });

        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('saveError'));
      }
    },
    [load, t],
  );

  const columns = useMemo<Array<Column<Product>>>(
    () => [
      {
        key: 'image',
        label: t('image'),
        width: 54,
        value: (product) => (product.imageUrl ? '1' : '0'),
        render: (product) => (
          // برچسب دور خانهٔ فایل: خودِ input فایل در هر مرورگر شکل دیگری
          // دارد و با بقیهٔ جدول جور درنمی‌آید.
          <label className="cell-image" title={t('uploadImage')}>
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`${API_URL}${product.imageUrl}`} alt="" />
            ) : (
              <Icon name="package" size={16} />
            )}
            <input
              type="file"
              accept="image/*"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(product, file);
                // پاک کردن مقدار: بدون آن، انتخاب دوبارهٔ همان فایل هیچ
                // رویدادی نمی‌سازد.
                event.target.value = '';
              }}
            />
          </label>
        ),
      },
      {
        key: 'name',
        label: t('name'),
        value: (product) => product.name,
        render: (product) => <strong>{product.name}</strong>,
      },
      { key: 'sku', label: t('code'), value: (product) => product.sku },
      {
        key: 'barcode',
        label: t('barcode'),
        optional: true,
        value: (product) => product.barcode ?? '',
      },
      {
        key: 'category',
        label: t('category'),
        value: (product) => product.categoryName ?? '—',
      },
      {
        key: 'stock',
        label: t('stockQty'),
        numeric: true,
        total: true,
        value: (product) => stock(product),
        render: (product) => {
          const quantity = stock(product);
          const isLow =
            product.minStock !== null && quantity <= Number(product.minStock);

          // موجودی کم باید پیش از خواندن عدد دیده شود؛ همان چیزی است که
          // انباردار دنبالش می‌گردد.
          return (
            <span style={isLow ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
              {fa(quantity)}
            </span>
          );
        },
      },
      {
        key: 'purchasePrice',
        label: t('purchasePrice'),
        numeric: true,
        optional: true,
        value: (product) => Number(product.purchasePrice ?? 0),
        render: (product) => fa(product.purchasePrice),
      },
      {
        key: 'salePrice',
        label: t('salePrice'),
        numeric: true,
        value: (product) => Number(product.salePrice ?? 0),
        render: (product) => <strong>{fa(product.salePrice)}</strong>,
        // تغییر قیمت پرتکرارترین ویرایش یک فروشگاه است؛ نباید فرم باز کند.
        editable: { type: 'number', save: savePrice },
      },
      { key: 'unit', label: t('unit'), value: (product) => product.unit },
      {
        key: 'status',
        label: t('status'),
        value: (product) => product.status,
        render: (product) => (
          <span className="badge" style={{ color: statusColor(product.status) }}>
            {product.status}
          </span>
        ),
      },
    ],
    [t, fa, stock, savePrice, uploadImage],
  );

  const totalPages = page?.totalPages ?? 1;

  return (
    <AppShell
      title={t('productsTitle')}
      subtitle={`${fa(summary.count)} ${t('productsCountLabel')}`}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="stats-grid">
        <StatCard icon="package" label={t('productsCountLabel')} value={fa(summary.count)} />
        <StatCard
          icon="alert"
          label={t('lowStock')}
          value={fa(summary.low)}
          accent={summary.low > 0 ? 'var(--danger)' : undefined}
        />
        <StatCard icon="warehouse" label={t('stockValue')} value={fa(summary.value)} />
        <StatCard icon="link" label={t('onlineProducts')} value={fa(summary.online)} />
      </div>

      <Grid
        rows={rows}
        columns={columns}
        rowKey={(product) => product.id}
        loading={loading}
        empty={t('noProducts')}
        exportName="products"
        t={t}
        toolbar={
          <>
            <input
              style={{ ...TOUCH, minHeight: 38, minWidth: 240 }}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchProduct')}
              type="search"
            />
            <select
              style={{ ...TOUCH, minHeight: 38 }}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label={t('status')}
            >
              <option value="">{t('allStatuses')}</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
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
