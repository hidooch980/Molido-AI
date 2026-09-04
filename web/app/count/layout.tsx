import type { Metadata } from 'next';

import './count.css';

export const metadata: Metadata = {
  title: 'شمارش انبار — Molido',
  // انباردار گوشی را در انبار دستش می‌گیرد؛ صفحه نباید با هر ضربه
  // بزرگ‌نمایی شود.  ولی `user-scalable=no` هم نمی‌گذاریم — کسی که
  // چشمش ضعیف است باید بتواند بزرگ کند.
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    viewportFit: 'cover',
  },
};

/**
 * پوستهٔ اپ شمارش انبار.
 *
 * ⚠️ عمداً `AppShell` نیست.
 *
 *    پوستهٔ اصلی نوار کناری، فهرست همهٔ ماژول‌ها، انتخاب زبان و
 *    اعلان‌ها دارد.  انباردار وسط قفسه‌ها هیچ‌کدام را نمی‌خواهد — و هر
 *    چیزی که در دسترس باشد، روزی به‌اشتباه لمس می‌شود.
 *
 *    این پوسته یک کار دارد و راهی به بیرون از آن ندارد جز دکمهٔ
 *    برگشتِ خودش.
 */
export default function CountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="cnt">{children}</div>;
}
