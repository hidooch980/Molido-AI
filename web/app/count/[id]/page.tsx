'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../../lib/api';
import { enqueue, flush, pending } from '../../../lib/offline-queue';
import { useI18n } from '../../../lib/i18n-context';

type Line = {
  id: string;
  productId: string;
  productName: string | null;
  productSku: string | null;
  productUnit: string | null;
  productBarcode: string | null;
  systemQty: string | number;
  countedQty: string | number | null;
};

type Detail = {
  id: string;
  countNo: string;
  status: string;
  warehouseName: string | null;
  lines: Line[];
};

const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

/** رقم فارسی/عربی به لاتین — اسکنر و صفحه‌کلید فارسی هر دو باید کار کنند. */
function normalizeDigits(s: string): string {
  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const AR = '٠١٢٣٤٥٦٧٨٩';
  return s.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = FA.indexOf(d);
    return String(i >= 0 ? i : AR.indexOf(d));
  });
}

const isCounted = (l: Line) => l.countedQty !== null && l.countedQty !== '';

export default function CountSessionPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const countId = params.id;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState<Line | null>(null);
  const [entry, setEntry] = useState('');
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [flash, setFlash] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<Detail>(`/stock-count/${countId}`)
      .then(setDetail)
      .catch((e) => setError(e?.message || 'خطا در دریافت انبارگردانی'));
  }, [countId]);

  useEffect(load, [load]);

  /**
   * صف را می‌فرستد و شمارنده را تازه می‌کند.
   *
   * ⚠️ پس از همگام‌سازیِ موفق، `load()` صدا زده می‌شود.
   *
   *    عددهای محلی خوش‌بینانه نشسته‌اند؛ تا وقتی از سرور تأیید
   *    نگیرند، نمی‌دانیم واقعاً ثبت شده‌اند.  بدون این بارگذاری،
   *    انباردار عددی را می‌بیند که شاید سرور ردش کرده باشد.
   */
  const sync = useCallback(async () => {
    const before = await pending();
    if (before.length === 0) {
      setPendingCount(0);
      return;
    }
    setSyncing(true);
    try {
      const result = await flush(async (item) => {
        await api(item.path, { method: item.method, body: item.body });
      });
      setPendingCount(result.left);
      if (result.sent > 0) load();
      if (result.failed > 0) {
        // ⚠️ رکوردی که سرور رد کرد، بی‌صدا نرود.
        //    انباردار باید بداند کدام شمارش ثبت نشد تا دوباره بزند.
        setFlash(`${result.failed} شمارش ثبت نشد — دوباره بشمارید`);
      }
    } finally {
      setSyncing(false);
    }
  }, [load]);

  // هنگام باز شدن، و هر بار که اتصال برمی‌گردد.
  useEffect(() => {
    void pending().then((rows) => setPendingCount(rows.length));
    void sync();

    const onOnline = () => void sync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [sync]);

  const lines = useMemo(() => detail?.lines ?? [], [detail]);
  const done = lines.filter(isCounted).length;
  const total = lines.length;

  /** شمرده‌نشده‌ها اول — کارِ باقی‌مانده باید بالای صفحه باشد. */
  const ordered = useMemo(
    () =>
      [...lines].sort((a, b) => {
        const d = Number(isCounted(a)) - Number(isCounted(b));
        if (d !== 0) return d;
        return (a.productName ?? '').localeCompare(b.productName ?? '', 'fa');
      }),
    [lines],
  );

  const openLine = useCallback((line: Line) => {
    setActive(line);
    setEntry(isCounted(line) ? String(line.countedQty) : '');
    // ⚠️ مقدار سیستم پیش از ثبت **پنهان** است — این عمدی است.
    //
    //    شمارشِ کور اصلِ انبارگردانی است.  اگر انباردار پیش از شمردن
    //    ببیند سیستم چه می‌گوید، ناخودآگاه همان را می‌نویسد و
    //    انبارگردانی به تأییدِ عدد قبلی تبدیل می‌شود — یعنی همان
    //    خطایی که قرار بود پیدا شود، پنهان می‌ماند.
    //
    //    پس از ثبت نشان داده می‌شود؛ آن‌وقت اطلاعات است، نه سوگیری.
    setReveal(false);
  }, []);

  /** اسکنر دستی مثل صفحه‌کلید تایپ می‌کند و آخرش Enter می‌زند. */
  function onScan(raw: string) {
    const typed = raw.trim();
    if (!typed) return;
    const code = normalizeDigits(typed);
    const hit =
      lines.find((l) => l.productBarcode === code) ??
      lines.find((l) => l.productSku === code) ??
      lines.find((l) => (l.productName ?? '').includes(typed));
    if (hit) {
      openLine(hit);
      setFlash('');
    } else {
      // پیام باید خودِ کد را بگوید: انباردار پشت سر هم اسکن می‌کند و
      // «یافت نشد» خالی به او نمی‌گوید کدام قلم را کنار بگذارد.
      setFlash(`«${typed}» در این انبارگردانی نیست`);
    }
    if (scanRef.current) scanRef.current.value = '';
  }

  async function save() {
    if (!active) return;
    const qty = Number(normalizeDigits(entry));
    if (!Number.isFinite(qty) || qty < 0) {
      setFlash('عدد معتبر نیست');
      return;
    }
    setSaving(true);
    try {
      // ⚠️ `body` شیء است نه رشته — `api()` خودش `JSON.stringify` می‌کند.
      //    رشته دادن، دوبار رشته‌سازی می‌شود و سرور «JSON نامعتبر»
      //    می‌گیرد.
      await api(`/stock-count/${countId}/lines/${active.id}`, {
        method: 'PATCH',
        body: { countedQty: qty },
      });
      setDetail((d) =>
        d
          ? {
              ...d,
              lines: d.lines.map((l) =>
                l.id === active.id ? { ...l, countedQty: qty } : l,
              ),
            }
          : d,
      );
      setActive((a) => (a ? { ...a, countedQty: qty } : a));
      setReveal(true);
      setFlash('');
    } catch (e: unknown) {
      // ⚠️ شکستِ **شبکه** با ردِ **سرور** یکی نیست.
      //
      //    وای‌فای انبار قطع و وصل می‌شود.  اگر هر خطایی را «ثبت نشد»
      //    بگوییم، انباردار عددی را که درست شمرده دوباره می‌شمارد —
      //    یا بدتر، رهایش می‌کند.
      //
      //    قطعیِ شبکه در صف می‌نشیند و به‌محضِ برگشتِ اتصال می‌رود.
      //    ردِ سرور (عددِ نامعتبر، خطِ ناموجود، دسترسیِ نداشته) در صف
      //    نمی‌نشیند: تکرارش همان جواب را می‌دهد.
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      const networkish = offline || (e as { isNetwork?: boolean })?.isNetwork === true;

      if (networkish) {
        const queued = await enqueue({
          path: `/stock-count/${countId}/lines/${active.id}`,
          method: 'PATCH',
          body: { countedQty: qty },
          label: `${active.productName ?? active.productSku ?? '—'}: ${qty}`,
        });

        if (queued) {
          // عدد **محلی** می‌نشیند تا انباردار پیشرفتش را ببیند.
          // بدون این، شمارشِ آفلاین شبیه کارِ انجام‌نشده به نظر می‌رسد
          // و دوباره شمرده می‌شود.
          setDetail((d) =>
            d
              ? {
                  ...d,
                  lines: d.lines.map((l) =>
                    l.id === active.id ? { ...l, countedQty: qty } : l,
                  ),
                }
              : d,
          );
          setActive((a) => (a ? { ...a, countedQty: qty } : a));
          setReveal(true);
          setPendingCount((n) => n + 1);
          setFlash('');
          return;
        }
      }

      setFlash(
        (e as { message?: string })?.message ??
          'ثبت نشد — اتصال را بررسی کنید و دوباره بزنید',
      );
    } finally {
      setSaving(false);
    }
  }

  /** قلم شمرده‌نشدهٔ بعدی؛ اگر نبود، برگه بسته می‌شود. */
  function next() {
    const rest = ordered.filter((l) => !isCounted(l) && l.id !== active?.id);
    if (rest[0]) openLine(rest[0]);
    else setActive(null);
  }

  const diff =
    active && isCounted(active)
      ? Number(active.countedQty) - Number(active.systemQty)
      : null;

  return (
    <>
      <header className="cnt-top">
        <Link href="/count" className="cnt-back" aria-label={t('maryamBackToList')}>
          <span aria-hidden="true">&#8594;</span>
        </Link>
        <div className="cnt-title">
          <strong>{detail?.countNo ?? '…'}</strong>
          <span className="cnt-muted">{detail?.warehouseName ?? ''}</span>
        </div>
        <span className="cnt-progress-num">
          {fa(done)}/{fa(total)}
        </span>
      </header>

      {/*
        ⚠️ صفِ نرفته باید **دیده** شود.

           انباردار در انبارِ بی‌آنتن می‌شمارد و برنامه عادی به نظر
           می‌رسد.  اگر ندانَد چیزی هنوز نرفته، گوشی را می‌بندد و
           می‌رود — و شمارشش وقتی از دست می‌رود که دیگر یادش نیست چه
           شمرده بود.

           نوار فقط وقتی هست که چیزی در صف باشد؛ نوارِ همیشگی نادیده
           گرفته می‌شود.
      */}
      {pendingCount > 0 ? (
        <p className="cnt-queue" role="status">
          {syncing
            ? `در حال ارسال ${fa(pendingCount)} شمارش…`
            : `${fa(pendingCount)} شمارش هنوز ارسال نشده — با برگشتِ اینترنت خودکار می‌رود`}
        </p>
      ) : null}

      <div
        className="cnt-bar"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="پیشرفت شمارش"
      >
        <span style={{ width: total ? `${(done / total) * 100}%` : '0%' }} />
      </div>

      <div className="cnt-scan">
        <input
          ref={scanRef}
          type="text"
          inputMode="search"
          placeholder="بارکد را اسکن کنید یا نام کالا را بنویسید"
          aria-label="اسکن بارکد یا جستجوی کالا"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onScan((e.target as HTMLInputElement).value);
            }
          }}
        />
      </div>

      {flash ? (
        <p className="cnt-flash" role="alert">
          {flash}
        </p>
      ) : null}
      {error ? (
        <p className="cnt-error" role="alert">
          {error}
        </p>
      ) : null}

      <main className="cnt-body">
        <ul className="cnt-lines">
          {ordered.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                className={`cnt-line${isCounted(l) ? ' is-done' : ''}`}
                onClick={() => openLine(l)}
              >
                <span className="cnt-line-name">{l.productName}</span>
                <span className="cnt-line-sku">{l.productSku ?? ''}</span>
                {isCounted(l) ? (
                  <span className="cnt-line-qty">
                    {fa(l.countedQty)} {l.productUnit ?? ''}
                  </span>
                ) : (
                  <span className="cnt-line-todo">{t('cntNotCounted')}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </main>

      {active ? (
        <div className="cnt-sheet" role="dialog" aria-modal="true">
          <button
            type="button"
            className="cnt-sheet-close"
            onClick={() => setActive(null)}
            aria-label={t('close')}
          >
            <span aria-hidden="true">&times;</span>
          </button>

          <h2>{active.productName}</h2>
          <p className="cnt-muted">
            {active.productSku ?? ''}
            {active.productUnit ? ` · ${active.productUnit}` : ''}
          </p>

          <input
            className="cnt-entry"
            type="text"
            inputMode="decimal"
            autoFocus
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            placeholder="تعداد شمرده‌شده"
            aria-label="تعداد شمرده‌شده"
          />

          {reveal && diff !== null ? (
            <p className={`cnt-diff${diff === 0 ? ' ok' : ''}`}>
              سیستم: {fa(active.systemQty)}
              {diff === 0
                ? ' · برابر است'
                : ` · اختلاف ${diff > 0 ? '+' : ''}${fa(diff)}`}
            </p>
          ) : (
            <p className="cnt-muted cnt-blind">
              {t('cntSystemAfterSave')}
            </p>
          )}

          <div className="cnt-actions">
            <button
              type="button"
              className="cnt-btn primary"
              onClick={save}
              disabled={saving || entry === ''}
            >
              {saving ? 'در حال ثبت…' : 'ثبت'}
            </button>
            <button type="button" className="cnt-btn" onClick={next}>
              {t('cntNext')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
