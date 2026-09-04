'use client';

import { useCallback, useEffect, useState } from 'react';

import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n-context';

type Stats = {
  saleReturns?: string | number;
  purchaseReturns?: string | number;
  saleReturnValue?: string | number;
  cashRefunded?: string | number;
};

type ReturnRow = {
  id: string;
  returnNo: string;
  type: string;
  status: string;
  totalAmount: string | number;
  refundMethod: string | null;
  invoiceNo?: string | null;
  purchaseNo?: string | null;
  customerName?: string | null;
  createdAt: string;
};

type SaleItem = {
  id: string;
  productId: string;
  quantity: string | number;
  returnedQty: string | number;
  price: string | number;
  product?: { name?: string } | null;
  productName?: string | null;
};

type Sale = {
  id: string;
  invoiceNo: string;
  items?: SaleItem[];
};

type CashBox = { id: string; name: string; balance: string | number };

type PurchaseItem = {
  id: string;
  productId: string;
  quantity: string | number;
  returnedQty: string | number;
  purchasePrice: string | number;
  product?: { name?: string } | null;
  productName?: string | null;
};

type Purchase = {
  id: string;
  purchaseNo: string;
  items?: PurchaseItem[];
};

const MODES = ['sale', 'purchase'] as const;

type Mode = (typeof MODES)[number];

const TOUCH: React.CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: '10px 16px',
};

const REASONS = ['DEFECT', 'WRONG_ITEM', 'EXPIRED', 'OTHER'] as const;
const REFUNDS = ['CASH', 'CARD', 'CREDIT', 'NONE'] as const;

