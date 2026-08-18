'use client';

/**
 * فرم ثبت فاکتور فروش — نسخهٔ پشتیبان، نه صندوق لمسی.
 *
 * صندوق (`/pos`) برای فروش خرده و لمسی ساخته شده: دکمهٔ بزرگ، اسکن، تمام.
 * فاکتور عمده چیز دیگری است — ده‌ها ردیف، تخفیف ردیفی، مهلت تسویه،
 * کرایهٔ حمل — و فروشنده‌ای که دستش از کیبورد جدا نمی‌شود.  یکی کردن این
 * دو، هر دو را بد می‌کند.
 *
 * قاعدهٔ کار با کیبورد:
 *   بارکد/جست‌وجو → Enter  → ردیف اضافه و فوکوس روی «مقدار»
 *   در جدول        → Enter  → خانهٔ بعدی، در آخرین ستون → بارکد
 *                   ↑ ↓    → همان ستون، ردیف بالا/پایین
 *                   Ctrl+Delete → حذف ردیف
 *   F2 ثبت      F4 ثبت و چاپ      Esc بازگشت به بارکد
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import AppShell from '../../../components/AppShell';
import { Icon } from '../../../components/icons';
import { TOUCH } from '../../../components/ui';
import { useI18n } from '../../../lib/i18n-context';
import { api } from '../../../lib/api';
import { amountOnly } from '../../../lib/money';
import {
  computeTotals,
  lineDiscountAmount,
  lineGross,
  lineTaxAmount,
  shortStock,
  type Extras,
  type Line,
} from './invoice-lines';

type Warehouse = { id: string; name: string; code: string | null };
type Customer = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  customerNo: string | null;
};
type Agent = { id: string; name: string };

type Product = {
  id: string;
  name: string;
  sku: string;
  unit: string | null;
  barcode: string | null;
  salePrice: string | number;
  taxRate?: string | number | null;
};

type ScanResult = {
  product: Product;
  quantity: number;
  unitPrice: number;
  available: number | null;
};

const fa = (value: unknown) => amountOnly(value);

/** ستون‌های قابل ویرایش، به ترتیبی که Enter بینشان حرکت می‌کند. */
const EDIT_COLUMNS = ['quantity', 'unitPrice', 'discountPercent', 'serial', 'note'] as const;
type EditColumn = (typeof EDIT_COLUMNS)[number];

const cellId = (key: string, column: EditColumn) => `cell-${key}-${column}`;

