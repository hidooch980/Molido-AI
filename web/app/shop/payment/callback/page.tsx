'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { Icon } from '../../../../components/icons';
import { shopApi } from '../../../../lib/shop-api';

type VerifyResult = {
  ok: boolean;
  orderNo?: string;
  trackingCode?: string | null;
  alreadyPaid?: boolean;
};

/**
 * بازگشت از درگاه بانکی.
 *
 * ⚠️ این صفحه نتیجهٔ درگاه را **باور نمی‌کند**.
 *
 *    درگاه در آدرس چیزی مثل `Status=OK` می‌فرستد، ولی آن را هر کسی
 *    می‌تواند تایپ کند.  تنها چیزی که اینجا خوانده می‌شود `orderId`
 *    است؛ خودِ تأیید را سرور از درگاه می‌پرسد و مبلغ را هم تطبیق
 *    می‌دهد.
 *
 * ⚠️ تأیید **یک بار** فرستاده می‌شود.
 *
 *    در حالت توسعهٔ React، افکت دو بار اجرا می‌شود.  بدونِ نگهبان، دو
 *    درخواستِ هم‌زمان می‌رفت و دومی می‌توانست روی سفارشی بیفتد که
 *    اولی تازه پرداخت‌شده کرده — و پیامِ گیج‌کننده بدهد.
 */
function PaymentCallback() {
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get('orderId');

  const [state, setState] = useState<'checking' | 'ok' | 'fail'>('checking');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const sent = useRef(false);

  const verify = useCallback(async () => {
    if (!orderId) {
      setState('fail');
      setMessage('شناسهٔ سفارش در نشانی بازگشت نبود');
      return;
    }

    try {
      const data = await shopApi<VerifyResult>(
        `/orders/${orderId}/verify-payment`,
        { method: 'POST' },
      );
      setResult(data);
      setState('ok');
    } catch (err) {
      setState('fail');
      setMessage(
        err instanceof Error ? err.message : 'تأیید پرداخت انجام نشد',
      );
    }
  }, [orderId]);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void verify();
  }, [verify]);

  if (state === 'checking') {
    return (
      <div className="shop-empty">
        <Icon name="clock" size={40} />
        <h2>در حال بررسی پرداخت…</h2>
        {/* ⚠️ هشدارِ صریح لازم است: کاربری که صفحه را ببندد ممکن است
            پرداختش تأیید نشده بماند و پول تا تسویهٔ بانک برنگردد. */}
        <p className="shop-muted">این صفحه را نبندید.</p>
      </div>
    );
  }

  if (state === 'ok' && result) {
    return (
      <div className="shop-empty">
        <Icon name="check" size={40} />
        <h2>{result.alreadyPaid ? 'این سفارش قبلاً پرداخت شده' : 'پرداخت موفق'}</h2>

        {result.orderNo ? (
          <p className="shop-muted">شمارهٔ سفارش: {result.orderNo}</p>
        ) : null}

        {/* کدِ پیگیری تنها چیزی است که مشتری هنگام اختلاف به بانک
            نشان می‌دهد — پس باید دیده و کپی شود، نه پنهان بماند. */}
        {result.trackingCode ? (
          <p className="shop-muted">
            کد پیگیری:{' '}
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
              {result.trackingCode}
            </span>
          </p>
        ) : null}

        <button
          type="button"
          className="btn"
          onClick={() => router.replace(`/shop/orders/${orderId}`)}
        >
          مشاهدهٔ سفارش
        </button>
      </div>
    );
  }

  return (
    <div className="shop-empty">
      <Icon name="alert" size={40} />
      <h2>پرداخت تأیید نشد</h2>
      <p className="shop-muted">{message}</p>

      {/* ⚠️ راهِ تلاشِ دوباره باید باشد.
          شکستِ تأیید همیشه یعنی پول نرفته نیست؛ گاهی شبکه قطع شده و
          تلاشِ دوباره همان پرداخت را تأیید می‌کند. */}
      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          type="button"
          className="btn"
          onClick={() => {
            sent.current = false;
            setState('checking');
            void verify();
          }}
        >
          تلاش دوباره
        </button>

        {orderId ? (
          <Link
            href={`/shop/orders/${orderId}`}
            className="btn ghost"
            style={{ textDecoration: 'none' }}
          >
            مشاهدهٔ سفارش
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * ⚠️ `useSearchParams` مرزِ Suspense می‌خواهد.
 *
 *    بدونِ آن، Next نمی‌تواند صفحه را از پیش بسازد و ساخت می‌شکند —
 *    خودِ ساخت گرفتش، نه اجرا.  مرز اینجاست نه بالاتر، تا فقط همین
 *    بخش منتظر بماند.
 */
export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="shop-empty">
          <Icon name="clock" size={40} />
          <h2>در حال بررسی پرداخت…</h2>
          <p className="shop-muted">این صفحه را نبندید.</p>
        </div>
      }
    >
      <PaymentCallback />
    </Suspense>
  );
}
