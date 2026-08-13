'use client';

import { useState } from 'react';

import { Icon } from '../../components/icons';
import { shopApi } from '../../lib/shop-api';

/**
 * تنها بخشِ تعاملی کارت کالا.
 *
 * جدا نگه داشتنش اجازه می‌دهد خودِ کاتالوگ کامپوننت سرور بماند و در HTML
 * اولیه بیاید — که برای فروشگاه، هم برای موتور جستجو مهم است هم برای
 * اولین نمایش روی اتصال کند.
 */
export default function AddToCart({
  productId,
  disabled,
  qty = 1,
  label = 'افزودن',
  full,
}: {
  productId: string;
  disabled?: boolean;
  qty?: number;
  label?: string;
  full?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function add() {
    setBusy(true);
    try {
      await shopApi('/cart/items', {
        method: 'POST',
        body: { productId, qty },
      });

      window.dispatchEvent(new Event('shop-cart-changed'));
      setDone(true);
      setError('');

      // تأیید کوتاه، بعد بازگشت به حالت عادی: کاربر باید بتواند دوباره
      // بیفزاید بدون آنکه صفحه را عوض کند.
      window.setTimeout(() => setDone(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در افزودن');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => void add()}
        style={full ? { width: '100%' } : undefined}
      >
        {done ? (
          <>
            <Icon name="check" size={16} /> افزوده شد
          </>
        ) : busy ? (
          'در حال افزودن…'
        ) : (
          <>
            <Icon name="plus" size={16} /> {label}
          </>
        )}
      </button>

      {error ? (
        <span style={{ color: 'var(--s-danger)', fontSize: 13 }}>{error}</span>
      ) : null}
    </>
  );
}
