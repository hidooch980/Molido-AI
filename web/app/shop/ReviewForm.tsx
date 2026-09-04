'use client';

import { useState } from 'react';

import { shopApi } from '../../lib/shop-api';
import { getCustomer } from '../../lib/shop-api';

/**
 * ثبتِ نظر برای یک کالا.
 *
 * ⚠️ فرم به کاربرِ واردنشده هم نشان داده می‌شود، ولی به ورود می‌برد.
 *
 *    پنهان کردنش یعنی کاربر اصلاً نمی‌فهمد نظر دادن ممکن است.  دیدنِ
 *    فرم و بعد ورود، از ندیدنِ چیزی بهتر است.
 *
 * ⚠️ سرور نظر را تأییدنشده ذخیره می‌کند، پس پیامِ موفقیت باید همین را
 *    بگوید.  «نظرتان ثبت شد» بدونِ توضیح، کاربر را منتظرِ دیدنِ فوریِ
 *    آن می‌گذارد و نبودش را اشکال می‌پندارد.
 */
export default function ReviewForm({ productId }: { productId: string }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');

  async function submit() {
    if (!getCustomer()) {
      window.location.href = `/shop/login?next=/shop/product/${productId}`;
      return;
    }

    if (rating < 1) {
      setError('امتیاز را انتخاب کنید');
      return;
    }

    setState('busy');
    setError('');
    try {
      await shopApi(`/products/${productId}/reviews`, {
        method: 'POST',
        body: { rating, comment: comment.trim() || undefined },
      });
      setState('done');
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : 'ثبت نظر انجام نشد');
    }
  }

  if (state === 'done') {
    return (
      <div className="review-done" role="status">
        نظر شما ثبت شد و پس از بررسی نمایش داده می‌شود.
      </div>
    );
  }

  const shown = hover || rating;

  return (
    <div className="review-form">
      <div className="review-form-title">نظر شما</div>

      {/* ⚠️ رادیو، نه دکمه: صفحه‌خوان باید بفهمد این یک انتخابِ
          پنج‌گزینه‌ای است، و کیبورد باید با فلش بینشان حرکت کند. */}
      <fieldset
        className="star-pick"
        onMouseLeave={() => setHover(0)}
      >
        <legend className="sr-only">امتیاز از ۱ تا ۵</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className={shown >= n ? 'on' : undefined}
            onMouseEnter={() => setHover(n)}
            title={`${n.toLocaleString('fa-IR')} از ۵`}
          >
            <input
              type="radio"
              name="rating"
              value={n}
              checked={rating === n}
              onChange={() => setRating(n)}
            />
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill={shown >= n ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3Z" />
            </svg>
            <span className="sr-only">{n} ستاره</span>
          </label>
        ))}
      </fieldset>

      <textarea
        rows={3}
        maxLength={2000}
        placeholder="تجربه‌تان از این کالا (اختیاری)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />

      {error ? <div className="shop-error">{error}</div> : null}

      <button
        type="button"
        className="btn"
        disabled={state === 'busy'}
        onClick={() => void submit()}
      >
        {state === 'busy' ? 'در حال ثبت…' : 'ثبت نظر'}
      </button>
    </div>
  );
}
