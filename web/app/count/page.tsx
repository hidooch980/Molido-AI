'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

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
  const { t } = useI18n();
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
        <h1>{t('cntTitle')}</h1>
        <Link href="/stock-count" className="cnt-link">
          {t('cntFullVersion')}
        </Link>
      </header>

      <main className="cnt-body">
        {error ? (
          <p className="cnt-error" role="alert">
            {error}
          </p>
        ) : counts === null ? (
          <p className="cnt-muted">{t('cntLoading')}</p>
        ) : counts.length === 0 ? (
          <div className="cnt-empty">
            <p>{t('cntNoneOpen')}</p>
            {/* انباردار اجازهٔ باز کردن ندارد؛ گفتنِ راهِ درست بهتر از
                دکمه‌ای است که ۴۰۳ می‌دهد. */}
            <p className="cnt-muted">
              {t('cntAskSupervisor')}
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
