'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { setCustomer, shopApi, type ShopCustomer } from '../../../lib/shop-api';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/shop';

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({
    phone: '',
    password: '',
    firstName: '',
    lastName: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');

    try {
      const customer = await shopApi<ShopCustomer>(`/${mode}`, {
        method: 'POST',
        body:
          mode === 'login'
            ? { phone: form.phone.trim(), password: form.password }
            : {
                phone: form.phone.trim(),
                password: form.password,
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim() || undefined,
              },
      });

      setCustomer(customer);

      // سبد مهمان به حساب تازه منتقل نمی‌شود؛ اگر لازم شد باید سرور
      // ادغامش کند، چون فقط او هر دو سبد را می‌بیند.
      window.dispatchEvent(new Event('shop-cart-changed'));
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در ورود');
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '0 auto' }}>
      <div className="shop-card">
        <div
          style={{
            display: 'flex',
            gap: 'var(--s-2)',
            marginBottom: 'var(--s-4)',
          }}
        >
          <button
            type="button"
            className={mode === 'login' ? '' : 'ghost'}
            style={{ flex: 1 }}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            ورود
          </button>
          <button
            type="button"
            className={mode === 'register' ? '' : 'ghost'}
            style={{ flex: 1 }}
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            ثبت‌نام
          </button>
        </div>

        {error ? <div className="shop-error">{error}</div> : null}

        <form onSubmit={submit}>
          {mode === 'register' ? (
            <>
              <div className="shop-field">
                <label htmlFor="fname">نام</label>
                <input
                  id="fname"
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>

              <div className="shop-field">
                <label htmlFor="lname">نام خانوادگی</label>
                <input
                  id="lname"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
            </>
          ) : null}

          <div className="shop-field">
            <label htmlFor="phone">شمارهٔ موبایل</label>
            <input
              id="phone"
              dir="ltr"
              required
              inputMode="numeric"
              autoComplete="tel"
              placeholder="09xxxxxxxxx"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>

          <div className="shop-field">
            <label htmlFor="pass">رمز عبور</label>
            <input
              id="pass"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            {mode === 'register' ? (
              // راهنما پیش از خطا دیده می‌شود، نه پس از آن.
              <span className="shop-muted">حداقل ۶ نویسه</span>
            ) : null}
          </div>

          <button type="submit" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'لطفاً صبر کنید…' : mode === 'login' ? 'ورود' : 'ثبت‌نام'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ShopLoginPage() {
  return (
    <Suspense fallback={<div className="shop-empty">در حال بارگذاری…</div>}>
      <LoginForm />
    </Suspense>
  );
}