export default function ReturnsPage() {
  const { t, locale } = useI18n();

  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [boxes, setBoxes] = useState<CashBox[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // فرم مرجوعی
  const [invoiceNo, setInvoiceNo] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [refundMethod, setRefundMethod] =
    useState<(typeof REFUNDS)[number]>('CASH');
  const [cashBoxId, setCashBoxId] = useState('');
  const [reason, setReason] = useState<(typeof REASONS)[number]>('DEFECT');

  // برگشت از خرید: کالا از انبار خارج می‌شود و بدهی تأمین‌کننده تسویه
  // می‌گردد؛ روش عودت و صندوق در این حالت بی‌معنا هستند.
  const [mode, setMode] = useState<Mode>('sale');
  const [purchaseNo, setPurchaseNo] = useState('');
  const [purchase, setPurchase] = useState<Purchase | null>(null);

  const fa = useCallback(
    (value: unknown) => Number(value ?? 0).toLocaleString(locale),
    [locale],
  );

  const load = useCallback(async () => {
    try {
      const [s, list, cb] = await Promise.all([
        api<Stats>('/returns/stats'),
        api<ReturnRow[]>('/returns'),
        api<CashBox[]>('/cashbox'),
      ]);

      setStats(s);
      setRows(Array.isArray(list) ? list : []);

      const cashBoxes = Array.isArray(cb) ? cb : [];
      setBoxes(cashBoxes);
      setCashBoxId((current) => current || cashBoxes[0]?.id || '');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** فاکتور را با شمارهٔ آن پیدا می‌کند تا صندوق‌دار نیازی به شناسه نداشته باشد. */
  async function findInvoice() {
    const needle = invoiceNo.trim();
    if (!needle) return;

    setBusy(true);
    try {
      const list = await api<Sale[]>(
        `/sales?search=${encodeURIComponent(needle)}`,
      );
      const found = (Array.isArray(list) ? list : []).find(
        (item) => item.invoiceNo === needle,
      );

      if (!found) {
        setSale(null);
        setError(t('invoiceNotFound'));
        return;
      }

      const detail = await api<Sale>(`/sales/${found.id}`);
      const returnable = (detail.items ?? []).filter(
        (item) => Number(item.quantity) - Number(item.returnedQty ?? 0) > 0,
      );

      if (!returnable.length) {
        setSale(null);
        setError(t('nothingReturnable'));
        return;
      }

      setSale({ ...detail, items: returnable });
      setQty({});
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setBusy(false);
    }
  }

  /** سند خرید را با شماره پیدا می‌کند — همان الگوی جستجوی فاکتور. */
  async function findPurchase() {
    const needle = purchaseNo.trim();
    if (!needle) return;

    setBusy(true);
    try {
      const list = await api<Purchase[]>('/purchases');
      const found = (Array.isArray(list) ? list : []).find(
        (item) => item.purchaseNo === needle,
      );

      if (!found) {
        setPurchase(null);
        setError(t('purchaseNotFound'));
        return;
      }

      const detail = await api<Purchase>(`/purchases/${found.id}`);
      const returnable = (detail.items ?? []).filter(
        (item) => Number(item.quantity) - Number(item.returnedQty ?? 0) > 0,
      );

      if (!returnable.length) {
        setPurchase(null);
        setError(t('nothingReturnablePurchase'));
        return;
      }

      setPurchase({ ...detail, items: returnable });
      setQty({});
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fetchError'));
    } finally {
      setBusy(false);
    }
  }

  async function submitPurchase() {
    if (!purchase) return;

    const items = Object.entries(qty)
      .map(([sourceItemId, value]) => ({ sourceItemId, qty: Number(value) }))
      .filter((line) => Number.isFinite(line.qty) && line.qty > 0);

    if (!items.length) return;

    setBusy(true);
    try {
      await api('/returns/purchase', {
        method: 'POST',
        body: { purchaseId: purchase.id, items, reason },
      });

      setPurchase(null);
      setPurchaseNo('');
      setQty({});
      await load();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!sale) return;

    const items = Object.entries(qty)
      .map(([sourceItemId, value]) => ({
        sourceItemId,
        qty: Number(value),
      }))
      .filter((line) => Number.isFinite(line.qty) && line.qty > 0);

    if (!items.length) return;

    setBusy(true);
    try {
      await api('/returns/sale', {
        method: 'POST',
        body: {
          saleId: sale.id,
          items,
          refundMethod,
          // صندوق فقط برای عودت نقدی معنا دارد؛ در بقیهٔ روش‌ها فرستادنش
          // سرور را وادار به کسر بی‌مورد از صندوق می‌کند.
          cashBoxId: refundMethod === 'CASH' ? cashBoxId : undefined,
          reason,
        },
      });

      setSale(null);
      setInvoiceNo('');
      setQty({});
      await load();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('actionError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      title={t('returnsTitle')}
      subtitle={t('returnsSubtitle')}
      actions={
        <button type="button" className="btn-sm" onClick={() => void load()}>
          {t('refresh')}
        </button>
      }
    >
      {error ? <div className="error">{error}</div> : null}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon"><Icon name="return" size={22} /></div>
          <div className="stat-label">{t('statSaleReturns')}</div>
          <div className="stat-value">{fa(stats?.saleReturns)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Icon name="return" size={22} /></div>
          <div className="stat-label">{t('statPurchaseReturns')}</div>
          <div className="stat-value">{fa(stats?.purchaseReturns)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"><Icon name="money" size={22} /></div>
          <div className="stat-label">{t('statReturnValue')}</div>
          <div className="stat-value">{fa(stats?.saleReturnValue)}</div>
        </div>
        <div className="stat-card" style={{ borderTop: '3px solid var(--warning)' }}>
          <div className="stat-icon"><Icon name="money" size={22} /></div>
          <div className="stat-label">{t('statCashRefunded')}</div>
          <div className="stat-value">{fa(stats?.cashRefunded)}</div>
        </div>
      </div>

      {/* ثبت مرجوعی جدید */}
      <div className="card" style={{ margin: '18px 0' }}>
        <div className="lang-pills" style={{ marginBottom: 14 }}>
          {MODES.map((item) => (
            <button
              key={item}
              type="button"
              className={`lang-pill${mode === item ? ' active' : ''}`}
              onClick={() => {
                setMode(item);
                // پاک کردن سند طرف دیگر تا هر دو فرم هم‌زمان باز نمانند.
                setSale(null);
                setPurchase(null);
                setQty({});
                setError('');
              }}
            >
              {t(item === 'sale' ? 'tabSaleReturn' : 'tabPurchaseReturn')}
            </button>
          ))}
        </div>

        <h3 style={{ marginBottom: 12 }}>
          {t(mode === 'sale' ? 'newSaleReturn' : 'newPurchaseReturn')}
        </h3>

        {mode === 'sale' ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            value={invoiceNo}
            onChange={(e) => setInvoiceNo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void findInvoice();
            }}
            placeholder={t('pickInvoice')}
            style={{ ...TOUCH, flex: 1, minWidth: 220 }}
          />
          <button
            type="button"
            style={TOUCH}
            disabled={busy}
            onClick={() => void findInvoice()}
          >
            {t('search')}
          </button>
        </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={purchaseNo}
              onChange={(e) => setPurchaseNo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void findPurchase();
              }}
              placeholder={t('pickPurchase')}
              style={{ ...TOUCH, flex: 1, minWidth: 220 }}
            />
            <button
              type="button"
              style={TOUCH}
              disabled={busy}
              onClick={() => void findPurchase()}
            >
              {t('search')}
            </button>
          </div>
        )}

        {/* اقلام سند خرید */}
        {purchase ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 10, fontWeight: 700 }}>
              {purchase.purchaseNo}
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                    <th style={{ padding: 8 }}>{t('colProduct')}</th>
                    <th style={{ padding: 8 }}>{t('returnableLeft')}</th>
                    <th style={{ padding: 8 }}>{t('purchasePrice')}</th>
                    <th style={{ padding: 8 }}>{t('returnQtyPrompt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(purchase.items ?? []).map((item) => {
                    const left =
                      Number(item.quantity) - Number(item.returnedQty ?? 0);

                    return (
                      <tr
                        key={item.id}
                        style={{ borderTop: '1px solid var(--border)' }}
                      >
                        <td style={{ padding: 8 }}>
                          {item.product?.name ?? item.productName ?? '—'}
                        </td>
                        <td style={{ padding: 8, color: 'var(--success)' }}>
                          {fa(left)}
                        </td>
                        <td style={{ padding: 8 }}>{fa(item.purchasePrice)}</td>
                        <td style={{ padding: 8 }}>
                          <input
                            type="number"
                            min={0}
                            max={left}
                            step="any"
                            value={qty[item.id] ?? ''}
                            onChange={(e) =>
                              setQty((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            style={{ ...TOUCH, width: 110 }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                marginTop: 14,
                alignItems: 'center',
              }}
            >
              <select
                value={reason}
                onChange={(e) =>
                  setReason(e.target.value as (typeof REASONS)[number])
                }
                style={{ ...TOUCH, minWidth: 160 }}
              >
                {REASONS.map((item) => (
                  <option key={item} value={item}>
                    {t(`reason${item}`)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                style={TOUCH}
                disabled={busy}
                onClick={() => void submitPurchase()}
              >
                {t('confirmReturn')}
              </button>
            </div>
          </div>
        ) : null}

        {sale ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 10, fontWeight: 700 }}>
              {sale.invoiceNo}
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                    <th style={{ padding: 8 }}>{t('colProduct')}</th>
                    <th style={{ padding: 8 }}>{t('returnableLeft')}</th>
                    <th style={{ padding: 8 }}>{t('colUnitPrice')}</th>
                    <th style={{ padding: 8 }}>{t('returnQtyPrompt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(sale.items ?? []).map((item) => {
                    const left =
                      Number(item.quantity) - Number(item.returnedQty ?? 0);

                    return (
                      <tr
                        key={item.id}
                        style={{ borderTop: '1px solid var(--border)' }}
                      >
                        <td style={{ padding: 8 }}>
                          {item.product?.name ?? item.productName ?? '—'}
                        </td>
                        <td style={{ padding: 8, color: 'var(--success)' }}>
                          {fa(left)}
                        </td>
                        <td style={{ padding: 8 }}>{fa(item.price)}</td>
                        <td style={{ padding: 8 }}>
                          <input
                            type="number"
                            min={0}
                            max={left}
                            step="any"
                            value={qty[item.id] ?? ''}
                            onChange={(e) =>
                              setQty((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            style={{ ...TOUCH, width: 110 }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                marginTop: 14,
                alignItems: 'center',
              }}
            >
              <select
                value={refundMethod}
                onChange={(e) =>
                  setRefundMethod(e.target.value as (typeof REFUNDS)[number])
                }
                style={{ ...TOUCH, minWidth: 180 }}
              >
                {REFUNDS.map((method) => (
                  <option key={method} value={method}>
                    {t(`refund${method}`)}
                  </option>
                ))}
              </select>

              {refundMethod === 'CASH' ? (
                <select
                  value={cashBoxId}
                  onChange={(e) => setCashBoxId(e.target.value)}
                  style={{ ...TOUCH, minWidth: 180 }}
                >
                  {boxes.map((box) => (
                    <option key={box.id} value={box.id}>
                      {box.name} — {fa(box.balance)}
                    </option>
                  ))}
                </select>
              ) : null}

              <select
                value={reason}
                onChange={(e) =>
                  setReason(e.target.value as (typeof REASONS)[number])
                }
                style={{ ...TOUCH, minWidth: 160 }}
              >
                {REASONS.map((item) => (
                  <option key={item} value={item}>
                    {t(`reason${item}`)}
                  </option>
                ))}
              </select>

              <button
                type="button"
                style={TOUCH}
                disabled={busy}
                onClick={() => void submit()}
              >
                {t('confirmReturn')}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* تاریخچه */}
      <div className="card">
        {loading ? (
          <p className="muted">{t('loading')}</p>
        ) : rows.length === 0 ? (
          <p className="muted">{t('noReturns')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr style={{ textAlign: 'right', color: 'var(--text-dim)' }}>
                  <th style={{ padding: 8 }}>{t('returnNo')}</th>
                  <th style={{ padding: 8 }}>{t('returnType')}</th>
                  <th style={{ padding: 8 }}>{t('source')}</th>
                  <th style={{ padding: 8 }}>{t('customer')}</th>
                  <th style={{ padding: 8 }}>{t('colAmount')}</th>
                  <th style={{ padding: 8 }}>{t('refundMethod')}</th>
                  <th style={{ padding: 8 }}>{t('date')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: 8 }}>{row.returnNo}</td>
                    <td
                      style={{
                        padding: 8,
                        color:
                          row.type === 'SALE'
                            ? 'var(--warning)'
                            : 'var(--accent)',
                      }}
                    >
                      {t(`type${row.type}`)}
                    </td>
                    <td style={{ padding: 8 }}>
                      {row.invoiceNo ?? row.purchaseNo ?? '—'}
                    </td>
                    <td style={{ padding: 8 }}>{row.customerName ?? '—'}</td>
                    <td style={{ padding: 8 }}>{fa(row.totalAmount)}</td>
                    <td style={{ padding: 8 }}>
                      {row.refundMethod ? t(`refund${row.refundMethod}`) : '—'}
                    </td>
                    <td style={{ padding: 8 }} className="muted">
                      {new Date(row.createdAt).toLocaleDateString(locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
