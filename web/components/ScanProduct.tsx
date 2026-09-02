'use client';

import { useCallback, useRef, useState } from 'react';

import { api } from '../lib/api';
import { useI18n } from '../lib/i18n-context';
import { TOUCH } from './ui';

/**
 * ثبتِ کالا با اسکنِ بارکد.
 *
 * ⚠️ اسکنرِ بارکد **صفحه‌کلید** است، نه دوربین.
 *
 *    اسکنرهای فروشگاهی رقم‌ها را مثل تایپِ سریع می‌فرستند و آخرش
 *    Enter می‌زنند.  پس چیزی که لازم است یک ورودیِ متنیِ همیشه‌فوکوس
 *    است، نه دسترسی به دوربین.  همین باعث می‌شود روی رایانهٔ صندوق
 *    بدون هیچ مجوزی کار کند.
 *
 * ⚠️ «پیدا نشد» بن‌بست نیست.
 *
 *    فهرستِ مشترک تازه دارد پر می‌شود؛ بیشترِ اسکن‌های روزِ اول پیدا
 *    نمی‌شوند.  اگر آن حالت خطا نشان می‌داد، کاربر فکر می‌کرد قابلیت
 *    خراب است.  فرم در هر دو حالت باز می‌شود — فقط یکی‌اش از پیش پر
 *    است — و آنچه کاربر می‌نویسد به فهرست برمی‌گردد.
 */

type Found = {
  barcode: string;
  name: string;
  brand: string | null;
  unit: string | null;
  imageUrl: string | null;
  seenCount: number;
};

type Draft = {
  barcode: string;
  name: string;
  sku: string;
  unit: string;
  salePrice: string;
  purchasePrice: string;
};

const EMPTY: Draft = {
  barcode: '',
  name: '',
  sku: '',
  unit: '',
  salePrice: '',
  purchasePrice: '',
};

export default function ScanProduct({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n();

  const [code, setCode] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  const scan = useCallback(
    async (raw: string) => {
      // ⚠️ رقم‌های فارسی به لاتین.  اسکنر لاتین می‌فرستد ولی کاربری که
      //    دستی تایپ می‌کند با صفحه‌کلید فارسی «۶۲۶…» می‌نویسد.
      const barcode = raw
        .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
        .replace(/\D/g, '');

      if (barcode.length < 8) {
        setError(t('scanTooShort'));
        return;
      }

      setBusy(true);
      setError('');
      setNote('');

      try {
        const hit = await api<Found | null>(`/catalog/${barcode}`);

        setFound(hit ?? null);
        setNote(hit ? t('scanFound') : t('scanNotFound'));
        setDraft({
          ...EMPTY,
          barcode,
          name: hit?.name ?? '',
          unit: hit?.unit ?? '',
          // SKU پیش‌فرض خودِ بارکد است — کاربر می‌تواند عوضش کند، ولی
          // نبودنش یعنی یک میدانِ اجباریِ اضافه سرِ صندوق.
          sku: barcode,
        });
      } catch {
        // ⚠️ شکستِ فهرست، ثبتِ کالا را نمی‌بندد.  فرمِ خالی باز می‌شود.
        setFound(null);
        setNote(t('scanNotFound'));
        setDraft({ ...EMPTY, barcode, sku: barcode });
      } finally {
        setBusy(false);
        setCode('');
      }
    },
    [t],
  );

  const save = useCallback(async () => {
    if (!draft) return;

    setBusy(true);
    setError('');

    try {
      await api('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: draft.name.trim(),
          sku: draft.sku.trim(),
          barcode: draft.barcode,
          unit: draft.unit.trim() || 'عدد',
          salePrice: Number(draft.salePrice || 0),
          purchasePrice: Number(draft.purchasePrice || 0),
        }),
      });

      setDraft(null);
      setFound(null);
      setNote('');
      onSaved();

      // فوکوس برمی‌گردد به ورودیِ اسکن: کالای بعدی بی‌کلیک اسکن می‌شود.
      scanRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }, [draft, onSaved, t]);

  const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => (current ? { ...current, [key]: event.target.value } : current));

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{t('scanTitle')}</strong>

        <input
          ref={scanRef}
          autoFocus
          type="search"
          inputMode="numeric"
          value={code}
          disabled={busy}
          style={{ ...TOUCH, minHeight: 38, minWidth: 220 }}
          placeholder={t('scanPlaceholder')}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            // اسکنر آخرِ کار Enter می‌زند — همین رویداد کلِ جریان است.
            if (event.key === 'Enter') {
              event.preventDefault();
              void scan(code);
            }
          }}
        />

        <button type="button" className="btn-sm" disabled={busy} onClick={() => void scan(code)}>
          {t('scanAction')}
        </button>

        {note ? <span className="muted">{note}</span> : null}
      </div>

      {error ? <div className="error">{error}</div> : null}

      {draft ? (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {found?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={found.imageUrl}
              alt={found.name}
              style={{ maxHeight: 96, width: 'auto', borderRadius: 8 }}
            />
          ) : null}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              style={{ ...TOUCH, minHeight: 38, flex: '2 1 220px' }}
              value={draft.name}
              onChange={set('name')}
              placeholder={t('name')}
            />
            <input
              style={{ ...TOUCH, minHeight: 38, flex: '1 1 120px' }}
              value={draft.sku}
              onChange={set('sku')}
              placeholder={t('code')}
            />
            <input
              style={{ ...TOUCH, minHeight: 38, flex: '1 1 90px' }}
              value={draft.unit}
              onChange={set('unit')}
              placeholder={t('unit')}
            />
            <input
              style={{ ...TOUCH, minHeight: 38, flex: '1 1 120px' }}
              value={draft.purchasePrice}
              onChange={set('purchasePrice')}
              inputMode="numeric"
              placeholder={t('purchasePrice')}
            />
            <input
              style={{ ...TOUCH, minHeight: 38, flex: '1 1 120px' }}
              value={draft.salePrice}
              onChange={set('salePrice')}
              inputMode="numeric"
              placeholder={t('salePrice')}
            />

            <button
              type="button"
              className="btn-sm"
              disabled={busy || !draft.name.trim() || !draft.sku.trim()}
              onClick={() => void save()}
            >
              {t('save')}
            </button>
            <button
              type="button"
              className="btn-sm ghost"
              onClick={() => {
                setDraft(null);
                setFound(null);
                setNote('');
                scanRef.current?.focus();
              }}
            >
              {t('cancel')}
            </button>
          </div>

          {/* چند فروشگاه این بارکد را همین‌طور ثبت کرده‌اند — نشانهٔ اعتماد. */}
          {found && found.seenCount > 1 ? (
            <span className="muted">
              {t('scanSeen')}: {found.seenCount}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
