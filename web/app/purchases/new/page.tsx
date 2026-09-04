'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import AppShell from '../../../components/AppShell';
import BarcodeScanner, {
  isScannerSupported,
} from '../../../components/BarcodeScanner';
import { Icon } from '../../../components/icons';
import { NUM, ROW, TD, TOUCH } from '../../../components/ui';
import { API_URL, api, getToken } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n-context';
import { shrinkImage } from '../../../lib/image';
import { isSpeechSupported, listenOnce, parseVoiceCommand } from '../../../lib/speech';

type Supplier = { id: string; name: string };
type Warehouse = { id: string; name: string };

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  purchasePrice: string | number;
};

type Line = {
  productId: string;
  name: string;
  unit: string | null;
  quantity: number;
  purchasePrice: number;
};

/**
 * ثبت فاکتور خرید — ساخته‌شده برای انباردار، نه پشت میز.
 *
 * سه تصمیم که از کار واقعی انبار می‌آیند:
 *
 * ۱. **اسکن، افزودن فوری.**  انباردار کارتن به کارتن اسکن می‌کند؛ اگر هر
 *    قلم فرم جدا بخواهد، کار عملاً انجام نمی‌شود.  مقدار بعداً اصلاح
 *    می‌شود.
 *
 * ۲. **اسکن دوباره = افزایش مقدار.**  ده کارتن یعنی ده بار اسکن، نه یک
 *    اسکن و تایپ عدد ۱۰.
 *
 * ۳. **بهای خرید از آخرین خرید پر می‌شود** ولی قابل تغییر است: قیمت
 *    معمولاً همان است و تایپ دوبارهٔ آن برای هر قلم اتلاف وقت است.
 */
