'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { Icon } from '../../components/icons';
import {
  clearCustomer,
  getCustomer,
  shopApi,
  type ShopCustomer,
} from '../../lib/shop-api';

type CartResponse = { items?: Array<{ qty: string | number }> };

function HeaderInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [customer, setCustomerState] = useState<ShopCustomer | null>(null);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState(params.get('search') ?? '');

  const loadCart = useCallback(async () => {
    try {
      const cart = await shopApi<CartResponse>('/cart');
      setCount((cart.items ?? []).length);
    } catch {
      // سبد نباید سربرگ را بشکند؛ اگر نیامد، صفر می‌ماند.
      setCount(0);
    }
  }, []);

  useEffect(() => {
    setCustomerState(getCustomer());
    void loadCart();

    // سبد از صفحه‌های دیگر هم عوض می‌شود؛ رویداد سفارشی ساده‌تر از
    // بالا بردن حالت به یک Context برای یک عدد است.
    const refresh = () => void loadCart();
    window.addEventListener('shop-cart-changed', refresh);

    return () => window.removeEventListener('shop-cart-changed', refresh);
  }, [loadCart]);

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    const value = search.trim();
    router.push(value ? `/shop?search=${encodeURIComponent(value)}` : '/shop');
  }

  function logout() {
    clearCustomer();
    setCustomerState(null);
    router.push('/shop');
  }

  return (
    <header className="shop-header">
      <div className="shop-header-inner">
        <Link href="/shop" className="shop-logo">
          Molido
        </Link>

        <form className="shop-search" onSubmit={submitSearch} role="search">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجوی کالا…"
            aria-label="جستجوی کالا"
          />
          <button type="submit" aria-label="جستجو">
            <Icon name="search" size={18} />
          </button>
        </form>

        <Link
          href="/shop/cart"
          className="btn ghost cart-badge"
          aria-label={`سبد خرید (${count} قلم)`}
        >
          <Icon name="package" size={18} />
          {count > 0 ? <span className="cart-count">{count}</span> : null}
        </Link>

        {customer ? (
          <>
            <Link href="/shop/orders" className="btn ghost">
              <Icon name="receipt" size={18} />
              <span className="desktop-only">سفارش‌ها</span>
            </Link>
            <button type="button" className="ghost" onClick={logout}>
              <Icon name="logout" size={18} />
            </button>
          </>
        ) : (
          <Link href="/shop/login" className="btn">
            ورود
          </Link>
        )}
      </div>
    </header>
  );
}

export default function ShopHeader() {
  // `useSearchParams` نیاز به مرز Suspense دارد، وگرنه کل صفحه در ساخت
  // ایستا به رندر سمت کلاینت می‌افتد.
  return (
    <Suspense fallback={<header className="shop-header" />}>
      <HeaderInner />
    </Suspense>
  );
}
