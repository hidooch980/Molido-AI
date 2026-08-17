'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../../lib/api';

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
  const params = useParams<{ id: string }>();
  const countId = params.id;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState<Line | null>(null);
  const [entry, setEntry] = useState('');
  const [saving, setSaving] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [flash, setFlash] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<Detail>(`/stock-count/${countId}`)
      .then(setDetail)
      .catch((e) => setError(e?.message || 'خطا در دریافت انبارگردانی'));
  }, [countId]);

  useEffect(load, [load]);

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
      // ⚠️ شکستِ ثبت نباید بی‌صدا بماند.
      //
      //    وای‌فای انبار قطع و وصل می‌شود.  اگر ثبت نشود و چیزی
      //    نگوییم، انباردار قلم بعدی را می‌رود و آخر کار عددی گم شده
      //    که هیچ‌کس نمی‌داند کدام بود.
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
        <Link href="/count" className="cnt-back" aria-label="بازگشت به فهرست">
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
                  <span className="cnt-line-todo">شمرده نشده</span>
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
            aria-label="بستن"
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
              مقدار سیستم پس از ثبت نشان داده می‌شود
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
              بعدی
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