export default function NewPurchasePage() {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [code, setCode] = useState('');
  const [freight, setFreight] = useState('0');
  const [capitalize, setCapitalize] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  useEffect(() => {
    setCameraReady(isScannerSupported());
    setMicReady(isSpeechSupported());

    void (async () => {
      try {
        const [sup, wh] = await Promise.all([
          api<Supplier[]>('/suppliers'),
          api<Warehouse[]>('/warehouses'),
        ]);

        const supList = Array.isArray(sup) ? sup : [];
        const whList = Array.isArray(wh) ? wh : [];

        setSuppliers(supList);
        setWarehouses(whList);

        // تک‌گزینه‌ها خودکار انتخاب می‌شوند: بیشتر فروشگاه‌ها یک انبار
        // دارند و انتخاب دستی‌اش هر بار، کار اضافه است.
        if (supList.length === 1) setSupplierId(supList[0].id);
        if (whList.length === 1) setWarehouseId(whList[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('fetchError'));
      }
    })();
  }, [t]);

  /** کالا را با بارکد یا کد پیدا می‌کند و به فهرست می‌افزاید. */
  const addByCode = useCallback(
    async (input: string, qty = 1) => {
      const value = input.trim();
      if (!value) return;

      try {
        const found = await api<Product[]>(
          `/products?search=${encodeURIComponent(value)}`,
        );

        const product = (Array.isArray(found) ? found : []).find(
          (item) => item.sku === value || item.id === value,
        ) ?? (Array.isArray(found) ? found[0] : undefined);

        if (!product) {
          setError(`${t('productNotFoundShort')}: ${value}`);
          return;
        }

        setLines((prev) => {
          const existing = prev.find((line) => line.productId === product.id);

          // اسکن دوباره مقدار را زیاد می‌کند، نه ردیف تازه بسازد.
          if (existing) {
            return prev.map((line) =>
              line.productId === product.id
                ? { ...line, quantity: line.quantity + qty }
                : line,
            );
          }

          return [
            ...prev,
            {
              productId: product.id,
              name: product.name,
              unit: product.unit,
              quantity: qty,
              purchasePrice: Number(product.purchasePrice ?? 0),
            },
          ];
        });

        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : t('fetchError'));
      }
    },
    [t],
  );

  /**
   * افزودن با صدا — «ده کارتن شیر».
   *
   * ⚠️ دستِ انباردار پُر است.
   *
   *    کارتن در بغل، پالت جلوی پا.  تایپ کردن یعنی زمین گذاشتنِ بار،
   *    و اسکن یعنی پیدا کردنِ بارکد روی کارتنی که پشتش به بالاست.
   *    گفتن، تنها راهی است که دست را آزاد نگه می‌دارد.
   *
   * ⚠️ مقدار **قبل از** نام گفته می‌شود و همان‌جا اعمال می‌شود.
   *
   *    «ده کارتن شیر» یعنی ده تا، نه اینکه ده بار بگویی «شیر».
   *    `parseVoiceCommand` همین را جدا می‌کند و از قبل در `pos`
   *    استفاده و آزموده شده — دوباره نوشتنش یعنی دو رفتارِ متفاوت
   *    برای یک جمله.
   */
  const addByVoice = useCallback(() => {
    setError('');
    setListening(true);
    listenOnce(
      (text) => {
        setListening(false);
        const { qty, term } = parseVoiceCommand(text);
        setHeard(text);
        if (!term) return;
        // مقدارِ نگفته یعنی یکی — همان رفتارِ اسکن.
        void addByCode(term, qty ?? 1);
      },
      (message) => {
        setListening(false);
        setError(message);
      },
    );
  }, [addByCode]);

  /**
   * عکسِ کالا/بارنامه را به فاکتورِ ساخته‌شده می‌چسباند.
   *
   * از `POST /uploads` موجود استفاده می‌کند — همان مسیری که صفحهٔ
   * کالاها برای عکسِ محصول به‌کار می‌برد.  نقطهٔ تازه‌ای لازم نیست.
   */
  async function uploadPhotos(purchaseId: string) {
    for (const photo of photos) {
      try {
        const small = await shrinkImage(photo);

        const form = new FormData();
        form.append('file', small);
        form.append('entityType', 'PURCHASE');
        form.append('entityId', purchaseId);

        await fetch(`${API_URL}/uploads`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken() ?? ''}` },
          body: form,
        });
      } catch {
        /* عکس نرفت — فاکتور سرِ جایش است */
      }
    }
  }

  function updateLine(productId: string, patch: Partial<Line>) {
    setLines((prev) =>
      prev
        .map((line) =>
          line.productId === productId ? { ...line, ...patch } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  async function save(receive: boolean) {
    if (!supplierId || !warehouseId || !lines.length) return;

    setBusy(true);
    try {
      const purchase = await api<{ id: string }>('/purchases', {
        method: 'POST',
        body: {
          supplierId,
          warehouseId,
          freightCost: Number(freight) || 0,
          capitalizeFreight: capitalize,
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            purchasePrice: line.purchasePrice,
          })),
        },
      });

      // دریافت جداست چون فاکتور ممکن است پیش از رسیدن کالا ثبت شود؛
      // موجودی و سند حسابداری فقط هنگام دریافت اتفاق می‌افتند.
      if (receive) {
        await api(`/purchases/${purchase.id}/receive`, {
          method: 'PATCH',
          body: {},
        });
      }

      // ⚠️ عکس‌ها **پس از** ساخته شدنِ فاکتور آپلود می‌شوند.
      //
      //    `entityId` پیش از آن وجود ندارد.  نگه داشتنشان در حافظه و
      //    فرستادنِ بعدی، تنها ترتیبی است که بدونِ نقطهٔ تازه در
      //    بک‌اند کار می‌کند.
      //
      // ⚠️ شکستِ آپلود، ثبتِ فاکتور را برنمی‌گرداند.
      //
      //    فاکتور و سندِ حسابداری همین حالا ثبت شده‌اند؛ خطا دادن در
      //    این مرحله به انباردار می‌گوید «ذخیره نشد» در حالی که شده —
      //    و او دوباره ثبت می‌کند.  عکس سند است، نه خودِ معامله.
      await uploadPhotos(purchase.id);

      router.push('/purchases');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
      setBusy(false);
    }
  }

  const subtotal = lines.reduce(
    (sum, line) => sum + line.quantity * line.purchasePrice,
    0,
  );
  const total = subtotal + (Number(freight) || 0);

  return (
    <AppShell title={t('newPurchase')} subtitle={t('purchasesSubtitle')}>
      {error ? <div className="error">{error}</div> : null}

      {scanning ? (
        <BarcodeScanner
          onScan={(scanned) => void addByCode(scanned)}
          onClose={() => setScanning(false)}
        />
      ) : null}

      {/* سربرگ فاکتور */}
      <div
        className="card"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        <label>
          <div className="muted" style={{ marginBottom: 4 }}>
            {t('supplier')}
          </div>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            style={{ ...TOUCH, width: '100%' }}
          >
            <option value="">{t('pickSupplier')}</option>
            {suppliers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <div className="muted" style={{ marginBottom: 4 }}>
            {t('warehouse')}
          </div>
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            style={{ ...TOUCH, width: '100%' }}
          >
            <option value="">{t('pickWarehouse')}</option>
            {warehouses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <div className="muted" style={{ marginBottom: 4 }}>
            {t('freightCost')}
          </div>
          <input
            type="number"
            min={0}
            value={freight}
            onChange={(e) => setFreight(e.target.value)}
            style={{ ...TOUCH, width: '100%' }}
          />
        </label>

        <label
          style={{ display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 8 }}
        >
          <input
            type="checkbox"
            checked={capitalize}
            onChange={(e) => setCapitalize(e.target.checked)}
          />
          <span>{t('capitalizeFreight')}</span>
        </label>
      </div>

      {/* اسکن */}
      <form
        className="card"
        style={{ margin: '18px 0', display: 'flex', gap: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          void addByCode(code);
          setCode('');
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('scanToAdd')}
          autoComplete="off"
          autoFocus
          style={{ ...TOUCH, flex: 1 }}
        />
        <button type="submit" style={TOUCH}>
          <Icon name="plus" size={18} /> {t('addItem')}
        </button>

        {cameraReady ? (
          <button
            type="button"
            className="ghost"
            style={TOUCH}
            onClick={() => setScanning(true)}
            aria-label={t('scanCamera')}
          >
            <Icon name="pos" size={20} />
          </button>
        ) : null}

        {/* عکسِ کالا یا بارنامه — سندِ تحویل.
            `capture="environment"` روی گوشی مستقیم دوربینِ پشت را باز
            می‌کند؛ روی دسکتاپ به انتخابِ فایل برمی‌گردد. */}
        <label className="ghost" style={{ ...TOUCH, cursor: 'pointer' }}>
          <Icon name="camera" size={20} />
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            hidden
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length) setPhotos((prev) => [...prev, ...picked]);
              // بدونِ این، همان عکس بارِ دوم رویدادی نمی‌سازد.
              e.target.value = '';
            }}
            aria-label={t('attachPhoto')}
          />
        </label>

        {micReady ? (
          <button
            type="button"
            className="ghost"
            style={{
              ...TOUCH,
              // شنیدن باید دیده شود: بدونش کاربر حرف می‌زند و
              // نمی‌داند گوش داده می‌شود یا نه.
              borderColor: listening ? 'var(--accent)' : undefined,
              color: listening ? 'var(--accent)' : undefined,
            }}
            onClick={addByVoice}
            disabled={listening}
            aria-label={t('addByVoice')}
            aria-pressed={listening}
          >
            <Icon name="mic" size={20} />
          </button>
        ) : null}
      </form>

      {/* آنچه شنیده شد — تا اگر اشتباه شنید، کاربر بفهمد چرا.
          بدونِ این، «کالا پیدا نشد» گیج‌کننده است: کاربر نمی‌داند
          نامش در انبار نیست یا موتور چیزِ دیگری شنیده. */}
      {listening || heard ? (
        <p
          className="muted"
          style={{ margin: '-8px 0 12px', fontSize: 13 }}
          aria-live="polite"
        >
          {listening ? t('listening') : `${t('heard')}: «${heard}»`}
        </p>
      ) : null}

      {/* عکس‌های پیوست — با امکانِ حذف پیش از ثبت */}
      {photos.length ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            margin: '0 0 14px',
          }}
        >
          {photos.map((photo, index) => (
            <span
              key={`${photo.name}-${index}`}
              className="badge"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="camera" size={14} />
              {photo.name.length > 18
                ? `${photo.name.slice(0, 16)}…`
                : photo.name}
              <button
                type="button"
                className="ghost"
                style={{ padding: 2, lineHeight: 1 }}
                onClick={() =>
                  setPhotos((prev) => prev.filter((_, i) => i !== index))
                }
                aria-label={t('remove')}
              >
                <Icon name="x" size={14} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {/* اقلام */}
      <div className="card">
        {lines.length === 0 ? (
          <p className="muted">{t('noItemsYet')}</p>
        ) : (
          <div className="table-wrap">
            <table className="stack-table">
              <thead>
                <tr style={{ color: 'var(--text-dim)' }}>
                  <th style={{ padding: 8, textAlign: 'right' }}>{t('colProduct')}</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>{t('quantity')}</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>{t('unitCost')}</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>{t('total')}</th>
                  <th style={{ padding: 8, textAlign: 'right' }}>{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.productId} style={ROW}>
                    <td style={TD} data-primary>
                      {line.name}
                      {line.unit ? (
                        <span className="muted"> ({line.unit})</span>
                      ) : null}
                    </td>
                    <td style={TD} data-label={t('quantity')}>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(line.productId, {
                            quantity: Number(e.target.value),
                          })
                        }
                        style={{ ...TOUCH, width: 90 }}
                      />
                    </td>
                    <td style={TD} data-label={t('unitCost')}>
                      <input
                        type="number"
                        min={0}
                        value={line.purchasePrice}
                        onChange={(e) =>
                          updateLine(line.productId, {
                            purchasePrice: Number(e.target.value),
                          })
                        }
                        style={{ ...TOUCH, width: 130 }}
                      />
                    </td>
                    <td style={{ ...NUM, fontWeight: 700 }} data-label={t('total')}>
                      {fa(line.quantity * line.purchasePrice)}
                    </td>
                    <td style={TD} data-label={t('actions')}>
                      <button
                        type="button"
                        className="ghost"
                        style={TOUCH}
                        onClick={() =>
                          updateLine(line.productId, { quantity: 0 })
                        }
                        aria-label={t('remove')}
                      >
                        <Icon name="x" size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* جمع و ثبت */}
      {lines.length > 0 ? (
        <div className="card" style={{ marginTop: 18 }}>
          <Row label={t('subtotal')} value={fa(subtotal)} />
          {Number(freight) > 0 ? (
            <Row label={t('freightCost')} value={fa(freight)} />
          ) : null}
          <Row label={t('total')} value={fa(total)} bold />

          <div
            style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}
          >
            <button
              type="button"
              style={TOUCH}
              disabled={busy || !supplierId || !warehouseId}
              onClick={() => void save(true)}
            >
              <Icon name="check" size={18} /> {t('receiveNow')}
            </button>

            <button
              type="button"
              className="ghost"
              style={TOUCH}
              disabled={busy || !supplierId || !warehouseId}
              onClick={() => void save(false)}
            >
              {t('savePurchase')}
            </button>
          </div>

          <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            {/* تفاوت این دو در عمل مهم است و باید همان‌جا توضیح داده شود. */}
            «{t('receiveNow')}» موجودی را افزایش می‌دهد و سند حسابداری می‌زند.
          </p>
        </div>
      ) : null}
    </AppShell>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        fontWeight: bold ? 800 : 400,
        fontSize: bold ? 18 : 15,
      }}
    >
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}
