'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { DataTable, ROW, TD, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { barcodeSvg } from '../../lib/barcode';
import { useI18n } from '../../lib/i18n-context';

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  salePrice: string | number;
};

type SheetItem = { product: Product; count: number };

/** اندازه‌های رایج برچسب حرارتی، بر حسب میلی‌متر. */
const SIZES = {
  small: { key: 'sizeSmall', w: 30, h: 20, module: 0.25, bar: 9 },
  medium: { key: 'sizeMedium', w: 40, h: 30, module: 0.3, bar: 13 },
  large: { key: 'sizeLarge', w: 50, h: 30, module: 0.33, bar: 14 },
} as const;

type SizeKey = keyof typeof SIZES;

export default function LabelsPage() {
  const { t, locale } = useI18n();

  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState<SheetItem[]>([]);
  const [count, setCount] = useState('1');
  const [size, setSize] = useState<SizeKey>('medium');
  const [showPrice, setShowPrice] = useState(true);
  const [showName, setShowName] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const list = await api<Product[]>('/products');
      setProducts(Array.isArray(list) ? list : []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return products.slice(0, 50);

    return products
      .filter(
        (item) =>
          item.name?.toLowerCase().includes(needle) ||
          item.sku?.toLowerCase().includes(needle) ||
          item.barcode?.includes(needle),
      )
      .slice(0, 50);
  }, [products, search]);

  const total = useMemo(
    () => sheet.reduce((sum, item) => sum + item.count, 0),
    [sheet],
  );

  function addToSheet(product: Product) {
    const n = Math.max(1, Math.min(Number(count) || 1, 500));

    setSheet((prev) => {
      const found = prev.find((item) => item.product.id === product.id);
      if (found) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, count: item.count + n }
            : item,
        );
      }
      return [...prev, { product, count: n }];
    });
  }

  /**
   * چاپ در پنجرهٔ جدید با CSS مخصوص چاپ.
   *
   * چرا پنجرهٔ جدا و نه `@media print` روی همین صفحه: برچسب باید سیاه روی
   * سفید و بدون هیچ عنصر رابط کاربری چاپ شود، و تم تیرهٔ برنامه و AppShell
   * در چاپ مزاحم‌اند.  اندازهٔ صفحه هم باید دقیقاً اندازهٔ برچسب باشد تا
   * چاپگر حرارتی درست برش بزند.
   */
  function print() {
    if (!sheet.length) return;

    const spec = SIZES[size];

    const cells = sheet
      .flatMap((item) =>
        Array.from({ length: item.count }, () => {
          const code = item.product.barcode ?? item.product.sku ?? '';
          const svg = barcodeSvg(code, {
            moduleWidth: spec.module,
            heightMm: spec.bar,
            showText: true,
          });

          return `<div class="label">
            ${showName ? `<div class="name">${escapeHtml(item.product.name)}</div>` : ''}
            <div class="code">${svg}</div>
            ${showPrice ? `<div class="price">${fa(item.product.salePrice)}</div>` : ''}
          </div>`;
        }),
      )
      .join('');

    const html = `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>${t('printLabels')}</title>
<style>
  @page { size: ${spec.w}mm ${spec.h}mm; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Vazirmatn, Tahoma, sans-serif;
    background: #fff;
    color: #000;
  }
  .label {
    width: ${spec.w}mm;
    height: ${spec.h}mm;
    padding: 1mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5mm;
    /* هر برچسب یک صفحه است تا چاپگر حرارتی بین آن‌ها برش بزند. */
    page-break-after: always;
    overflow: hidden;
  }
  .name {
    font-size: 2.4mm;
    font-weight: 700;
    text-align: center;
    line-height: 1.1;
    max-height: 5mm;
    overflow: hidden;
  }
  .code svg { display: block; }
  .price { font-size: 3mm; font-weight: 800; }
</style></head>
<body>${cells}
<script>
  // چاپ پس از بارگذاری فونت‌ها؛ بدون این، متن با فونت جایگزین چاپ می‌شود.
  window.onload = function () { window.print(); };
</script>
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) return;

    win.document.write(html);
    win.document.close();
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  const spec = SIZES[size];

  return (
    <AppShell
      title={t('labelsTitle')}
      subtitle={t('labelsSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      {/* تنظیمات */}
      <div
        className="card"
        style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}
      >
        <label className="muted">{t('labelSize')}</label>
        <select
          value={size}
          onChange={(e) => setSize(e.target.value as SizeKey)}
          style={{ ...TOUCH, minWidth: 160 }}
        >
          {(Object.keys(SIZES) as SizeKey[]).map((key) => (
            <option key={key} value={key}>
              {t(SIZES[key].key)}
            </option>
          ))}
        </select>

        <label className="muted">{t('labelCount')}</label>
        <input
          type="number"
          min={1}
          max={500}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          style={{ ...TOUCH, width: 100 }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showName}
            onChange={(e) => setShowName(e.target.checked)}
          />
          {t('showName')}
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showPrice}
            onChange={(e) => setShowPrice(e.target.checked)}
          />
          {t('showPrice')}
        </label>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginTop: 18,
        }}
      >
        {/* انتخاب کالا */}
        <div className="card">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchProducts')}
            style={{ ...TOUCH, width: '100%', marginBottom: 12 }}
          />

          <DataTable
            headers={[t('colProduct'), t('barcode'), t('actions')]}
            empty={t('noProducts')}
            loading={loading}
            loadingLabel={t('loading')}
            rows={visible.length}
          >
            {visible.map((product) => {
              const code = product.barcode ?? product.sku;

              return (
                <tr key={product.id} style={ROW}>
                  <td style={TD}>{product.name}</td>
                  <td style={TD} dir="ltr" className="muted">
                    {code ?? '—'}
                  </td>
                  <td style={TD}>
                    {code ? (
                      <button
                        type="button"
                        style={TOUCH}
                        onClick={() => addToSheet(product)}
                      >
                        {t('addToSheet')}
                      </button>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {t('noBarcode')}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </div>

        {/* برگه و پیش‌نمایش */}
        <div className="card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <strong>
              {t('totalLabels')}: {fa(total)}
            </strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="ghost"
                style={TOUCH}
                onClick={() => setSheet([])}
              >
                {t('clearSheet')}
              </button>
              <button
                type="button"
                style={TOUCH}
                disabled={!sheet.length}
                onClick={print}
              >
                🖨 {t('printLabels')}
              </button>
            </div>
          </div>

          {sheet.length === 0 ? (
            <p className="muted">{t('sheetEmpty')}</p>
          ) : (
            <>
              <div className="table-wrap" style={{ marginBottom: 14 }}>
                <table>
                  <tbody>
                    {sheet.map((item) => (
                      <tr key={item.product.id} style={ROW}>
                        <td style={TD}>{item.product.name}</td>
                        <td style={TD}>×{fa(item.count)}</td>
                        <td style={TD}>
                          <button
                            type="button"
                            className="ghost"
                            style={TOUCH}
                            onClick={() =>
                              setSheet((prev) =>
                                prev.filter(
                                  (row) => row.product.id !== item.product.id,
                                ),
                              )
                            }
                          >
                            {t('remove')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* پیش‌نمایش دقیقاً همان چیزی است که چاپ می‌شود — سیاه روی
                  سفید، در اندازهٔ واقعی برچسب. */}
              <div
                style={{
                  background: '#fff',
                  color: '#000',
                  padding: 12,
                  borderRadius: 'var(--radius)',
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: `${spec.w}mm`,
                    height: `${spec.h}mm`,
                    border: '1px dashed #999',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5mm',
                    padding: '1mm',
                    overflow: 'hidden',
                  }}
                >
                  {showName ? (
                    <div
                      style={{
                        fontSize: '2.4mm',
                        fontWeight: 700,
                        textAlign: 'center',
                      }}
                    >
                      {sheet[0].product.name}
                    </div>
                  ) : null}
                  <div
                    dangerouslySetInnerHTML={{
                      __html: barcodeSvg(
                        sheet[0].product.barcode ?? sheet[0].product.sku ?? '',
                        {
                          moduleWidth: spec.module,
                          heightMm: spec.bar,
                          showText: true,
                        },
                      ),
                    }}
                  />
                  {showPrice ? (
                    <div style={{ fontSize: '3mm', fontWeight: 800 }}>
                      {fa(sheet[0].product.salePrice)}
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
