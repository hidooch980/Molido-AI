'use client';

/**
 * اجزای مشترک صفحه‌ها.
 *
 * تا اینجا هر صفحه استایل جدول و دکمه و کارت آمار را از نو می‌نوشت؛ نتیجه
 * این بود که یک تغییر کوچک باید در ده جا تکرار می‌شد و کم‌کم صفحه‌ها با هم
 * فرق می‌کردند.  اینجا یک بار تعریف می‌شوند.
 */

import type React from 'react';

/** دکمه و ورودی روی تبلت لمس می‌شوند؛ کمتر از ۴۴ پیکسل قابل اتکا نیست. */
export const TOUCH: React.CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: '10px 16px',
};

export const TH: React.CSSProperties = { padding: 8, textAlign: 'right' };
export const TD: React.CSSProperties = { padding: 8 };

/** ستون عددی: هم‌ترازی ارقام، خواندن جدول‌های مالی را بسیار آسان‌تر می‌کند. */
export const NUM: React.CSSProperties = {
  padding: 8,
  fontVariantNumeric: 'tabular-nums',
};

export const ROW: React.CSSProperties = { borderTop: '1px solid var(--border)' };

/**
 * رنگ وضعیت — یک زبان رنگی واحد در کل برنامه:
 * سبز = تمام‌شده و سالم، کهربایی = در جریان یا نیازمند اقدام،
 * قرمز = متوقف یا خطا، فیروزه‌ای = مرحلهٔ میانی.
 */
export function statusColor(status: string): string {
  switch (status) {
    case 'PAID':
    case 'RECEIVED':
    case 'CLEARED':
    case 'APPROVED':
    case 'DELIVERED':
    case 'POSTED':
      return 'var(--success)';
    case 'PENDING':
    case 'ORDERED':
    case 'PARTIAL':
      return 'var(--warning)';
    case 'CANCELLED':
    case 'REJECTED':
    case 'BOUNCED':
    case 'REVERSED':
      return 'var(--danger)';
    case 'DRAFT':
      return 'var(--text-dim)';
    default:
      return 'var(--accent)';
  }
}

export function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <div
      className="stat-card"
      style={accent ? { borderTop: `3px solid ${accent}` } : undefined}
    >
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  t,
}: {
  tabs: ReadonlyArray<{ key: T; label: string }>;
  active: T;
  onChange: (key: T) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="lang-pills" style={{ margin: '18px 0' }}>
      {tabs.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`lang-pill${active === item.key ? ' active' : ''}`}
          onClick={() => onChange(item.key)}
        >
          {t(item.label)}
        </button>
      ))}
    </div>
  );
}

/**
 * جدول با حالت خالی و حالت بارگذاری.
 *
 * حالت خالی جداگانه گرفته می‌شود چون یک جدول با سرستون و بدون سطر، برای
 * کاربر شبیه «خطا» دیده می‌شود نه «هنوز داده‌ای نیست».
 */
export function DataTable({
  headers,
  empty,
  loading,
  loadingLabel,
  rows,
  children,
}: {
  headers: string[];
  empty: string;
  loading?: boolean;
  loadingLabel?: string;
  rows: number;
  children: React.ReactNode;
}) {
  if (loading) return <p className="muted">{loadingLabel ?? '…'}</p>;
  if (rows === 0) return <p className="muted">{empty}</p>;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr style={{ color: 'var(--text-dim)' }}>
            {headers.map((header) => (
              <th key={header} style={TH}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
