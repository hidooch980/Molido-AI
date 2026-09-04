'use client';

import { useEffect, useRef, useState } from 'react';

import { api } from '../../../lib/api';
import { drawQr } from '../../../lib/qr';
import { useI18n } from '../../../lib/i18n-context';

type Table = {
  id: string;
  tableNo: string;
  areaName: string | null;
  capacity: number | null;
  qrToken: string | null;
};

/**
 * چاپِ QR میزها.
 *
 * ⚠️ بدونِ این صفحه، منوی دیجیتال عملاً وجود نداشت.
 *
 *    توکن فقط در پایگاه‌داده بود و هیچ راهی نبود که به روی میز برسد.
 *    قابلیتی که راهِ رسیدنش به دستِ کاربر ساخته نشده، ساخته نشده است.
 *
 * ⚠️ نشانی از `NEXT_PUBLIC_SITE_URL` می‌آید، نه از `location.origin`.
 *
 *    گارسون این صفحه را از شبکهٔ داخلی باز می‌کند — مثلاً
 *    `http://192.168.1.10:3001`.  اگر QR همان را بگیرد، مهمانی که با
 *    داده‌ی همراه اسکن می‌کند به هیچ‌جا نمی‌رسد.  و بدترین بخشش این
 *    است که روی وای‌فایِ خودِ رستوران **کار می‌کند**، پس در آزمایش
 *    درست به نظر می‌آید.
 */
export default function TableQrPage() {
  const { t } = useI18n();
  const [tables, setTables] = useState<Table[]>([]);
  const [base, setBase] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setBase(
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
        window.location.origin,
    );
    api<Table[]>('/restaurant/tables')
      .then((rows) => setTables(Array.isArray(rows) ? rows : []))
      .catch(() => setTables([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="page">
      <div className="no-print" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, marginBottom: 6 }}>{t('tableQrTitle')}</h1>
        <p style={{ opacity: 0.7, fontSize: 13, marginBottom: 10 }}>
          {t('tableQrHint')}
        </p>
        <button type="button" className="btn" onClick={() => window.print()}>
          {t('print')}
        </button>
      </div>

      {loading ? <p>{t('loading')}</p> : null}
      {!loading && tables.length === 0 ? <p>{t('noTables')}</p> : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))',
          gap: 16,
        }}
      >
        {tables.map((table) => (
          <TableCard key={table.id} table={table} base={base} t={t} />
        ))}
      </div>

      <style jsx global>{`
        @media print {
          .no-print,
          nav,
          header,
          aside {
            display: none !important;
          }
          /* ⚠️ کارتِ نصفه‌شده بینِ دو صفحه، QR ناخوانا می‌سازد. */
          .qr-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </main>
  );
}

function TableCard({
  table,
  base,
  t,
}: {
  table: Table;
  base: string;
  t: (key: string) => string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const url = table.qrToken ? `${base}/menu/${table.qrToken}` : '';

  useEffect(() => {
    if (ref.current && url) void drawQr(ref.current, url);
  }, [url]);

  return (
    <div
      className="qr-card"
      style={{
        border: '1px solid rgba(128,128,128,.35)',
        borderRadius: 12,
        padding: 14,
        textAlign: 'center',
        background: '#fff',
        color: '#111',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 17 }}>
        {t('table')} {table.tableNo}
      </div>
      {table.areaName ? (
        <div style={{ fontSize: 12, opacity: 0.65 }}>{table.areaName}</div>
      ) : null}

      {url ? (
        <canvas ref={ref} width={190} height={190} style={{ marginTop: 8 }} />
      ) : (
        // ⚠️ میزِ بی‌توکن باید **دیده** شود، نه اینکه کارتِ خالی چاپ شود.
        <p style={{ marginTop: 20, fontSize: 12, color: '#b00' }}>
          {t('tableQrMissing')}
        </p>
      )}

      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>
        {t('scanForMenu')}
      </div>
    </div>
  );
}
