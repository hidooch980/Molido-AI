'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '../../lib/api';

type Count = {
  id: string;
  countNo: string;
  status: string;
  warehouseName: string | null;
  lineCount: string | number;
  createdAt: string;
};

const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

/** انبارگردانیِ باز — تنها چیزی که انباردار می‌تواند رویش کار کند. */
const isOpen = (c: Count) => c.status === 'OPEN' || c.status === 'DRAFT';

export default function CountListPage() {
  const [counts, setCounts] = useState<Count[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Count[]>('/stock-count')
      .then((rows) => setCounts(rows.filter(isOpen)))
      .catch((e) => setError(e?.message || 'خطا در دریافت فهرست'));
  }, []);

  return (
    <>
      <header className="cnt-top">
        <h1>شمارش انبار</h1>
        <Link href="/stock-count" className="cnt-link">
          نسخهٔ کامل
        </Link>
      </header>

      <main className="cnt-body">
        {error ? (
          <p className="cnt-error" role="alert">
            {error}
          </p>
        ) : counts === null ? (
          <p className="cnt-muted">در حال دریافت…</p>
        ) : counts.length === 0 ? (
          <div className="cnt-empty">
            <p>انبارگردانی بازی نیست.</p>
            {/* انباردار اجازهٔ باز کردن ندارد؛ گفتنِ راهِ درست بهتر از
                دکمه‌ای است که ۴۰۳ می‌دهد. */}
            <p className="cnt-muted">
              سرپرست باید از بخش «انبارگردانی» یکی را باز کند.
            </p>
          </div>
        ) : (
          <ul className="cnt-list">
            {counts.map((c) => (
              <li key={c.id}>
                <Link href={`/count/${c.id}`} className="cnt-card">
                  <span className="cnt-no">{c.countNo}</span>
                  <span className="cnt-wh">{c.warehouseName ?? '—'}</span>
                  <span className="cnt-meta">{fa(c.lineCount)} قلم</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
