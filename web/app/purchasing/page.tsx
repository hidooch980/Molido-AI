'use client';

/**
 * منشی خرید — استعلام قیمت از بنکدارها.
 *
 * سه صفحه در یک صفحه، به ترتیبی که کار واقعی انجام می‌شود:
 *   ۱. چه چیزی کم داریم؟   → فهرست کم‌موجود، انتخاب اقلام
 *   ۲. به کی زنگ بزنیم؟    → فهرست تماس با سابقهٔ هر بنکدار
 *   ۳. از کی بخریم؟        → مقایسه و صدور فاکتور
 *
 * جدا کردنشان به سه صفحه، کاربر را مجبور می‌کرد شمارهٔ استعلام را
 * به خاطر بسپارد و بین صفحه‌ها برود — کاری که وسط تماس تلفنی
 * نشدنی است.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { StatCard, TOUCH } from '../../components/ui';
import { api } from '../../lib/api';
import { isSpeechSupported, listenOnce } from '../../lib/speech';
import { suggestQuotes, type QuoteSuggestion } from '../../lib/price-speech';
import { amountOnly } from '../../lib/money';

const fa = (value: unknown) => amountOnly(value);

type Score = {
  supplierId: string;
  supplierName: string;
  phone: string | null;
  calls: number;
  answered: number;
  quoteCount: number;
  wins: number;
  answerRate: number | null;
  winRate: number | null;
  avgGapPct: number | null;
  avgLeadDays: number | null;
  days: number;
};

type Suggestion = {
  productId: string;
  productName: string;
  unit: string | null;
  lastPrice: string | null;
  onHand: string;
  minStock: string;
  suggestQty: string;
};

type Inquiry = {
  id: string;
  inquiryNo: string;
  title: string | null;
  status: string;
  itemCount: string;
  callCount: string;
  quotedCount: string;
  createdAt: string;
};

type InquiryItem = {
  productId: string;
  productName: string;
  unit: string | null;
  qty: string;
  lastPrice: string | null;
};

type CallRow = {
  id: string;
  name: string;
  phone: string | null;
  knownProducts: string;
  lastPurchase: string | null;
  call: { id: string; status: string; channel: string } | null;
};

type Winner = {
  productId: string;
  productName: string;
  qty: number;
  quote: { supplierId: string; supplierName: string; unitPrice: number } | null;
  quoteCount: number;
  changePercent: number | null;
  shortBy: number;
  reason: string;
};

type Comparison = {
  winners: Winner[];
  summary: {
    total: number;
    covered: number;
    uncovered: number;
    supplierCount: number;
    expensive: Winner[];
  };
  bySupplier: Array<{ supplierId: string; supplierName: string; total: number }>;
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'پیش‌نویس',
  CALLING: 'در حال تماس',
  COMPARING: 'مقایسه',
  ORDERED: 'سفارش داده شد',
  CANCELLED: 'لغو شد',
};

const CALL_LABEL: Record<string, string> = {
  PENDING: 'تماس نگرفته',
  RINGING: 'در حال زنگ',
  ANSWERED: 'جواب داد',
  QUOTED: 'قیمت داد',
  NO_ANSWER: 'جواب نداد',
  REFUSED: 'قیمت نداد',
  FAILED: 'ناموفق',
};

export default function PurchasingPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [active, setActive] = useState<string>('');
  const [items, setItems] = useState<InquiryItem[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);

  const [picked, setPicked] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  // فرم ثبت قیمت — یک بنکدار در یک لحظه
  const [callSupplier, setCallSupplier] = useState('');
  const [quotes, setQuotes] = useState<Record<string, string>>({});
  const [availability, setAvailability] = useState<Record<string, string>>({});

  // ─── شنیدن قیمت از مکالمه ───
  //
  // متن مکالمه از قبل ذخیره می‌شد ولی هیچ‌کس از آن قیمت درنمی‌آورد؛
  // اپراتور باید هر عدد را دستی تایپ می‌کرد.  یعنی «کارپرداز صوتی» در
  // عمل یک فرم دستی بود.
  // کارنامهٔ بنکداران — مقایسه در طول زمان، نه در یک استعلام.
  const [scorecard, setScorecard] = useState<Score[]>([]);
  const [showScores, setShowScores] = useState(false);

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [heard, setHeard] = useState<QuoteSuggestion[]>([]);

  const load = useCallback(async () => {
    try {
      const [sug, list, scores] = await Promise.all([
        api<Suggestion[]>('/purchasing/suggestions'),
        api<Inquiry[]>('/purchasing/inquiries'),
        api<Score[]>('/purchasing/scorecard'),
      ]);
      setSuggestions(sug);
      setInquiries(list);
      setScorecard(scores);
    } catch {
      setError('بارگذاری اطلاعات خرید ناموفق بود');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openInquiry = useCallback(async (id: string) => {
    setActive(id);
    setComparison(null);
    setError('');
    try {
      const [detail, callList] = await Promise.all([
        api<{ items: InquiryItem[] }>(`/purchasing/inquiries/${id}`),
        api<CallRow[]>(`/purchasing/inquiries/${id}/call-list`),
      ]);
      setItems(detail.items);
      setCalls(callList);
      setQuotes({});
      setAvailability({});
    } catch {
      setError('بارگذاری استعلام ناموفق بود');
    }
  }, []);

  const totalPicked = useMemo(
    () => Object.values(picked).filter((q) => q > 0).length,
    [picked],
  );

  async function createInquiry() {
    const chosen = Object.entries(picked).filter(([, qty]) => qty > 0);
    if (!chosen.length) {
      setError('دست‌کم یک کالا انتخاب کنید');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const created = await api<{ id: string; inquiryNo: string }>('/purchasing/inquiries', {
        method: 'POST',
        body: { items: chosen.map(([productId, qty]) => ({ productId, qty })) },
      });
      setFlash(`استعلام ${created.inquiryNo} ساخته شد`);
      setPicked({});
      await load();
      await openInquiry(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ساخت استعلام ناموفق بود');
    } finally {
      setBusy(false);
    }
  }

  /**
   * شنیدن قیمت‌ها از مکالمه.
   *
   * اپراتور بلندگو را روشن می‌کند یا خودش تکرار می‌کند؛ عددها به
   * میدان‌ها می‌نشینند و **متن مکالمه هم ذخیره می‌شود** تا اگر روزی
   * قیمتی غلط درآمد، بشود فهمید چه شنیده شده.
   *
   * ⚠️ عددها **پیشنهاد**اند، نه ثبت.
   *
   *    قیمتی که اشتباه شنیده شود و خودکار ثبت شود، سفارش خرید را خراب
   *    می‌کند و کسی هم نمی‌فهمد چرا.  هر عدد در میدان می‌نشیند تا
   *    اپراتور ببیند و در صورت لزوم عوضش کند — و هشدارهایش کنارش
   *    نوشته می‌شود.
   */
  function listenForQuotes() {
    if (!items.length) {
      setError('اول استعلامی را باز کنید');
      return;
    }

    setError('');
    setListening(true);

    listenOnce(
      (text) => {
        setTranscript((prev) => (prev ? `${prev} ${text}` : text));

        const merged = transcript ? `${transcript} ${text}` : text;
        const found = suggestQuotes(
          merged,
          items.map((it) => ({ productId: it.productId, productName: it.productName })),
        );
        setHeard(found);

        // میدان‌ها پر می‌شوند ولی قابل ویرایش می‌مانند.
        setQuotes((prev) => {
          const next = { ...prev };
          for (const row of found) {
            if (row.rial !== null) next[row.productId] = String(row.rial);
          }
          return next;
        });
        // شنیدن یک جمله تمام شد؛ اپراتور برای جملهٔ بعدی دوباره
        // می‌زند.  حالت پیوسته میکروفن را باز نگه می‌دارد و مکالمهٔ
        // بعدی را هم می‌شنود.
        setListening(false);
      },
      (message) => {
        setListening(false);
        setError(message);
      },
    );
  }

  async function saveCall(status?: string) {
    if (!callSupplier) {
      setError('بنکدار را انتخاب کنید');
      return;
    }

    const collected = Object.entries(quotes)
      .filter(([, price]) => Number(price) > 0)
      .map(([productId, price]) => ({
        productId,
        unitPrice: Number(price),
        ...(Number(availability[productId]) > 0
          ? { availableQty: Number(availability[productId]) }
          : {}),
      }));

    setBusy(true);
    setError('');
    try {
      await api(`/purchasing/inquiries/${active}/calls`, {
        method: 'POST',
        body: {
          supplierId: callSupplier,
          ...(status ? { status } : {}),
          ...(collected.length ? { quotes: collected } : {}),
          // متن مکالمه کنار قیمت‌ها می‌ماند: اگر روزی قیمتی غلط درآمد،
          // باید بشود فهمید چه شنیده شده و از کدام مسیر آمده.
          ...(transcript.trim()
            ? { transcript: transcript.trim(), channel: 'VOIP' }
            : {}),
        },
      });
      setFlash(
        status === 'NO_ANSWER'
          ? 'ثبت شد: جواب نداد'
          : `${fa(collected.length)} قیمت ثبت شد`,
      );
      setQuotes({});
      setAvailability({});
      setCallSupplier('');
      await openInquiry(active);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ثبت تماس ناموفق بود');
    } finally {
      setBusy(false);
    }
  }

  async function compare() {
    setBusy(true);
    setError('');
    try {
      setComparison(await api<Comparison>(`/purchasing/inquiries/${active}/compare`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'مقایسه ناموفق بود');
    } finally {
      setBusy(false);
    }
  }

  async function order() {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ ordered: number; total: number }>(
        `/purchasing/inquiries/${active}/order`,
        { method: 'POST' },
      );
      setFlash(
        `${fa(result.ordered)} فاکتور خرید به مبلغ ${fa(result.total)} صادر شد` +
          ' — قیمت خرید کالاها هم به‌روز شد',
      );
      setComparison(null);
      setActive('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'صدور فاکتور ناموفق بود');
    } finally {
      setBusy(false);
    }
  }

  const cell: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 14,
  borderBottom: '1px solid var(--border)',
};

