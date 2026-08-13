'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { useI18n } from '../../lib/i18n-context';
import { api } from '../../lib/api';
import { printReceipt } from '../../lib/receipt';
import { amountOnly, currentCurrency, loadCurrency, money } from '../../lib/money';

type Warehouse = { id: string; name: string };
type CashBox = { id: string; name: string; code: string };

type Shift = {
  id: string;
  cashBoxId: string;
  warehouseId: string | null;
  openingCash: string | number;
  salesCount: number;
  salesTotal: string | number;
  cashTotal: string | number;
  cardTotal: string | number;
};

type ScanResult = {
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    isWeighed: boolean;
  };
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  available: number | null;
  source: 'BARCODE' | 'SCALE' | 'SKU';
};

type CartLine = {
  key: string;
  productId: string;
  name: string;
  unit: string;
  isWeighed: boolean;
  price: number;
  quantity: number;
};

type RationAccount = {
  id: string;
  nationalCode: string;
  holderName: string | null;
  balance: string | number;
};

type Eligibility = {
  eligibleTotal: number;
  lines: Array<{ productId: string; name: string; lineTotal: number }>;
  excludedProductIds: string[];
};

type Sale = {
  id: string;
  invoiceNo: string;
  subtotal: string | number;
  discount: string | number;
  tax: string | number;
  total: string | number;
  createdAt: string;
};

/** فقط عدد — برای جدول سبد که ستون‌هایش تنگ است. */
const fa = (value: unknown) => amountOnly(value);

/** مقدار وزنی تا سه رقم اعشار نمایش داده می‌شود، تعداد بدون اعشار. */
const qty = (line: CartLine) =>
  line.isWeighed ? line.quantity.toFixed(3) : String(line.quantity);

/**
 * صندوق فروش (POS)
 *
 * ورودی اصلی، اسکنر بارکد است: اسکنرهای فروشگاهی مثل صفحه‌کلید تایپ می‌کنند و
 * در پایان Enter می‌زنند، بنابراین یک input همیشه‌فوکوس تمام کاری است که لازم
 * است.  برچسب ترازو، بارکد کالا و SKU همگی از همین یک مسیر می‌آیند و تفکیک را
 * بک‌اند انجام می‌دهد.
 */
