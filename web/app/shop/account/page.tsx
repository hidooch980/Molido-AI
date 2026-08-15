'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Icon } from '../../../components/icons';
import { drawQr } from '../../../lib/qr';
import { getCustomer, shopApi, type ShopCustomer } from '../../../lib/shop-api';

type Code = {
  code: string;
  ruleName: string;
  kind: 'PERCENT' | 'AMOUNT' | 'BUY_X_GET_Y';
  value: string | number;
  minAmount: string | number | null;
  expiresAt: string | null;
  usedCount: number;
  maxUses: number;
};

type Checkin = { token: string; expiresAt: string; ttlSeconds: number };

const fa = (value: unknown) => Number(value ?? 0).toLocaleString('fa-IR');

function describe(code: Code): string {
  const value = fa(code.value);

  if (code.kind === 'PERCENT') return `${value}٪ تخفیف`;
  if (code.kind === 'AMOUNT') return `${value} ریال تخفیف`;
  return 'هدیه با خرید';
}

/**
 * حساب مشتری: کد شناسایی و تخفیف‌های او.
 *
 * QR اینجا زندگی می‌کند چون همان لحظه‌ای لازم است که مشتری پای صندوق
 * ایستاده — یعنی باید با کمترین تعداد لمس از صفحهٔ اول قابل رسیدن باشد.
 */
export default function AccountPage() {
  const [customer, setCustomer] = useState<ShopCustomer | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const load = useCallback(async () => {
    try {
      setCodes(await shopApi<Code[]>('/my-codes'));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCustomer(getCustomer());
    void load();
  }, [load]);

  const issue = useCallback(async () => {
    try {
      const result = await shopApi<Checkin>('/checkin-token', { method: 'POST' });
      setCheckin(result);
      setRemaining(result.ttlSeconds);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ساخت کد شناسایی');
    }
  }, []);

  // شمارش معکوس: کد کوتاه‌عمر است و مشتری باید بداند کِی باید تازه‌اش کند،
  // نه اینکه پای صندوق با کد منقضی روبه‌رو شود.
  useEffect(() => {
    if (!checkin || remaining <= 0) return;

    const timer = setInterval(() => setRemaining((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [checkin, remaining]);

  useEffect(() => {
    if (checkin && canvasRef.current) {
      void drawQr(canvasRef.current, checkin.token);
    }
  }, [checkin]);

  if (!customer) {
    return (
      <div className="shop-empty">
        <Icon name="user" size={40} />
        <h2>ابتدا وارد شوید</h2>
        <p style={{ marginTop: 'var(--s-4)' }}>
          <Link href="/shop/login" className="btn">
            ورود به حساب
          </Link>
        </p>
      </div>
    );
  }

  const expired = checkin !== null && remaining <= 0;

  return (
    <>
      <h1 className="shop-section-title">حساب من</h1>
      {error ? <div className="shop-error">{error}</div> : null}

      {/* ---------- کد شناسایی ---------- */}
      <div className="shop-card" style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 17, marginBottom: 'var(--s-2)' }}>
          کد شناسایی در فروشگاه
        </h2>
        <p className="shop-muted" style={{ marginBottom: 'var(--s-4)' }}>
          این کد را به صندوق‌دار نشان دهید تا خرید به حساب شما ثبت شود و
          تخفیف‌هایتان اعمال شود.
        </p>

        {checkin ? (
          <>
            <canvas
              ref={canvasRef}
              width={220}
              height={220}
              style={{
                width: 220,
                height: 220,
                background: '#fff',
                borderRadius: 'var(--s-radius)',
                padding: 8,
              }}
              aria-label="کد شناسایی"
            />
            <div style={{ marginTop: 'var(--s-3)' }}>
              {expired ? (
                <span style={{ color: 'var(--s-danger)', fontWeight: 700 }}>
                  منقضی شد
                </span>
              ) : (
                <span className="shop-muted">
                  اعتبار تا {fa(remaining)} ثانیهٔ دیگر
                </span>
              )}
            </div>
            <button
              type="button"
              className="ghost"
              style={{ marginTop: 'var(--s-3)' }}
              onClick={() => void issue()}
            >
              <Icon name="refresh" size={18} /> کد تازه
            </button>
          </>
        ) : (
          <button type="button" onClick={() => void issue()}>
            <Icon name="user" size={18} /> نمایش کد شناسایی
          </button>
        )}
      </div>

      {/* ---------- کدهای تخفیف ---------- */}
      <h2 className="shop-section-title" style={{ marginTop: 'var(--s-6)' }}>
        تخفیف‌های من
      </h2>

      {loading ? (
        <p className="shop-muted">در حال بارگذاری…</p>
      ) : codes.length === 0 ? (
        <div className="shop-empty">
          <Icon name="tag" size={36} />
          <h2>هنوز تخفیفی ندارید</h2>
          <p className="shop-muted">
            با خرید بیشتر، کد تخفیف اختصاصی برایتان فرستاده می‌شود.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
          {codes.map((code) => (
            <div key={code.code} className="shop-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--s-3)',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>
                    {describe(code)}
                  </div>
                  <div className="shop-muted">{code.ruleName}</div>
                  {code.minAmount ? (
                    <div className="shop-muted">
                      برای خرید بالای {fa(code.minAmount)} ریال
                    </div>
                  ) : null}
                </div>

                {/* کد با فاصلهٔ حروف نوشته می‌شود: مشتری آن را برای
                    صندوق‌دار می‌خواند و حروف چسبیده اشتباه خوانده می‌شوند. */}
                <code
                  style={{
                    fontSize: 19,
                    fontWeight: 800,
                    letterSpacing: 2,
                    padding: '8px 12px',
                    borderRadius: 'var(--s-radius-sm)',
                    background: 'var(--s-primary-soft)',
                    color: 'var(--s-primary)',
                  }}
                >
                  {code.code}
                </code>
              </div>

              {code.expiresAt ? (
                <div className="shop-muted" style={{ marginTop: 'var(--s-2)' }}>
                  تا {new Date(code.expiresAt).toLocaleDateString('fa-IR')}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
