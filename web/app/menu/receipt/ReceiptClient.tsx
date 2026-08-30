'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type Status = {
  orderNo?: string;
  status?: string;
  total?: number;
  paidAmount?: number;
  bankRef?: string | null;
};

const fa = (value: unknown) => Number(value ?? 0).toLocaleString('fa-IR');

/**
 * ⚠️ این صفحه **تصمیم نمی‌گیرد** که پرداخت موفق بوده یا نه.
 *
 *    پارامترِ `paid` را سرور در نشانی گذاشته، و سرور آن را پس از
 *    تأییدِ کانالِ پشتی با درگاه ساخته.  ولی چون نشانی در دستِ کاربر
 *    است، نمایش به همان بسنده نمی‌کند: وضعیتِ واقعی دوباره از API
 *    خوانده می‌شود.
 *
 *    یعنی کسی که `paid=ok` را دستی در نوارِ نشانی بنویسد، فقط یک
 *    لحظه چیزی می‌بیند و بعد وضعیتِ درست جایش را می‌گیرد.
 *
 *    همان درسِ صفحهٔ نتیجهٔ سایتِ معرفی.
 */
export default function ReceiptClient() {
  const [state, setState] = useState<{
    icon: string;
    title: string;
    body: string;
    tone: string;
  }>({
    icon: '⏳',
    title: 'در حال بررسی…',
    body: 'لطفاً چند لحظه صبر کنید.',
    tone: 'inherit',
  });
  const [info, setInfo] = useState<Status | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const guestCode = params.get('code') ?? '';
    setCode(guestCode);

    // نمایشِ موقت بر پایهٔ پارامتر — تا پاسخِ واقعی برسد.
    if (params.get('paid') === 'failed') {
      setState({
        icon: '✕',
        title: 'پرداخت انجام نشد',
        body: params.get('reason') || 'تراکنش تأیید نشد.',
        tone: '#ff8a8a',
      });
    }

    if (!guestCode) {
      setState({
        icon: '✕',
        title: 'کد پیگیری نیست',
        body: 'نشانی ناقص است. از گارسون کمک بگیرید.',
        tone: '#ff8a8a',
      });
      return;
    }

    fetch(`${API}/menu/order/${encodeURIComponent(guestCode)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Status | null) => {
        if (!data) {
          setState({
            icon: '✕',
            title: 'سفارش پیدا نشد',
            body: 'کد پیگیری نامعتبر است.',
            tone: '#ff8a8a',
          });
          return;
        }
        setInfo(data);

        // ⚠️ ملاک `paidAmount` است، نه `status`.
        //
        //    سفارشِ سرِ میز تا لحظهٔ تسویه `OPEN` می‌ماند حتی وقتی
        //    پیش‌پرداخت شده — چون میز هنوز اشغال است.  نگاه کردن به
        //    `status` یعنی مهمانی که همین حالا پرداخت کرده، «پرداخت
        //    نشده» ببیند.
        if (Number(data.paidAmount ?? 0) >= Number(data.total ?? 0) && Number(data.total ?? 0) > 0) {
          setState({
            icon: '✓',
            title: 'پرداخت با موفقیت انجام شد',
            body: 'سفارش شما به آشپزخانه ارسال می‌شود.',
            tone: '#7ee787',
          });
        } else {
          setState({
            icon: '✕',
            title: 'پرداخت انجام نشد',
            body: 'اگر مبلغی کسر شده، طی ۷۲ ساعت به حسابتان برمی‌گردد.',
            tone: '#ff8a8a',
          });
        }
      })
      .catch(() => {
        setState({
          icon: '⚠',
          title: 'وضعیت خوانده نشد',
          body: 'ارتباط با سرور برقرار نشد. کد پیگیری را به گارسون بدهید.',
          tone: '#f0c674',
        });
      });
  }, []);

  return (
    <main dir="rtl" style={S.page}>
      <div style={{ fontSize: 54 }}>{state.icon}</div>
      <h1 style={{ fontSize: 22, margin: '10px 0' }}>{state.title}</h1>
      <p style={{ fontSize: 14, marginBottom: 18, color: state.tone }}>{state.body}</p>

      {code ? (
        <div style={S.box}>
          <Row label="کد پیگیری" value={code} mono />
          {info?.orderNo ? <Row label="شماره سفارش" value={info.orderNo} mono /> : null}
          {info?.bankRef ? <Row label="پیگیری بانک" value={info.bankRef} mono /> : null}
          {info?.total ? <Row label="مبلغ" value={`${fa(info.total)} ریال`} /> : null}
        </div>
      ) : null}
    </main>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={S.row}>
      <span style={{ opacity: 0.65 }}>{label}</span>
      <b style={mono ? { fontFamily: 'ui-monospace, monospace' } : undefined}>{value}</b>
    </div>
  );
}

const S: Record<string, CSSProperties> = {
  page: {
    minHeight: '100dvh',
    display: 'grid',
    placeContent: 'center',
    textAlign: 'center',
    padding: 24,
    background: '#0b0d12',
    color: '#e8eaf0',
  },
  box: {
    display: 'grid',
    gap: 2,
    minWidth: 260,
    padding: '12px 18px',
    borderRadius: 12,
    background: 'rgba(255,255,255,.06)',
    border: '1px solid rgba(255,255,255,.1)',
    textAlign: 'start',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 14,
    padding: '7px 0',
    fontSize: 14,
  },
};