export default function PosPage() {
  const { t } = useI18n();
  const [shift, setShift] = useState<Shift | null>(null);
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [cashAmount, setCashAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');

  const [ration, setRation] = useState<RationAccount | null>(null);
  const [rationCode, setRationCode] = useState('');
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  const scanRef = useRef<HTMLInputElement>(null);

  // ---------- بارگذاری ----------

  const loadShift = useCallback(async () => {
    try {
      const current = await api<Shift | null>('/retail/shifts/current');
      setShift(current);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shiftError'));
    }
  }, []);

  useEffect(() => {
    void loadCurrency();
    void loadShift();

    void (async () => {
      try {
        const [boxes, whs] = await Promise.all([
          api<CashBox[]>('/cashbox'),
          api<Warehouse[]>('/warehouses'),
        ]);
        setCashBoxes(Array.isArray(boxes) ? boxes : []);
        setWarehouses(Array.isArray(whs) ? whs : []);
      } catch {
        // بدون این‌ها هم می‌توان شیفت باز را ادامه داد
      }
    })();
  }, [loadShift]);

  // اسکنر باید همیشه فوکوس داشته باشد تا صندوق‌دار دست به ماوس نبرد
  const refocus = useCallback(() => scanRef.current?.focus(), []);

  useEffect(() => {
    if (shift) refocus();
  }, [shift, refocus]);

  // ---------- سبد ----------

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [cart],
  );

  const payable = Math.max(0, total - discount);

  // کالابرگ محدود است به: سقف اقلام مشمول، مانده اعتبار، و مبلغ فاکتور
  const rationShare = ration && eligibility
    ? Math.min(eligibility.eligibleTotal, Number(ration.balance), payable)
    : 0;

  const dueAfterRation = Math.max(0, payable - rationShare);
  const paid = Number(cashAmount || 0) + Number(cardAmount || 0);
  const change = paid - dueAfterRation;

  function addLine(result: ScanResult) {
    setCart((prev) => {
      // کالای وزنی هر بار یک سطر جداست؛ وزن هر بسته متفاوت است.
      if (!result.product.isWeighed) {
        const found = prev.find((line) => line.productId === result.product.id);
        if (found) {
          return prev.map((line) =>
            line.key === found.key
              ? { ...line, quantity: line.quantity + result.quantity }
              : line,
          );
        }
      }

      return [
        ...prev,
        {
          key: `${result.product.id}-${Date.now()}-${prev.length}`,
          productId: result.product.id,
          name: result.product.name,
          unit: result.product.unit,
          isWeighed: result.product.isWeighed,
          price: result.unitPrice,
          quantity: result.quantity,
        },
      ];
    });
  }

  async function onScan(event: React.FormEvent) {
    event.preventDefault();

    const input = code.trim();
    if (!input || !shift) return;

    setCode('');
    setError('');

    try {
      const params = new URLSearchParams({ code: input });
      if (shift.warehouseId) params.set('warehouseId', shift.warehouseId);

      const result = await api<ScanResult>(`/retail/scan?${params}`);

      if (result.available !== null && result.available < result.quantity) {
        setError(
          t('stockShort')
            .replace('{0}', result.product.name)
            .replace('{1}', fa(result.available)),
        );
      }

      addLine(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('productNotFound'));
    } finally {
      refocus();
    }
  }

  function changeQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) =>
          line.key === key
            ? { ...line, quantity: Math.round((line.quantity + delta) * 1000) / 1000 }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
    refocus();
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((line) => line.key !== key));
    refocus();
  }

  function resetSale() {
    setCart([]);
    setDiscount(0);
    setCashAmount('');
    setCardAmount('');
    setRation(null);
    setRationCode('');
    setEligibility(null);
    refocus();
  }

  // ---------- کالابرگ ----------

  async function attachRation(event: React.FormEvent) {
    event.preventDefault();

    const code = rationCode.trim();
    if (!code) return;

    setError('');

    try {
      const account = await api<RationAccount>(
        `/ration/accounts/by-national-code/${encodeURIComponent(code)}`,
      );
      setRation(account);
    } catch (err) {
      setRation(null);
      setError(err instanceof Error ? err.message : t('rationNotFound'));
    }
  }

  function detachRation() {
    setRation(null);
    setRationCode('');
    setEligibility(null);
    refocus();
  }

  // سهم مشمول از سرور می‌آید: قیمت مصوب نباید سمت کلاینت تعیین شود.
  useEffect(() => {
    if (!ration || !cart.length) {
      setEligibility(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const result = await api<Eligibility>('/ration/eligibility', {
          method: 'POST',
          body: {
            items: cart.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
            })),
          },
        });
        if (!cancelled) setEligibility(result);
      } catch {
        if (!cancelled) setEligibility(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ration, cart]);

  // ---------- شیفت ----------

  async function openShift(form: FormData) {
    setBusy(true);
    setError('');

    try {
      await api('/retail/shifts/open', {
        method: 'POST',
        body: {
          cashBoxId: String(form.get('cashBoxId') ?? ''),
          warehouseId: String(form.get('warehouseId') ?? '') || undefined,
          openingCash: Number(form.get('openingCash') ?? 0),
        },
      });
      await loadShift();
      setMessage(`${t('shiftOpened')} ✅`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shiftOpenError'));
    } finally {
      setBusy(false);
    }
  }

  async function closeShift() {
    if (!shift) return;

    const counted = window.prompt(t('countedCashPrompt'));
    if (counted === null) return;

    setBusy(true);
    setError('');

    try {
      const closed = await api<{ difference: string | number }>(
        `/retail/shifts/${shift.id}/close`,
        { method: 'PATCH', body: { countedCash: Number(counted) } },
      );

      const diff = Number(closed.difference);
      setMessage(
        diff === 0
          ? `${t('shiftClosedExact')} ✅`
          : diff > 0
            ? t('shiftClosedOver').replace('{0}', fa(diff))
            : t('shiftClosedShort').replace('{0}', fa(Math.abs(diff))),
      );
      setShift(null);
      resetSale();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shiftCloseError'));
    } finally {
      setBusy(false);
    }
  }

  // ---------- تسویه ----------

  async function checkout() {
    if (!cart.length || !shift) return;

    if (paid < dueAfterRation) {
      setError(
        t('underPaid').replace('{0}', fa(dueAfterRation - paid)),
      );
      return;
    }

    setBusy(true);
    setError('');
    setMessage('');

    const cash = Number(cashAmount || 0);
    const card = Number(cardAmount || 0);

    // پول خرد از سهم نقدی کم می‌شود، نه از سهم کارت
    const payments = [
      ...(cash > 0
        ? [{ method: 'CASH', amount: Math.max(0, cash - Math.max(0, change)), cashBoxId: shift.cashBoxId }]
        : []),
      ...(card > 0 ? [{ method: 'CARD', amount: card }] : []),
    ].filter((payment) => payment.amount > 0);

    try {
      const sale = await api<Sale>('/sales', {
        method: 'POST',
        body: {
          warehouseId: shift.warehouseId,
          discount,
          ...(rationShare > 0 && ration ? { rationAccountId: ration.id } : {}),
          payments,
          items: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            price: line.price,
          })),
        },
      });

      setLastSale(sale);
      setMessage(`${t('saleRecorded').replace('{0}', sale.invoiceNo)} ✅`);
      resetSale();
      await loadShift();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saleError'));
    } finally {
      setBusy(false);
    }
  }

  // ---------- نمایش ----------

  if (!shift) {
    return (
      <AppShell title={t('posTitle')} subtitle={t('startShiftSub')}>
        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="error success">{message}</div> : null}

        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            void openShift(new FormData(event.currentTarget));
          }}
        >
          <h3 style={{ marginBottom: 12 }}>{t('shiftOpenTitle')}</h3>

          <label>
            {t('cashBox')}
            <select name="cashBoxId" required>
              <option value="">{t('choose')}</option>
              {cashBoxes.map((box) => (
                <option key={box.id} value={box.id}>
                  {box.name} ({box.code})
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('warehouse')}
            <select name="warehouseId" required>
              <option value="">{t('choose')}</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t('openingCash')}
            <input name="openingCash" type="number" min={0} defaultValue={0} />
          </label>

          <button type="submit" disabled={busy}>
            {busy ? t('opening') : t('openShift')}
          </button>
        </form>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t('posTitle')}
      subtitle={`${t('shiftOpenSub')} — ${fa(shift.salesCount)} ${t('invoicesCountLabel')}`}
    >
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="error success">{message}</div> : null}

      {/* اسکنر */}
      <form className="card scanner" onSubmit={onScan}>
        <input
          ref={scanRef}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onBlur={refocus}
          placeholder={t('scanOrType')}
          autoComplete="off"
          autoFocus
          inputMode="none"
        />
        <button type="submit">{t('add')}</button>
      </form>

      {/* سبد */}
      <div className="card">
        <div className="row-between">
          <h3>
          <Icon name="package" size={18} /> {t('cart')} ({fa(cart.length)})</h3>
          {cart.length ? (
            <button type="button" className="ghost" onClick={resetSale}>
              {t('clearCart')}
            </button>
          ) : null}
        </div>

        {cart.length === 0 ? (
          <p className="muted">{t('cartEmptyScan')}</p>
        ) : (
          <table className="cart">
            <thead>
              <tr>
                <th>{t('colProduct')}</th>
                <th>{t('colQty')}</th>
                <th>{t('colUnitPrice')}</th>
                <th>{t('colLineTotal')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => (
                <tr key={line.key}>
                  <td>
                    {line.name}
                    <div className="muted small">{line.unit}</div>
                  </td>
                  <td className="qty">
                    <button type="button" onClick={() => changeQty(line.key, line.isWeighed ? -0.1 : -1)}>
                      −
                    </button>
                    <span>{qty(line)}</span>
                    <button type="button" onClick={() => changeQty(line.key, line.isWeighed ? 0.1 : 1)}>
                      +
                    </button>
                  </td>
                  <td>{fa(line.price)}</td>
                  <td>{fa(line.price * line.quantity)}</td>
                  <td>
                    <button type="button" className="ghost" onClick={() => removeLine(line.key)}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* تسویه */}
      {cart.length > 0 ? (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>{t('checkout')}</h3>

          <div className="row-between">
            <span>{t('total')}</span>
            <strong>{fa(total)}</strong>
          </div>

          <label>
            {t('discount')}
            <input
              type="number"
              min={0}
              max={total}
              value={discount || ''}
              onChange={(event) => setDiscount(Number(event.target.value || 0))}
            />
          </label>

          <div className="row-between grand">
            <span>{t('payable')}</span>
            <strong>{money(payable)}</strong>
          </div>

          {/* کالابرگ */}
          {ration ? (
            <div className="ration-box">
              <div className="row-between">
                <div>
                  <strong>🎫 {ration.holderName ?? t('ration')}</strong>
                  <div className="muted small">
                    {ration.nationalCode} • {t('balanceLabel')} {fa(ration.balance)}
                  </div>
                </div>
                <button type="button" className="ghost" onClick={detachRation}>
                  {t('remove')}
                </button>
              </div>

              {rationShare > 0 ? (
                <div className="row-between">
                  <span>{t('rationShare')}</span>
                  <strong>{fa(rationShare)}</strong>
                </div>
              ) : (
                <p className="muted small">
                  {t('noRationItems')}
                </p>
              )}

              {eligibility && eligibility.excludedProductIds.length > 0 ? (
                <p className="muted small">
                  {t('excludedItems').replace(
                    '{0}',
                    fa(eligibility.excludedProductIds.length),
                  )}
                </p>
              ) : null}
            </div>
          ) : (
            <form className="ration-lookup" onSubmit={attachRation}>
              <input
                value={rationCode}
                onChange={(event) => setRationCode(event.target.value)}
                placeholder={t('nationalCodePh')}
                inputMode="numeric"
                maxLength={10}
              />
              <button type="submit" className="ghost">
          <Icon name="tag" size={18} /> {t('ration')}
              </button>
            </form>
          )}

          {rationShare > 0 ? (
            <div className="row-between grand">
              <span>{t('remainingAfterRation')}</span>
              <strong>{money(dueAfterRation)}</strong>
            </div>
          ) : null}

          <div className="pay-split">
            <label>
              {t('cash')}
              <input
                type="number"
                min={0}
                value={cashAmount}
                onChange={(event) => setCashAmount(event.target.value)}
              />
            </label>
            <label>
              {t('card')}
              <input
                type="number"
                min={0}
                value={cardAmount}
                onChange={(event) => setCardAmount(event.target.value)}
              />
            </label>
          </div>

          <button
            type="button"
            className="ghost"
            onClick={() => setCashAmount(String(dueAfterRation))}
          >
            {t('takeFullCash')}
          </button>

          {change > 0 ? (
            <div className="row-between change">
              <span>{t('changeSmall')}</span>
              <strong>{money(change)}</strong>
            </div>
          ) : null}

          <button type="button" onClick={checkout} disabled={busy || paid < dueAfterRation}>
            {busy ? t('recording') : t('recordSale')}
          </button>
        </div>
      ) : null}

      {/* آخرین فاکتور */}
      {lastSale ? (
        <div className="card">
          <div className="row-between">
            <span>
              {t('lastInvoice')}: {lastSale.invoiceNo}
            </span>
            <button type="button" onClick={() => printReceipt(lastSale, { currency: currentCurrency() })}>
          <Icon name="print" size={18} /> {t('printReceipt')}
            </button>
          </div>
        </div>
      ) : null}

      {/* شیفت */}
      <div className="card">
        <div className="row-between">
          <div>
            <div className="muted small">{t('shiftSales')}</div>
            <strong>{fa(shift.salesTotal)}</strong>
            <div className="muted small">
              {t('cash')} {fa(shift.cashTotal)} • {t('card')} {fa(shift.cardTotal)}
            </div>
          </div>
          <button type="button" className="ghost" onClick={closeShift} disabled={busy}>
            {t('closeShift')}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
