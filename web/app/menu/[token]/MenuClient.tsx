'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import type { MenuPayload } from '../../../lib/menu-server';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Lang = 'fa' | 'en' | 'ar';

const T = {
  fa: {
    table: 'میز', add: 'افزودن', cart: 'قلم در سبد', order: 'ثبت سفارش',
    empty: 'چیزی انتخاب نشده', total: 'جمع', rial: 'ریال',
    service: 'خدمات', tax: 'مالیات', sending: 'در حال ثبت…',
    note: 'توضیح (اختیاری)', phone: 'شماره تماس (اختیاری)',
    ok: 'سفارش شما ثبت شد', code: 'کد پیگیری',
    waiting: 'پس از تأیید گارسون به آشپزخانه می‌رود.',
    viewOnly: 'برای سفارش، لطفاً گارسون را صدا کنید.',
    spicy: 'تند', vegan: 'گیاهی', kcal: 'کالری', min: 'دقیقه',
    failed: 'ثبت سفارش انجام نشد',
  },
  en: {
    table: 'Table', add: 'Add', cart: 'in cart', order: 'Place order',
    empty: 'Nothing selected', total: 'Total', rial: 'IRR',
    service: 'Service', tax: 'Tax', sending: 'Sending…',
    note: 'Note (optional)', phone: 'Phone (optional)',
    ok: 'Your order is placed', code: 'Tracking code',
    waiting: 'It goes to the kitchen after staff approval.',
    viewOnly: 'To order, please call a member of staff.',
    spicy: 'Spicy', vegan: 'Vegan', kcal: 'kcal', min: 'min',
    failed: 'Could not place the order',
  },
  ar: {
    table: 'طاولة', add: 'إضافة', cart: 'في السلة', order: 'تأكيد الطلب',
    empty: 'لم يتم الاختيار', total: 'الإجمالي', rial: 'ريال',
    service: 'الخدمة', tax: 'الضريبة', sending: 'جارٍ الإرسال…',
    note: 'ملاحظة (اختياري)', phone: 'رقم الهاتف (اختياري)',
    ok: 'تم تسجيل طلبك', code: 'رمز التتبع',
    waiting: 'يُرسل إلى المطبخ بعد موافقة النادل.',
    viewOnly: 'للطلب، يرجى مناداة أحد العاملين.',
    spicy: 'حار', vegan: 'نباتي', kcal: 'سعرة', min: 'دقيقة',
    failed: 'تعذّر تسجيل الطلب',
  },
} as const;

/**
 * ⚠️ ارقام با محلی‌سازیِ خودِ زبان نوشته می‌شوند.
 *
 *    عددِ لاتین در متنِ فارسی همان‌قدر بیگانه است که عددِ فارسی در
 *    متنِ انگلیسی.  منو چیزی است که مهمان چند دقیقه به آن خیره
 *    می‌شود؛ این جزئیات دیده می‌شود.
 */
const money = (value: number, lang: Lang) =>
  Number(value ?? 0).toLocaleString(
    lang === 'fa' ? 'fa-IR' : lang === 'ar' ? 'ar-EG' : 'en-US',
  );

function pick(
  item: { name: string; nameEn: string | null; nameAr: string | null },
  lang: Lang,
) {
  // ⚠️ عقب‌گرد به فارسی، نه رشتهٔ خالی: نامِ نداشته بدتر از نامِ
  //    به زبانِ دیگر است.
  if (lang === 'en') return item.nameEn || item.name;
  if (lang === 'ar') return item.nameAr || item.name;
  return item.name;
}

