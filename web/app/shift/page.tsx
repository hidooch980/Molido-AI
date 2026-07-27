'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { api, API_URL, getToken } from '../../lib/api';

type Report = {
  from: string;
  to: string;
  totalInvoices: number;
  totalRevenue: number;
  totalDiscount: number;
  totalTax: number;
  byMethod: Record<string, { count: number; amount: number }>;
  returnsCount: number;
  refundedAmount: number;
  expectedCash: number;
  cashBoxes: Array<{ id: string; name: string; balance: string | number }>;
};

const METHOD_FA: Record<string, string> = {
  CASH: '💵 نقدی',
  CARD: '💳 کارت‌خوان',
  BANK_TRANSFER: '🏦 انتقال بانکی',
  CHEQUE: '📃 چک',
  ONLINE: '🌐 آنلاین',
  WALLET: '👛 کیف پول',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * بستن صندوق (گزارش Z) — تسویه پایان شیفت.
 *
 * مبلغ نقدی باید با شمارش فیزیکی صندوق بخواند؛ مبالغ کارتی از طریق
 * بانک تسویه می‌شوند و در شمارش نقدی نمی‌آیند.
 */
export default function ShiftPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [countedCash, setCountedCash] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fa = (v: unknown) => Number(v ?? 0).toLocaleString('fa-IR');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      // تا انتهای روز پایانی
      const q = `?from=${from}T00:00:00&to=${to}T23:59:59`;

      setReport(await api<Report>(`/reports/shift-close${q}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت گزارش');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const diff =
    report && countedCash !== ''
      ? Number(countedCash) - report.expectedCash
      : null;

  function exportCsv() {
    const token = getToken();

    // دانلود CSV با توکن در آدرس ممکن نیست؛ از fetch و Blob استفاده می‌کنیم.
    void fetch(`${API_URL}/reports/sales/export?from=${from}&to=${to}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;
        a.download = `sales-${from}_${to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setError('خطا در دریافت فایل CSV'));
  }

  return (
    <AppShell title="بستن صندوق" subtitle="گزارش شیفت و تسویه پایان روز">
      {error ? <div className="error">{error}</div> : null}

      <div className="card pos-settings">
        <label>
          <span className="muted">از تاریخ</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <span className="muted">تا تاریخ</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label>
          <span className="muted">&nbsp;</span>
          <button type="button" className="btn-sm" onClick={() => void load()}>
            {loading ? 'در حال محاسبه…' : '🔄 به‌روزرسانی'}
          </button>
        </label>
        <label>
          <span className="muted">&nbsp;</span>
          <button type="button" className="btn-sm" onClick={exportCsv}>
            ⬇️ خروجی CSV
          </button>
        </label>
      </div>

      {report ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-icon">🧾</span>
              <span className="stat-label">تعداد فاکتور</span>
              <span className="stat-value">{fa(report.totalInvoices)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon">💰</span>
              <span className="stat-label">جمع فروش</span>
              <span className="stat-value">{fa(report.totalRevenue)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon">🏷️</span>
              <span className="stat-label">جمع تخفیف</span>
              <span className="stat-value">{fa(report.totalDiscount)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon">↩️</span>
              <span className="stat-label">مرجوعی</span>
              <span className="stat-value">{fa(report.returnsCount)}</span>
            </div>
          </div>

          <div className="pos-layout">
            <div className="card">
              <h3>💳 تفکیک روش پرداخت</h3>

              {Object.keys(report.byMethod).length === 0 ? (
                <p className="muted empty">پرداختی در این بازه ثبت نشده است.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>روش</th>
                        <th>تعداد</th>
                        <th>مبلغ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(report.byMethod).map(([m, v]) => (
                        <tr key={m}>
                          <td>{METHOD_FA[m] ?? m}</td>
                          <td>{fa(v.count)}</td>
                          <td>
                            <strong>{fa(v.amount)}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 style={{ marginTop: 20 }}>🏦 موجودی صندوق‌ها</h3>
              <div className="table-wrap">
                <table>
                  <tbody>
                    {report.cashBoxes.map((b) => (
                      <tr key={b.id}>
                        <td>{b.name}</td>
                        <td>
                          <strong>{fa(b.balance)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ---------- تسویه نقدی ---------- */}
            <div className="card pay-card">
              <h3>🧮 تسویه نقدی</h3>

              <div className="sum-row">
                <span>فروش نقدی</span>
                <span>{fa(report.byMethod.CASH?.amount ?? 0)}</span>
              </div>
              <div className="sum-row">
                <span>بازپرداخت مرجوعی</span>
                <span>−{fa(report.refundedAmount)}</span>
              </div>
              <div className="sum-row total">
                <span>باید در صندوق باشد</span>
                <span>{fa(report.expectedCash)}</span>
              </div>

              <label className="recv">
                <span className="muted">شمارش فیزیکی صندوق</span>
                <input
                  type="number"
                  min={0}
                  value={countedCash}
                  placeholder={String(report.expectedCash)}
                  onChange={(e) =>
                    setCountedCash(
                      e.target.value === '' ? '' : Number(e.target.value),
                    )
                  }
                />
              </label>

              {diff !== null ? (
                <div className={diff === 0 ? 'change' : 'change on'}>
                  <span>{diff === 0 ? 'تراز است ✅' : diff > 0 ? 'اضافه صندوق' : 'کسری صندوق'}</span>
                  <strong>{fa(Math.abs(diff))}</strong>
                </div>
              ) : null}

              <button type="button" className="pay-btn" onClick={() => window.print()}>
                🖨️ چاپ گزارش شیفت
              </button>
            </div>
          </div>

          {/* ---------- نسخه چاپی ---------- */}
          <div className="receipt" id="receipt">
            <h2>گزارش بستن صندوق</h2>
            <p>
              {new Date(report.from).toLocaleDateString('fa-IR')} تا{' '}
              {new Date(report.to).toLocaleDateString('fa-IR')}
            </p>
            <hr />
            <div className="r-line">
              <span>تعداد فاکتور</span>
              <span>{fa(report.totalInvoices)}</span>
            </div>
            <div className="r-line">
              <span>جمع فروش</span>
              <span>{fa(report.totalRevenue)}</span>
            </div>
            <div className="r-line">
              <span>تخفیف</span>
              <span>{fa(report.totalDiscount)}</span>
            </div>
            <div className="r-line">
              <span>مالیات</span>
              <span>{fa(report.totalTax)}</span>
            </div>
            <hr />
            {Object.entries(report.byMethod).map(([m, v]) => (
              <div className="r-line" key={m}>
                <span>{(METHOD_FA[m] ?? m).replace(/^\S+\s/, '')}</span>
                <span>{fa(v.amount)}</span>
              </div>
            ))}
            <hr />
            <div className="r-line r-total">
              <span>باید در صندوق باشد</span>
              <span>{fa(report.expectedCash)}</span>
            </div>
            {countedCash !== '' ? (
              <>
                <div className="r-line">
                  <span>شمارش شد</span>
                  <span>{fa(countedCash)}</span>
                </div>
                <div className="r-line r-total">
                  <span>{diff && diff < 0 ? 'کسری' : 'اضافه'}</span>
                  <span>{fa(Math.abs(diff ?? 0))}</span>
                </div>
              </>
            ) : null}
            <hr />
            <p className="r-thanks">امضا صندوق‌دار: ____________</p>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