/** امروز به شکلی که input[type=date] می‌پذیرد. */
function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function NewInvoicePage() {
  const { t } = useI18n();
  const router = useRouter();

  // ---------- سربرگ ----------
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [salesAgentId, setSalesAgentId] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerHits, setCustomerHits] = useState<Customer[]>([]);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  // «تسویه شد»: پرداخت را برابر مبلغ فاکتور می‌گذارد.  فروشندهٔ نقدی
  // نباید مبلغ را دستی تایپ کند — تایپ دستی یعنی اشتباه تایپی در
  // مبلغ پرداخت، که در تراز صندوق آخر روز پیدا می‌شود.
  const [settled, setSettled] = useState(false);
  const [customerBalance, setCustomerBalance] = useState<number | null>(null);

  // ---------- کالابرگ ----------
  //
  // اعتبار دولتی خانوار، نه تخفیف فروشگاه.  با کد ملی پیدا می‌شود چون
  // همان چیزی است که مشتری می‌گوید — شناسهٔ داخلی را کسی نمی‌داند.
  const [rationCode, setRationCode] = useState('');
  const [ration, setRation] = useState<{
    id: string;
    holderName: string | null;
    balance: string | number;
  } | null>(null);
  const [rationShare, setRationShare] = useState(0);

  // ---------- اقلام ----------
  const [lines, setLines] = useState<Line[]>([]);
  const [code, setCode] = useState('');
  const [hits, setHits] = useState<Product[]>([]);
  const [selectedKey, setSelectedKey] = useState('');

  // ---------- پابرگ ----------
  const [extras, setExtras] = useState<Extras>({
    discountPercent: 0,
    fallbackTaxPercent: 0,
    additions: 0,
    deductions: 0,
  });
  const [paid, setPaid] = useState(0);
  const [method, setMethod] = useState('CASH');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const codeRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(() => computeTotals(lines, extras), [lines, extras]);
  const short = useMemo(() => shortStock(lines), [lines]);
  const selected = useMemo(
    () => lines.find((line) => line.key === selectedKey) ?? null,
    [lines, selectedKey],
  );

  // ---------- بارگذاری اولیه ----------
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [wh, ag] = await Promise.all([
          api<Warehouse[] | { data: Warehouse[] }>('/warehouses'),
          api<Agent[] | { data: Agent[] }>('/sales-agents').catch(() => [] as Agent[]),
        ]);
        if (!alive) return;

        const list = Array.isArray(wh) ? wh : wh.data;
        setWarehouses(list);
        // انبار پیش‌فرض همان اولی است؛ فروشنده نباید برای فروش روزمره هر
        // بار انبار را انتخاب کند.
        if (list[0]) setWarehouseId(list[0].id);
        setAgents(Array.isArray(ag) ? ag : (ag.data ?? []));
      } catch {
        if (alive) setError('بارگذاری انبارها ناموفق بود');
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    codeRef.current?.focus();
  }, []);

  // ---------- جست‌وجوی مشتری ----------
  useEffect(() => {
    const term = customerQuery.trim();
    if (term.length < 2) {
      setCustomerHits([]);
      return;
    }

    // مهلت کوتاه تا هر حرف یک درخواست نزند — فروشنده تند تایپ می‌کند.
    const timer = setTimeout(() => {
      api<{ data: Customer[] }>(`/customers?search=${encodeURIComponent(term)}&limit=8`)
        .then((page) => setCustomerHits(page.data ?? []))
        .catch(() => setCustomerHits([]));
    }, 250);

    return () => clearTimeout(timer);
  }, [customerQuery]);

  // ---------- مانده بدهی مشتری ----------
  //
  // با انتخاب مشتری خوانده می‌شود، نه با ثبت فاکتور: فروشنده باید
  // **پیش از** تصمیم به فروش نسیه بداند طرف حساب چقدر بدهکار است.
  useEffect(() => {
    if (!customer) {
      setCustomerBalance(null);
      return;
    }

    let alive = true;
    api<{ unpaid: number }>(`/customers/${customer.id}/balance`)
      .then((b) => alive && setCustomerBalance(Number(b.unpaid) || 0))
      .catch(() => alive && setCustomerBalance(null));

    return () => {
      alive = false;
    };
  }, [customer]);

  // سهم کالابرگ با تغییر سبد دوباره حساب می‌شود.
  //
  // سرور هم خودش حساب می‌کند و همان ملاک است؛ این فقط برای نمایش است
  // تا صندوق‌دار پیش از ثبت بداند چقدر از اعتبار کم می‌شود و مشتری
  // چقدر باید نقد بدهد.
  useEffect(() => {
    if (!ration || !lines.length) {
      setRationShare(0);
      return;
    }

    let alive = true;
    api<{ eligibleTotal: number }>('/ration/eligibility', {
      method: 'POST',
      body: { items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) },
    })
      .then((r) => alive && setRationShare(Number(r.eligibleTotal) || 0))
      .catch(() => alive && setRationShare(0));

    return () => {
      alive = false;
    };
  }, [ration, lines]);

  async function findRation() {
    const code = rationCode.trim();
    if (!code) return;

    setError('');
    try {
      const found = await api<{ id: string; holderName: string | null; balance: string | number }>(
        `/ration/accounts/by-national-code/${encodeURIComponent(code)}`,
      );
      setRation(found);
    } catch {
      setRation(null);
      setError(`حساب کالابرگ با کد ملی «${code}» پیدا نشد`);
    }
  }

  // ---------- افزودن قلم ----------
  const pushLine = useCallback((result: ScanResult) => {
    const key = `${result.product.id}-${Date.now()}`;
    setLines((prev) => [
      ...prev,
      {
        key,
        productId: result.product.id,
        name: result.product.name,
        sku: result.product.sku,
        barcode: result.product.barcode,
        unit: result.product.unit ?? 'عدد',
        available: result.available,
        quantity: result.quantity,
        unitPrice: result.unitPrice,
        discountPercent: 0,
        // نرخ از خودِ کالا؛ کاربر عوضش نمی‌کند چون سرور هم همان را
        // می‌خواند و ورودی کلاینت را نادیده می‌گیرد.
        taxPercent: Number(result.product.taxRate ?? 0),
        note: '',
        serial: '',
      },
    ]);
    setSelectedKey(key);
    setHits([]);
    setCode('');

    // فوکوس روی «مقدار» همان ردیف تازه: در بیشتر موارد قدم بعدیِ فروشنده
    // همین است.  بدون این، باید دست از کیبورد بردارد و کلیک کند.
    requestAnimationFrame(() => {
      document.getElementById(cellId(key, 'quantity'))?.focus();
    });
  }, []);

  const addByCode = useCallback(
    async (term: string) => {
      const result = await api<ScanResult>(
        `/retail/scan?code=${encodeURIComponent(term)}` +
          (warehouseId ? `&warehouseId=${warehouseId}` : ''),
      );
      pushLine(result);
    },
    [pushLine, warehouseId],
  );

  /**
   * افزودن کالایی که از فهرست جست‌وجو انتخاب شده.
   *
   * `/retail/scan` بارکد، بارکد ترازو و SKU را می‌شناسد — نه شناسهٔ
   * داخلی.  فرستادن `id` همیشه ۴۰۴ می‌گیرد و کاربر «افزودن کالا ناموفق
   * بود» می‌بیند در حالی که کالا را از فهرست خودِ برنامه انتخاب کرده.
   */
  const addProduct = useCallback(
    async (product: Product) => {
      try {
        await addByCode(product.barcode ?? product.sku);
      } catch {
        setError(`افزودن «${product.name}» ناموفق بود`);
      }
    },
    [addByCode],
  );

  async function onCodeSubmit(event: React.FormEvent) {
    event.preventDefault();
    const term = code.trim();
    if (!term) return;

    setError('');
    try {
      await addByCode(term);
    } catch {
      // بارکد نخورد؛ شاید بخشی از نام است.  به جای پیام خطا همان را
      // جست‌وجو می‌کنیم — فروشنده اغلب نام را ناقص می‌زند.
      try {
        const found = await api<Product[]>(
          `/retail/search?q=${encodeURIComponent(term)}&limit=10`,
        );
        if (found.length === 1) {
          await addProduct(found[0]);
        } else if (found.length === 0) {
          setError(`کالایی با «${term}» پیدا نشد`);
        } else {
          setHits(found);
        }
      } catch {
        setError('جست‌وجوی کالا ناموفق بود');
      }
    }
  }

  function patchLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((line) => line.key !== key));
    codeRef.current?.focus();
  }

  // ---------- ناوبری کیبورد در جدول ----------
  function onCellKey(
    event: React.KeyboardEvent<HTMLInputElement>,
    index: number,
    column: EditColumn,
  ) {
    const line = lines[index];
    if (!line) return;

    if (event.key === 'Enter') {
      event.preventDefault();
      const next = EDIT_COLUMNS.indexOf(column) + 1;
      if (next < EDIT_COLUMNS.length) {
        document.getElementById(cellId(line.key, EDIT_COLUMNS[next]))?.focus();
      } else {
        // آخرین ستون: برگرد سر بارکد تا قلم بعدی زده شود.
        codeRef.current?.focus();
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const target = lines[index + (event.key === 'ArrowDown' ? 1 : -1)];
      if (target) {
        event.preventDefault();
        document.getElementById(cellId(target.key, column))?.focus();
      }
      return;
    }

    if (event.key === 'Delete' && event.ctrlKey) {
      event.preventDefault();
      removeLine(line.key);
    }
  }

  // ---------- ثبت ----------
  const submit = useCallback(
    async (print: boolean, andNew = false) => {
      if (busy) return;
      if (!lines.length) {
        setError('فاکتور خالی است');
        return;
      }
      if (!warehouseId) {
        setError('انبار را انتخاب کنید');
        return;
      }

      setBusy(true);
      setError('');
      setFlash('');

      try {
        // مبلغ‌ها را سرور دوباره حساب می‌کند؛ آنچه فرستاده می‌شود «خواسته»
        // است نه «حکم».  تخفیف قلم به ریال تبدیل می‌شود چون سرور مبلغ
        // می‌خواهد نه درصد.
        const sale = await api<{ id: string; invoiceNo: string }>('/sales', {
          method: 'POST',
          body: {
            warehouseId,
            customerId: customer?.id,
            salesAgentId: salesAgentId || undefined,
            reference: reference.trim() || undefined,
            invoiceDate: invoiceDate || undefined,
            rationAccountId: ration?.id,
            dueDate: dueDate || undefined,
            note: note.trim() || undefined,
            additions: extras.additions || undefined,
            deductions: extras.deductions || undefined,
            discount: totals.overallDiscount || undefined,
            tax: totals.tax || undefined,
            items: lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              manualDiscount: lineDiscountAmount(line) || undefined,
              note: line.note.trim() || undefined,
              serial: line.serial.trim() || undefined,
            })),
            ...(paid > 0
              ? { payments: [{ method, amount: Math.min(paid, totals.payable) }] }
              : {}),
          },
        });

        if (print) {
          window.open(`/print/sale/${sale.id}`, '_blank');
        }

        if (andNew) {
          resetForm();
          setFlash(`فاکتور ${sale.invoiceNo} ثبت شد`);
        } else {
          router.push('/sales');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'ثبت فاکتور ناموفق بود');
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      customer,
      dueDate,
      extras,
      lines,
      method,
      note,
      paid,
      reference,
      router,
      salesAgentId,
      totals,
      warehouseId,
    ],
  );

  // ---------- کلیدهای میان‌بر ----------
  //
  // وابستگی صریح به `submit`: بدون آن، شنونده مقدارهای قدیمیِ اقلام را
  // می‌بندد و F2 فاکتورِ چند ثانیه پیش را ثبت می‌کند.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'F2') {
        event.preventDefault();
        void submit(false);
      } else if (event.key === 'F4') {
        event.preventDefault();
        void submit(true);
      } else if (event.key === 'Escape') {
        setHits([]);
        setCustomerHits([]);
        codeRef.current?.focus();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submit]);

  function resetForm() {
    setLines([]);
    setCustomer(null);
    setCustomerQuery('');
    setReference('');
    setNote('');
    setDueDate('');
    setInvoiceDate(todayISO());
    setSettled(false);
    setCustomerBalance(null);
    setRation(null);
    setRationCode('');
    setRationShare(0);
    setExtras({ discountPercent: 0, fallbackTaxPercent: 0, additions: 0, deductions: 0 });
    setPaid(0);
    setCode('');
    setSelectedKey('');
    codeRef.current?.focus();
  }

  // ---------- سبک‌ها ----------
  const box: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 12,
  };
  const field: React.CSSProperties = {
    ...TOUCH,
    width: '100%',
    padding: '7px 9px',
    border: '1px solid var(--border)',
    borderRadius: 7,
    background: 'var(--bg)',
    color: 'var(--text)',
    fontSize: 14,
  };
  const label: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--muted)',
    display: 'block',
    marginBottom: 4,
  };
  const cell: React.CSSProperties = {
    width: '100%',
    padding: '5px 6px',
    border: '1px solid transparent',
    borderRadius: 5,
    background: 'transparent',
    color: 'var(--text)',
    fontSize: 13,
  };
  const th: React.CSSProperties = {
    padding: '7px 8px',
    textAlign: 'right',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--muted)',
    background: 'var(--surface)',
    position: 'sticky',
    top: 0,
    whiteSpace: 'nowrap',
  };
  const num: React.CSSProperties = { textAlign: 'left', fontVariantNumeric: 'tabular-nums' };

  return (
    <AppShell
      title="افزودن فاکتور فروش"
      subtitle="F2 ثبت · F4 ثبت و چاپ · Enter خانهٔ بعدی · Ctrl+Delete حذف ردیف"
      actions={
        <button
          type="button"
          onClick={() => router.push('/sales')}
          style={{ ...field, width: 'auto', padding: '7px 14px', cursor: 'pointer' }}
        >
          {t('invExit')}
        </button>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        {flash && (
          <div style={{ ...box, borderColor: 'var(--success)', color: 'var(--success)', padding: 9, fontSize: 13 }}>
            {flash}
          </div>
        )}
        {error && (
          <div style={{ ...box, borderColor: 'var(--danger)', color: 'var(--danger)', padding: 9, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* ---------- سربرگ ---------- */}
        <div style={box}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 10,
            }}
          >
            <div>
              <label style={label} htmlFor="wh">
                {t('invWarehouse')}
              </label>
              <select
                id="wh"
                style={field}
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ position: 'relative' }}>
              <label style={label} htmlFor="cust">
                {t('invParty')}
              </label>
              <input
                id="cust"
                style={field}
                placeholder="نام، شماره یا تلفن مشتری"
                autoComplete="off"
                value={
                  customer
                    ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() ||
                      customer.phone ||
                      '—'
                    : customerQuery
                }
                onChange={(e) => {
                  setCustomer(null);
                  setCustomerQuery(e.target.value);
                }}
              />
              {customerHits.length > 0 && !customer && (
                <ul
                  style={{
                    ...box,
                    position: 'absolute',
                    zIndex: 20,
                    insetInlineStart: 0,
                    insetInlineEnd: 0,
                    marginTop: 3,
                    padding: 4,
                    listStyle: 'none',
                    maxHeight: 220,
                    overflowY: 'auto',
                  }}
                >
                  {customerHits.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomer(c);
                          setCustomerHits([]);
                        }}
                        style={{
                          ...TOUCH,
                          width: '100%',
                          textAlign: 'right',
                          background: 'transparent',
                          border: 0,
                          color: 'var(--text)',
                          padding: '7px 8px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        {[c.customerNo, `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(), c.phone]
                          .filter(Boolean)
                          .join(' · ')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label style={label} htmlFor="agent">
                {t('invAgent')}
              </label>
              <select
                id="agent"
                style={field}
                value={salesAgentId}
                onChange={(e) => setSalesAgentId(e.target.value)}
              >
                <option value="">{t('invNoAgent')}</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={label} htmlFor="idate">
                {t('invDate')}
              </label>
              <input
                id="idate"
                type="date"
                style={field}
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            <div>
              <label style={label} htmlFor="ref">
                {t('invReference')}
              </label>
              <input
                id="ref"
                style={field}
                placeholder="شمارهٔ سفارش یا قرارداد"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>

            <div>
              <label style={label} htmlFor="due">
                {t('invDueDate')}
              </label>
              <input
                id="due"
                type="date"
                style={field}
                min={todayISO()}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div>
              <label style={label} htmlFor="note">
                {t('invNote')}
              </label>
              <input
                id="note"
                style={field}
                placeholder="توضیح فاکتور"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ---------- ورود کالا ---------- */}
        <div style={{ ...box, position: 'relative' }}>
          <form onSubmit={onCodeSubmit} style={{ display: 'flex', gap: 8 }}>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--muted)',
                paddingInlineStart: 2,
              }}
            >
              <Icon name="search" size={17} />
            </span>
            <input
              ref={codeRef}
              style={{ ...field, fontSize: 15 }}
              placeholder="بارکد کالا، کد، یا بخشی از نام — سپس Enter"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
              aria-label="بارکد یا نام کالا"
            />
            <button
              type="submit"
              style={{
                ...field,
                width: 'auto',
                padding: '7px 16px',
                cursor: 'pointer',
                background: 'var(--accent)',
                color: '#fff',
                border: 0,
                fontWeight: 600,
              }}
            >
              {t('invAdd')}
            </button>
          </form>

          {hits.length > 0 && (
            <ul
              style={{
                ...box,
                position: 'absolute',
                zIndex: 20,
                insetInlineStart: 12,
                insetInlineEnd: 12,
                marginTop: 4,
                padding: 4,
                listStyle: 'none',
                maxHeight: 260,
                overflowY: 'auto',
              }}
            >
              {hits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => void addProduct(p)}
                    style={{
                      ...TOUCH,
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      textAlign: 'right',
                      background: 'transparent',
                      border: 0,
                      color: 'var(--text)',
                      padding: '7px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    <span>{p.name}</span>
                    <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {p.sku} · {fa(p.salePrice)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ---------- جدول اقلام ---------- */}
        <div style={{ ...box, padding: 0, overflow: 'hidden' }}>
          <div style={{ maxHeight: '45vh', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 34 }}>#</th>
                  <th style={th}>{t('invColName')}</th>
                  <th style={{ ...th, width: 118 }}>{t('invColBarcode')}</th>
                  <th style={{ ...th, width: 92 }}>{t('invColQty')}</th>
                  <th style={{ ...th, width: 54 }}>{t('invColUnit')}</th>
                  <th style={{ ...th, width: 128 }}>{t('invColUnitPrice')}</th>
                  <th style={{ ...th, width: 70 }}>{t('invColDiscountPct')}</th>
                  <th style={{ ...th, width: 62 }}>{t('invColTaxPct')}</th>
                  <th style={{ ...th, width: 128 }}>{t('invColAmount')}</th>
                  <th style={{ ...th, width: 110 }}>{t('invColSerial')}</th>
                  <th style={th}>{t('invNote')}</th>
                  <th style={{ ...th, width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td
                      colSpan={12}
                      style={{ padding: 34, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}
                    >
                      {t('invScanHint')}
                    </td>
                  </tr>
                )}

                {lines.map((line, index) => {
                  const isShort = line.available !== null && line.quantity > line.available;
                  return (
                    <tr
                      key={line.key}
                      onFocus={() => setSelectedKey(line.key)}
                      style={{ borderTop: '1px solid var(--border)' }}
                    >
                      <td style={{ padding: '4px 8px', color: 'var(--muted)', ...num }}>
                        {fa(index + 1)}
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        {line.name}
                        {isShort && (
                          <span style={{ marginInlineStart: 6, fontSize: 11, color: 'var(--danger)' }}>
                            موجودی {fa(line.available)}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '4px 8px', color: 'var(--muted)', ...num }}>
                        {line.barcode ?? line.sku}
                      </td>
                      <td style={{ padding: '2px 4px' }}>
                        <input
                          id={cellId(line.key, 'quantity')}
                          type="number"
                          step="0.001"
                          min="0"
                          aria-label={`مقدار ${line.name}`}
                          style={{ ...cell, ...num }}
                          value={line.quantity}
                          onChange={(e) => patchLine(line.key, { quantity: Number(e.target.value) })}
                          onKeyDown={(e) => onCellKey(e, index, 'quantity')}
                          onFocus={(e) => e.target.select()}
                        />
                      </td>
                      <td style={{ padding: '4px 8px', color: 'var(--muted)' }}>{line.unit}</td>
                      <td style={{ padding: '2px 4px' }}>
                        <input
                          id={cellId(line.key, 'unitPrice')}
                          type="number"
                          min="0"
                          aria-label={`بهای واحد ${line.name}`}
                          style={{ ...cell, ...num }}
                          value={line.unitPrice}
                          onChange={(e) => patchLine(line.key, { unitPrice: Number(e.target.value) })}
                          onKeyDown={(e) => onCellKey(e, index, 'unitPrice')}
                          onFocus={(e) => e.target.select()}
                        />
                      </td>
                      <td style={{ padding: '2px 4px' }}>
                        <input
                          id={cellId(line.key, 'discountPercent')}
                          type="number"
                          min="0"
                          max="100"
                          aria-label={`تخفیف ${line.name}`}
                          style={{ ...cell, ...num }}
                          value={line.discountPercent}
                          onChange={(e) =>
                            patchLine(line.key, { discountPercent: Number(e.target.value) })
                          }
                          onKeyDown={(e) => onCellKey(e, index, 'discountPercent')}
                          onFocus={(e) => e.target.select()}
                        />
                      </td>
                      <td style={{ padding: '4px 8px', color: 'var(--muted)', ...num }}>
                        {line.taxPercent > 0 ? fa(line.taxPercent) : '—'}
                      </td>
                      <td style={{ padding: '4px 8px', fontWeight: 600, ...num }}>
                        {fa(lineGross(line) - lineDiscountAmount(line) + lineTaxAmount(line))}
                      </td>
                      <td style={{ padding: '2px 4px' }}>
                        <input
                          id={cellId(line.key, 'serial')}
                          style={cell}
                          value={line.serial}
                          placeholder="—"
                          aria-label={`سریال ${line.name}`}
                          onChange={(e) => patchLine(line.key, { serial: e.target.value })}
                          onKeyDown={(e) => onCellKey(e, index, 'serial')}
                        />
                      </td>
                      <td style={{ padding: '2px 4px' }}>
                        <input
                          id={cellId(line.key, 'note')}
                          style={cell}
                          value={line.note}
                          placeholder="—"
                          aria-label={`شرح ${line.name}`}
                          onChange={(e) => patchLine(line.key, { note: e.target.value })}
                          onKeyDown={(e) => onCellKey(e, index, 'note')}
                        />
                      </td>
                      <td style={{ padding: '2px 4px', textAlign: 'center' }}>
                        <button
                          type="button"
                          aria-label={`حذف ${line.name}`}
                          onClick={() => removeLine(line.key)}
                          style={{
                            ...TOUCH,
                            background: 'transparent',
                            border: 0,
                            color: 'var(--danger)',
                            cursor: 'pointer',
                            padding: 4,
                          }}
                        >
                          <Icon name="x" size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------- پابرگ ---------- */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 12,
            alignItems: 'start',
          }}
        >
          <div style={box}>
            <div style={{ ...label, marginBottom: 8 }}>{t('invSelectedProduct')}</div>
            {selected ? (
              <div style={{ display: 'grid', gap: 5, fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>{selected.name}</div>
                <Row k="موجودی انبار" v={selected.available === null ? '—' : fa(selected.available)} />
                <Row k={t('colQty')} v={`${fa(selected.quantity)} ${selected.unit}`} />
                <Row k="مبلغ ناخالص" v={fa(lineGross(selected))} />
                <Row k="تخفیف قلم" v={fa(lineDiscountAmount(selected))} />
              </div>
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{t('invNoRowSelected')}</div>
            )}

            {customerBalance !== null && (
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  marginTop: 10,
                  paddingTop: 8,
                  fontSize: 13,
                }}
              >
                {/* مانده بدهی پیش از فروش نسیه: فروشنده باید بداند این
                    مشتری از قبل چقدر بدهکار است، نه بعد از ثبت فاکتور. */}
                <Row
                  k="مانده بدهی مشتری"
                  v={customerBalance > 0 ? fa(customerBalance) : 'بدهی ندارد'}
                />
              </div>
            )}
          </div>

          <div style={box}>
            <div style={{ display: 'grid', gap: 8 }}>
              <Percent
                id="disc"
                label="تخفیف کلی"
                value={extras.discountPercent}
                amount={totals.overallDiscount}
                onChange={(v) => setExtras((e) => ({ ...e, discountPercent: v }))}
                field={field}
                labelStyle={label}
              />
              {lines.some((line) => line.taxPercent > 0) ? (
                <div>
                  <span style={label}>{t('invVat')}</span>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {t('invVatFromProducts')}
                    </span>
                    <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                      {fa(totals.tax)}
                    </span>
                  </div>
                </div>
              ) : (
                <Percent
                  id="vat"
                  label={t('statVat')}
                  value={extras.fallbackTaxPercent}
                  amount={totals.tax}
                  onChange={(v) => setExtras((e) => ({ ...e, fallbackTaxPercent: v }))}
                  field={field}
                  labelStyle={label}
                />
              )}
              <div>
                <label style={label} htmlFor="add">
                  {t('invAdditions')}
                </label>
                <input
                  id="add"
                  type="number"
                  min="0"
                  style={{ ...field, ...num }}
                  value={extras.additions}
                  onChange={(e) => setExtras((x) => ({ ...x, additions: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label style={label} htmlFor="ded">
                  {t('invDeductions')}
                </label>
                <input
                  id="ded"
                  type="number"
                  min="0"
                  style={{ ...field, ...num }}
                  value={extras.deductions}
                  onChange={(e) => setExtras((x) => ({ ...x, deductions: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>

          <div style={box}>
            <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
              <Row k="جمع مبلغ کالاها" v={fa(totals.itemsTotal)} />
              <Row k="تخفیف ردیف‌ها" v={fa(totals.lineDiscount)} />
              <Row k="تخفیف کلی" v={fa(totals.overallDiscount)} />
              <Row k={t('tax')} v={fa(totals.tax)} />
              <Row k="اضافات" v={fa(totals.additions)} />
              <Row k="کسورات" v={fa(totals.deductions)} />
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  marginTop: 4,
                  paddingTop: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 17,
                  fontWeight: 700,
                }}
              >
                <span>{t('invPayable')}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fa(totals.payable)}</span>
              </div>

              {/* ---------- کالابرگ ---------- */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
                <label style={label} htmlFor="ration">
                  {t('invRationCode')}
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    id="ration"
                    style={{ ...field, ...num }}
                    placeholder="کد ملی"
                    value={rationCode}
                    onChange={(e) => setRationCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void findRation();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void findRation()}
                    style={{ ...field, width: 'auto', padding: '7px 12px', cursor: 'pointer' }}
                  >
                    {t('invFind')}
                  </button>
                </div>

                {ration && (
                  <div style={{ marginTop: 6, display: 'grid', gap: 4, fontSize: 13 }}>
                    <Row k={t('roleMANAGER')} v={ration.holderName ?? '—'} />
                    <Row k="اعتبار موجود" v={fa(ration.balance)} />
                    {/* سهمِ این خرید از اعتبار — تا مشتری بداند چقدر
                        باید نقد بدهد، نه اینکه پای صندوق معلوم شود. */}
                    <Row k="سهم این خرید" v={fa(rationShare)} />
                    {rationShare > Number(ration.balance) && (
                      <div style={{ color: 'var(--danger)', fontSize: 12 }}>
                        {t('invRationOverLimit')}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setRation(null);
                        setRationCode('');
                      }}
                      style={{
                        ...TOUCH,
                        background: 'transparent',
                        border: 0,
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        fontSize: 12,
                        padding: 0,
                        textAlign: 'right',
                      }}
                    >
                      {t('invRemoveRation')}
                    </button>
                  </div>
                )}
              </div>

              <label
                style={{
                  ...TOUCH,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 8,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={settled}
                  onChange={(e) => {
                    setSettled(e.target.checked);
                    // مبلغ را خودمان می‌گذاریم.  تایپ دستیِ مبلغ یعنی
                    // اشتباه تایپی، که آخر روز در تراز صندوق پیدا می‌شود
                    // و آن‌وقت باید کل فاکتورها را کنترل کرد.
                    setPaid(e.target.checked ? totals.payable : 0);
                  }}
                  style={{ width: 18, height: 18 }}
                />
                {t('invSettledFull')}
              </label>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={label} htmlFor="paid">
                    {t('invPayment')}
                  </label>
                  <input
                    id="paid"
                    type="number"
                    min="0"
                    style={{ ...field, ...num }}
                    value={paid}
                    onChange={(e) => setPaid(Number(e.target.value))}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={label} htmlFor="method">
                    {t('invMethod')}
                  </label>
                  <select
                    id="method"
                    style={field}
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                  >
                    <option value="CASH">{t('invCash')}</option>
                    <option value="CARD">{t('invCard')}</option>
                    <option value="CREDIT">{t('invCredit')}</option>
                    <option value="BANK_TRANSFER">{t('invTransfer')}</option>
                    <option value="CHEQUE">{t('invCheque')}</option>
                  </select>
                </div>
              </div>

              {paid < totals.payable && totals.payable > 0 && (
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  مانده: {fa(totals.payable - paid)}
                  {!dueDate && ' — مهلت تسویه را مشخص کنید'}
                </div>
              )}
            </div>
          </div>
        </div>

        {short.length > 0 && (
          <div style={{ ...box, borderColor: 'var(--danger)', color: 'var(--danger)', fontSize: 13, padding: 9 }}>
            {fa(short.length)} قلم بیش از موجودی انبار است. فاکتور ثبت می‌شود ولی موجودی منفی
            خواهد شد.
          </div>
        )}

        {/* ---------- دکمه‌های ثبت ---------- */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={busy || !lines.length}
            onClick={() => void submit(true)}
            style={{ ...field, width: 'auto', padding: '9px 18px', cursor: 'pointer' }}
          >
            {t('invSavePrint')}
          </button>
          <button
            type="button"
            disabled={busy || !lines.length}
            onClick={() => void submit(false, true)}
            style={{ ...field, width: 'auto', padding: '9px 18px', cursor: 'pointer' }}
          >
            {t('invSaveNew')}
          </button>
          <button
            type="button"
            disabled={busy || !lines.length}
            onClick={() => void submit(false)}
            style={{
              ...field,
              width: 'auto',
              padding: '9px 24px',
              cursor: 'pointer',
              background: 'var(--accent)',
              color: '#fff',
              border: 0,
              fontWeight: 700,
            }}
          >
            {busy ? 'در حال ثبت…' : 'ثبت و خروج'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ color: 'var(--muted)' }}>{k}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );
}

/** درصد به‌علاوهٔ مبلغِ حاصل — کاربر باید هر دو را همزمان ببیند. */
function Percent({
  id,
  label,
  value,
  amount,
  onChange,
  field,
  labelStyle,
}: {
  id: string;
  label: string;
  value: number;
  amount: number;
  onChange: (value: number) => void;
  field: React.CSSProperties;
  labelStyle: React.CSSProperties;
}) {
  return (
    <div>
      <label style={labelStyle} htmlFor={id}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          id={id}
          type="number"
          min="0"
          max="100"
          style={{ ...field, width: 84, textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>٪</span>
        <span style={{ marginInlineStart: 'auto', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {amountOnly(amount)}
        </span>
      </div>
    </div>
  );
}