export default function MenuClient({
  menu,
  token,
}: {
  menu: MenuPayload;
  token: string;
}) {
  const [lang, setLang] = useState<Lang>('fa');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ code: string; total: number } | null>(null);
  const [error, setError] = useState('');

  const t = T[lang];
  const rtl = lang !== 'en';

  const items = useMemo(
    () => menu.categories.flatMap((category) => category.items),
    [menu],
  );

  /**
   * ⚠️ این جمع فقط **برای نمایش** است.
   *
   *    مبلغِ واقعی را سرور دوباره از پایگاه‌داده حساب می‌کند.  اگر کسی
   *    این عدد را در مرورگرش دستکاری کند، تنها چیزی که عوض می‌شود
   *    عددی است که خودش می‌بیند.
   */
  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (cart[item.id] ?? 0) * Number(item.price ?? 0),
        0,
      ),
    [cart, items],
  );

  const service = Math.round((subtotal * menu.servicePercent) / 100);
  const tax = Math.round(((subtotal + service) * menu.taxPercent) / 100);
  const total = subtotal + service + tax;
  const count = Object.values(cart).reduce((sum, n) => sum + n, 0);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `${API}/menu/${encodeURIComponent(token)}/order`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // فقط شناسه و تعداد — قیمت را سرور می‌داند.
            items: Object.entries(cart)
              .filter(([, qty]) => qty > 0)
              .map(([menuItemId, qty]) => ({ menuItemId, qty })),
            note: note || undefined,
            phone: phone || undefined,
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        guestCode?: string;
        total?: number;
      };
      if (!response.ok) {
        setError(String(data?.message ?? t.failed));
        return;
      }
      setDone({ code: data.guestCode ?? '', total: Number(data.total ?? 0) });
      setCart({});
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main dir={rtl ? 'rtl' : 'ltr'} style={S.done}>
        <div style={{ fontSize: 54 }}>✓</div>
        <h1 style={{ fontSize: 22, margin: '10px 0' }}>{t.ok}</h1>
        <p style={{ opacity: 0.75, fontSize: 14, marginBottom: 18 }}>{t.waiting}</p>
        <div style={S.codeBox}>
          <span style={{ opacity: 0.7, fontSize: 13 }}>{t.code}</span>
          <b style={{ fontFamily: 'ui-monospace, monospace', fontSize: 18 }}>
            {done.code}
          </b>
        </div>
        <div style={{ marginTop: 14, fontSize: 15 }}>
          {t.total}: <b>{money(done.total, lang)}</b> {t.rial}
        </div>
      </main>
    );
  }

  return (
    <main dir={rtl ? 'rtl' : 'ltr'} style={S.page}>
      <header style={S.header}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {t.table} {menu.table.tableNo}
          </div>
          {menu.welcomeText ? (
            <div style={{ fontSize: 15, fontWeight: 600 }}>{menu.welcomeText}</div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['fa', 'en', 'ar'] as Lang[]).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLang(code)}
              style={{ ...S.lang, ...(lang === code ? S.langOn : null) }}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      {menu.categories.map((category) => (
        <section key={category.id ?? 'misc'} style={{ padding: '4px 14px 18px' }}>
          <h2 style={S.catTitle}>
            {category.icon ? <span aria-hidden>{category.icon} </span> : null}
            {pick(
              {
                name: category.name,
                nameEn: category.nameEn,
                nameAr: category.nameAr,
              },
              lang,
            )}
          </h2>

          {category.items.map((item) => (
            <article key={item.id} style={S.card}>
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" style={S.thumb} loading="lazy" />
              ) : (
                <div style={{ ...S.thumb, ...S.thumbEmpty }} aria-hidden>
                  🍽️
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{pick(item, lang)}</div>
                {item.description ? <p style={S.desc}>{item.description}</p> : null}
                <div style={S.tags}>
                  {item.isSpicy ? <span style={S.tag}>🌶 {t.spicy}</span> : null}
                  {item.isVegan ? <span style={S.tag}>🌱 {t.vegan}</span> : null}
                  {item.calories ? (
                    <span style={S.tag}>
                      {money(item.calories, lang)} {t.kcal}
                    </span>
                  ) : null}
                  {item.prepMinutes ? (
                    <span style={S.tag}>
                      ⏱ {money(item.prepMinutes, lang)} {t.min}
                    </span>
                  ) : null}
                </div>
                <div style={{ marginTop: 6, fontWeight: 700 }}>
                  {money(item.price, lang)}{' '}
                  <small style={{ fontWeight: 400, opacity: 0.7 }}>{t.rial}</small>
                </div>
              </div>

              {menu.canOrder ? (
                <div style={S.stepper}>
                  <button
                    type="button"
                    aria-label="+"
                    style={S.step}
                    onClick={() =>
                      setCart((c) => ({
                        ...c,
                        [item.id]: Math.min(50, (c[item.id] ?? 0) + 1),
                      }))
                    }
                  >
                    +
                  </button>
                  {cart[item.id] ? (
                    <>
                      <span style={{ minWidth: 20, textAlign: 'center' }}>
                        {money(cart[item.id], lang)}
                      </span>
                      <button
                        type="button"
                        aria-label="-"
                        style={S.step}
                        onClick={() =>
                          setCart((c) => {
                            const next = { ...c };
                            const value = (next[item.id] ?? 0) - 1;
                            if (value <= 0) delete next[item.id];
                            else next[item.id] = value;
                            return next;
                          })
                        }
                      >
                        −
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ))}

      {!menu.canOrder ? (
        <p style={S.viewOnly}>{t.viewOnly}</p>
      ) : (
        <div style={S.bar}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}
          >
            <span>{count ? `${money(count, lang)} ${t.cart}` : t.empty}</span>
            <span>
              <b>{money(total, lang)}</b> {t.rial}
            </span>
          </div>

          {count > 0 && (menu.servicePercent > 0 || menu.taxPercent > 0) ? (
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
              {menu.servicePercent > 0
                ? `${t.service} ${money(service, lang)} · `
                : ''}
              {menu.taxPercent > 0 ? `${t.tax} ${money(tax, lang)}` : ''}
            </div>
          ) : null}

          {count > 0 ? (
            <>
              <input
                style={S.input}
                placeholder={t.note}
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
              />
              <input
                style={S.input}
                placeholder={t.phone}
                value={phone}
                inputMode="numeric"
                maxLength={15}
                onChange={(event) => setPhone(event.target.value)}
              />
            </>
          ) : null}

          {error ? <div style={S.error}>{error}</div> : null}

          <button
            type="button"
            disabled={!count || busy}
            onClick={submit}
            style={{ ...S.cta, opacity: !count || busy ? 0.5 : 1 }}
          >
            {busy ? t.sending : t.order}
          </button>
        </div>
      )}
    </main>
  );
}

/* ─── سبک‌ها ───
   ⚠️ درون‌خطی و بدونِ وابستگی: این صفحه روی داده‌ی همراهِ کند باز
      می‌شود و هر فایلِ اضافی یک رفت‌وبرگشتِ بیشتر است. */
const S: Record<string, CSSProperties> = {
  page: {
    minHeight: '100dvh',
    paddingBottom: 210,
    background: '#0b0d12',
    color: '#e8eaf0',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 2,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    padding: '12px 14px',
    background: 'rgba(10,12,18,.86)',
    backdropFilter: 'blur(10px)',
    borderBottom: '1px solid rgba(255,255,255,.08)',
  },
  lang: {
    border: '1px solid rgba(255,255,255,.15)',
    background: 'transparent',
    color: 'inherit',
    borderRadius: 8,
    padding: '4px 8px',
    fontSize: 11,
    cursor: 'pointer',
  },
  langOn: { background: 'rgba(255,255,255,.14)' },
  catTitle: { fontSize: 15, opacity: 0.85, margin: '14px 0 8px' },
  card: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    padding: 12,
    marginBottom: 10,
    borderRadius: 14,
    background: 'rgba(255,255,255,.04)',
    border: '1px solid rgba(255,255,255,.07)',
  },
  thumb: { width: 74, height: 74, borderRadius: 12, objectFit: 'cover', flexShrink: 0 },
  thumbEmpty: {
    display: 'grid',
    placeItems: 'center',
    fontSize: 26,
    background: 'rgba(255,255,255,.05)',
  },
  desc: { fontSize: 12, opacity: 0.7, margin: '4px 0 0', lineHeight: 1.6 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: {
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 99,
    background: 'rgba(255,255,255,.07)',
  },
  stepper: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  step: {
    width: 32,
    height: 32,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,.16)',
    background: 'rgba(255,255,255,.06)',
    color: 'inherit',
    fontSize: 17,
    cursor: 'pointer',
  },
  bar: {
    position: 'fixed',
    insetInline: 0,
    bottom: 0,
    padding: 14,
    background: 'rgba(10,12,18,.95)',
    backdropFilter: 'blur(12px)',
    borderTop: '1px solid rgba(255,255,255,.1)',
  },
  input: {
    width: '100%',
    marginTop: 8,
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,.14)',
    background: 'rgba(255,255,255,.05)',
    color: 'inherit',
    fontSize: 14,
    fontFamily: 'inherit',
  },
  cta: {
    width: '100%',
    marginTop: 10,
    padding: '13px 16px',
    borderRadius: 12,
    border: 0,
    background: 'linear-gradient(135deg,#4f7cff,#8b5cf6)',
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  error: {
    marginTop: 8,
    fontSize: 13,
    color: '#ff8a8a',
    background: 'rgba(255,80,80,.1)',
    border: '1px solid rgba(255,80,80,.25)',
    borderRadius: 10,
    padding: '8px 10px',
  },
  viewOnly: {
    textAlign: 'center',
    opacity: 0.7,
    fontSize: 13,
    padding: '0 20px 30px',
  },
  done: {
    minHeight: '100dvh',
    display: 'grid',
    placeContent: 'center',
    textAlign: 'center',
    padding: 24,
    background: '#0b0d12',
    color: '#e8eaf0',
  },
  codeBox: {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: 4,
    padding: '10px 18px',
    borderRadius: 12,
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.1)',
  },
};
