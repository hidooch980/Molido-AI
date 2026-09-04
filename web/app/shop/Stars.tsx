/**
 * نمایشِ امتیاز با ستاره.
 *
 * ⚠️ عدد **کنارِ** ستاره‌ها می‌آید، نه به‌جایشان.
 *
 *    ستاره در یک نگاه خوانده می‌شود و عدد دقیق است؛ هر کدام تنها،
 *    چیزی کم دارد.  و برای کاربرِ صفحه‌خوان، تنها چیزی که معنا دارد
 *    همان متن است — ستاره‌ها `aria-hidden` می‌مانند.
 */
export default function Stars({
  value,
  count,
  size = 15,
}: {
  /** میانگین ۱ تا ۵؛ تهی یعنی هنوز نظری نیست. */
  value: number | null;
  count?: number;
  size?: number;
}) {
  // ⚠️ «بدونِ نظر» با «صفر» یکی نیست.
  //
  //    صفر یعنی همه بد گفته‌اند.  نبودِ نظر یعنی هنوز کسی نگفته — و
  //    نشان دادنِ پنج ستارهٔ خالی، پیامِ اول را می‌رساند.
  if (value === null || value === undefined) {
    return <span className="shop-muted" style={{ fontSize: 12 }}>بدون نظر</span>;
  }

  const rounded = Math.round(value * 2) / 2;

  return (
    <span
      className="stars"
      // متنِ کامل برای صفحه‌خوان؛ ستاره‌ها خودشان چیزی نمی‌گویند.
      aria-label={`${value.toLocaleString('fa-IR')} از ۵${
        count ? `، ${count.toLocaleString('fa-IR')} نظر` : ''
      }`}
    >
      <span aria-hidden="true" style={{ display: 'inline-flex', gap: 1 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <svg
            key={n}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill={rounded >= n ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          >
            <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9L12 3Z" />
          </svg>
        ))}
      </span>

      <span style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
        {value.toLocaleString('fa-IR')}
        {count ? (
          <span className="shop-muted"> ({count.toLocaleString('fa-IR')})</span>
        ) : null}
      </span>
    </span>
  );
}