const field: React.CSSProperties = {
    ...TOUCH,
    width: '100%',
    padding: '7px 9px',
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <AppShell
      title="مریم — منشی خرید"
      subtitle="استعلام قیمت از بنکدارها، مقایسه، و صدور فاکتور خرید"
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          تازه‌سازی
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}
      {flash ? (
        <div className="card" style={{ borderColor: '#047857', color: '#047857' }}>
          {flash}
        </div>
      ) : null}

      <div className="stats-grid">
        <StatCard icon="alert" label="کالای کم‌موجود" value={fa(suggestions.length)} />
        <StatCard icon="clipboard" label="استعلام باز" value={fa(inquiries.filter((i) => !['ORDERED', 'CANCELLED'].includes(i.status)).length)} />
        <StatCard icon="check" label="سفارش‌شده" value={fa(inquiries.filter((i) => i.status === 'ORDERED').length)} />
        <StatCard icon="package" label="انتخاب‌شده" value={fa(totalPicked)} />
      </div>

      {/* ---------------------------------------- ۱) چه چیزی کم داریم */}
      {!active && (
        <div className="card">
          <h3>مریم می‌گوید این‌ها کم است</h3>
          <p className="muted">
            موجودی زیر حداقل. مقدار پیشنهادی تا دو برابر حداقل پر می‌شود — خریدی که
            دقیقاً به مرز برساند، فردا دوباره کم می‌آید.
          </p>

          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={TH}>کالا</th>
                  <th style={TH}>موجودی</th>
                  <th style={TH}>حداقل</th>
                  <th style={TH}>آخرین خرید</th>
                  <th style={{ ...TH, width: 120 }}>مقدار سفارش</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 26, textAlign: 'center', color: 'var(--muted)' }}>
                      هیچ کالایی زیر حداقل موجودی نیست
                    </td>
                  </tr>
                )}
                {suggestions.map((s) => (
                  <tr key={s.productId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={TD}>{s.productName}</td>
                    <td style={{ ...TD, color: '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>
                      {fa(s.onHand)} {s.unit}
                    </td>
                    <td style={{ ...TD, color: 'var(--muted)' }}>{fa(s.minStock)}</td>
                    <td style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>
                      {s.lastPrice ? fa(s.lastPrice) : '—'}
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input
                        type="number"
                        min="0"
                        style={field}
                        placeholder={fa(s.suggestQty)}
                        value={picked[s.productId] ?? ''}
                        onChange={(e) =>
                          setPicked((prev) => ({
                            ...prev,
                            [s.productId]: Number(e.target.value),
                          }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {suggestions.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  setPicked(
                    Object.fromEntries(
                      suggestions.map((s) => [s.productId, Number(s.suggestQty)]),
                    ),
                  )
                }
              >
                انتخاب همه با مقدار پیشنهادی
              </button>
              <button type="button" onClick={() => void createInquiry()} disabled={busy || !totalPicked}>
                ساخت استعلام برای {fa(totalPicked)} کالا
              </button>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------ کارنامهٔ بنکداران */}
      {!active && scorecard.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0 }}>کارنامهٔ بنکداران</h3>
            <span className="muted" style={{ fontSize: 13 }}>
              {fa(scorecard[0].days)} روز گذشته
            </span>
            <button
              type="button"
              className="ghost"
              style={{ marginInlineStart: 'auto' }}
              onClick={() => setShowScores((v) => !v)}
            >
              {showScores ? 'بستن' : 'نمایش'}
            </button>
          </div>

          {showScores && (
            <>
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                مقایسهٔ یک استعلام می‌گوید امروز چه کسی ارزان‌تر بود. این جدول
                می‌گوید با چه کسی باید کار کرد.
              </p>
              <div style={{ overflowX: 'auto', marginTop: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                  <thead>
                    <tr>
                      {['بنکدار', 'تماس', 'جواب داد', 'قیمت داد', 'برنده', 'فاصله از ارزان‌ترین', 'تحویل'].map(
                        (h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: 'start',
                              padding: '8px 10px',
                              fontSize: 13,
                              color: 'var(--muted)',
                              borderBottom: '1px solid var(--border)',
                            }}
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {scorecard.map((row) => (
                      <tr key={row.supplierId}>
                        <td style={cell}>
                          <strong>{row.supplierName}</strong>
                          {row.phone ? (
                            <span className="muted" style={{ fontSize: 12 }}> · {row.phone}</span>
                          ) : null}
                        </td>
                        <td style={cell}>{fa(row.calls)}</td>
                        <td style={cell}>
                          {row.answerRate === null ? '—' : `${fa(row.answerRate)}٪`}
                        </td>
                        <td style={cell}>{fa(row.quoteCount)}</td>
                        {/* «—» یعنی هنوز سفارشی ثبت نشده، نه «همیشه
                            بازنده».  دو حالت کاملاً متفاوت. */}
                        <td style={cell}>
                          {row.winRate === null
                            ? row.quoteCount > 0
                              ? 'خریدی نشده'
                              : '—'
                            : `${fa(row.winRate)}٪`}
                        </td>
                        {/* عددِ اصلیِ «گران یا ارزان»: صفر یعنی همیشه
                            ارزان‌ترین بوده.  خالی یعنی قیمتی نداده — که
                            با «صفر» یکی نیست. */}
                        <td
                          style={{
                            ...cell,
                            color:
                              row.avgGapPct === null
                                ? 'var(--muted)'
                                : row.avgGapPct <= 0
                                  ? '#047857'
                                  : row.avgGapPct > 10
                                    ? '#b91c1c'
                                    : '#b45309',
                            fontWeight: row.avgGapPct !== null && row.avgGapPct > 10 ? 700 : 400,
                          }}
                        >
                          {row.avgGapPct === null ? 'قیمتی نداد' : `${fa(row.avgGapPct)}٪`}
                        </td>
                        <td style={cell}>
                          {row.avgLeadDays === null ? '—' : `${fa(row.avgLeadDays)} روز`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------ فهرست استعلام‌ها */}
      {!active && inquiries.length > 0 && (
        <div className="card">
          <h3>استعلام‌ها</h3>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {inquiries.slice(0, 20).map((inq) => (
              <button
                key={inq.id}
                type="button"
                className="ghost"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  textAlign: 'right',
                  padding: '10px 12px',
                }}
                onClick={() => void openInquiry(inq.id)}
              >
                <span>
                  <strong>{inq.inquiryNo}</strong>
                  {inq.title ? ` — ${inq.title}` : ''}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {fa(inq.itemCount)} قلم · {fa(inq.quotedCount)} از {fa(inq.callCount)} قیمت داد ·{' '}
                  {STATUS_LABEL[inq.status] ?? inq.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------- ۲) تماس با بنکدار */}
      {active && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button type="button" className="ghost btn-sm" onClick={() => setActive('')}>
              بازگشت به فهرست
            </button>
            <button type="button" className="btn-sm" onClick={() => void compare()} disabled={busy}>
              مقایسهٔ پیشنهادها
            </button>
          </div>

          <div className="card">
            <h3>مریم زنگ زد — قیمت‌ها را ثبت کنید</h3>
            <p className="muted">
              همین فرم برای تماس دستی و ویپ یکی است. بنکداری که جواب داد ولی قیمت نداد،
              با کسی که اصلاً برنداشت فرق دارد — اولی را باید دوباره گرفت.
            </p>

            <div style={{ marginTop: 12 }}>
              <label htmlFor="supplier">بنکدار</label>
              <select
                id="supplier"
                style={field}
                value={callSupplier}
                onChange={(e) => setCallSupplier(e.target.value)}
              >
                <option value="">— انتخاب کنید —</option>
                {calls.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ''}
                    {Number(c.knownProducts) > 0 ? ` · ${c.knownProducts} کالای آشنا` : ''}
                    {c.call ? ` — ${CALL_LABEL[c.call.status] ?? c.call.status}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* ─── شنیدن قیمت از مکالمه ───
                دکمه فقط وقتی نشان داده می‌شود که مرورگر تشخیص گفتار
                داشته باشد: دکمه‌ای که کار نمی‌کند بدتر از نبودنش است. */}
            {callSupplier && isSpeechSupported() && (
              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={listenForQuotes}
                    disabled={listening}
                    style={{ minHeight: 44 }}
                  >
                    {listening ? '… در حال شنیدن' : '🎙 شنیدن قیمت‌ها'}
                  </button>
                  {transcript && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setTranscript('');
                        setHeard([]);
                      }}
                    >
                      پاک کردن متن
                    </button>
                  )}
                  <span className="muted" style={{ fontSize: 13 }}>
                    بلندگو را روشن کنید یا خودتان تکرار کنید
                  </span>
                </div>

                {transcript && (
                  <div
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      fontSize: 14,
                    }}
                  >
                    {transcript}
                  </div>
                )}

                {/* هشدارها جدا و صریح: عددی که با هشدار می‌آید همان
                    جایی است که خطای ده‌برابری رخ می‌دهد. */}
                {heard.some((h) => h.warnings.length > 0) && (
                  <div
                    role="status"
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      background: '#b4530922',
                      color: '#b45309',
                      fontSize: 13,
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    {heard
                      .filter((h) => h.warnings.length > 0)
                      .map((h) => (
                        <span key={h.productId}>
                          <strong>{h.productName}</strong>
                          {h.spoken !== null ? ` — «${h.phrase}»` : ''}
                          {': '}
                          {h.warnings.join(' · ')}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )}

            {callSupplier && (
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={TH}>کالا</th>
                      <th style={TH}>مقدار</th>
                      <th style={TH}>آخرین خرید</th>
                      <th style={{ ...TH, width: 130 }}>قیمت پیشنهادی</th>
                      <th style={{ ...TH, width: 110 }}>موجودی او</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.productId} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={TD}>{it.productName}</td>
                        <td style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>
                          {fa(it.qty)} {it.unit}
                        </td>
                        <td style={{ ...TD, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                          {it.lastPrice ? fa(it.lastPrice) : '—'}
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input
                            type="number"
                            min="0"
                            style={field}
                            value={quotes[it.productId] ?? ''}
                            onChange={(e) =>
                              setQuotes((prev) => ({ ...prev, [it.productId]: e.target.value }))
                            }
                          />
                        </td>
                        <td style={{ padding: '4px 6px' }}>
                          <input
                            type="number"
                            min="0"
                            style={field}
                            placeholder="نگفت"
                            value={availability[it.productId] ?? ''}
                            onChange={(e) =>
                              setAvailability((prev) => ({
                                ...prev,
                                [it.productId]: e.target.value,
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => void saveCall()} disabled={busy}>
                    ثبت قیمت‌ها
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void saveCall('NO_ANSWER')}
                    disabled={busy}
                  >
                    جواب نداد
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void saveCall('REFUSED')}
                    disabled={busy}
                  >
                    قیمت نداد
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ------------------------------------------- ۳) از کی بخریم */}
      {comparison && (
        <div className="card">
          <h3>پیشنهاد مریم</h3>

          <div className="stats-grid" style={{ marginTop: 12 }}>
            <StatCard icon="money" label="مبلغ کل خرید" value={fa(comparison.summary.total)} />
            <StatCard icon="check" label="قلم پوشش‌داده" value={fa(comparison.summary.covered)} />
            <StatCard
              icon="alert"
              label="بی‌پیشنهاد"
              value={fa(comparison.summary.uncovered)}
              accent={comparison.summary.uncovered > 0 ? 'var(--warning)' : undefined}
            />
            <StatCard icon="agent" label="تأمین‌کننده" value={fa(comparison.summary.supplierCount)} />
          </div>

          {comparison.summary.expensive.length > 0 && (
            <div
              className="card"
              style={{ marginTop: 12, borderColor: '#b91c1c', color: '#b91c1c' }}
            >
              {fa(comparison.summary.expensive.length)} قلم بیش از ۱۵٪ گران‌تر از خرید قبل است:{' '}
              {comparison.summary.expensive.map((w) => w.productName).join('، ')}
            </div>
          )}

          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={TH}>کالا</th>
                  <th style={TH}>مقدار</th>
                  <th style={TH}>برنده</th>
                  <th style={TH}>قیمت</th>
                  <th style={TH}>تغییر</th>
                  <th style={TH}>دلیل</th>
                </tr>
              </thead>
              <tbody>
                {comparison.winners.map((w) => (
                  <tr key={w.productId} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={TD}>{w.productName}</td>
                    <td style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>{fa(w.qty)}</td>
                    <td style={TD}>
                      {w.quote ? (
                        w.quote.supplierName
                      ) : (
                        <span style={{ color: '#b91c1c' }}>هیچ‌کس</span>
                      )}
                    </td>
                    <td style={{ ...TD, fontVariantNumeric: 'tabular-nums' }}>
                      {w.quote ? fa(w.quote.unitPrice) : '—'}
                    </td>
                    <td
                      style={{
                        ...TD,
                        fontVariantNumeric: 'tabular-nums',
                        color:
                          w.changePercent === null
                            ? 'var(--muted)'
                            : w.changePercent > 0
                              ? '#b91c1c'
                              : '#047857',
                      }}
                    >
                      {w.changePercent === null ? '—' : `${fa(w.changePercent)}٪`}
                    </td>
                    <td style={{ ...TD, color: 'var(--muted)', fontSize: 12 }}>{w.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {comparison.bySupplier.length > 0 && (
            <>
              <p className="muted" style={{ marginTop: 14 }}>
                هر تأمین‌کننده یک فاکتور خرید می‌شود:{' '}
                {comparison.bySupplier
                  .map((g) => `${g.supplierName} (${fa(g.total)})`)
                  .join(' · ')}
              </p>

              <button
                type="button"
                style={{ marginTop: 10 }}
                onClick={() => void order()}
                disabled={busy}
              >
                <Icon name="check" size={16} /> صدور {fa(comparison.bySupplier.length)} فاکتور خرید
              </button>
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}

const TH: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'right',
  fontSize: 12,
  color: 'var(--muted)',
  whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = { padding: '8px 10px' };
