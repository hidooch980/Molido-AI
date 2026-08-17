'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { Icon } from '../../components/icons';
import { useI18n } from '../../lib/i18n-context';
import BarcodeScanner, {
  isScannerSupported,
} from '../../components/BarcodeScanner';
import { api } from '../../lib/api';
import { isSpeechSupported, listenOnce, parseVoiceCommand } from '../../lib/speech';
import { printReceipt } from '../../lib/receipt';
import {
  isAgentAvailable,
  openCashDrawer,
  printViaAgent,
  receiptToText,
} from '../../lib/print-agent';
import { companyName, loadCompany } from '../../lib/company';
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
  /** تخفیف دستی همین قلم — «این یکی ضربه دیده». */
  manualDiscount?: number;
};

type Parked = {
  id: string;
  label: string | null;
  lineCount: number;
  customerName: string | null;
  createdAt: string;
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

type QuoteLine = {
  productId: string;
  qty: number;
  unitPrice: number;
  gross: number;
  discount: number;
  discountName: string | null;
  total: number;
};

type Identified = {
  checkinId: string;
  customerId: string;
  name: string | null;
  phone: string | null;
  availableCodes: Array<{ code: string; ruleName: string }>;
};

type Quote = {
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  total: number;
  codeApplied: boolean | null;
  codeError: string | null;
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

/** پیشوند QR شناسایی مشتری — تا از بارکد کالا تفکیک شود. */
const CHECKIN_PREFIX = 'MC1:';

/** فقط عدد — برای جدول سبد که ستون‌هایش تنگ است. */
const fa = (value: unknown) => amountOnly(value);

/** سطر انتخاب کالا — روی تبلت صندوق با انگشت زده می‌شود. */
const TOUCH_ROW: React.CSSProperties = {
  minHeight: 48,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  textAlign: 'right',
};

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
type QuickKey = {
  id: string;
  productId: string;
  label: string | null;
  color: string | null;
  defaultQty: string | number;
  productName: string;
  salePrice: string | number;
  sku?: string | null;
  unit: string | null;
};

type QuickGroup = {
  id: string;
  name: string;
  color: string | null;
  keys: QuickKey[];
};

/**
 * روشن یا تیره کردن یک رنگ هگز.
 *
 * عمقِ دکمه از تفاوت سه رنگ می‌آید: بالای روشن‌تر، پایینِ خودِ رنگ، و
 * لبهٔ تیره.  اگر کاربر فقط یک رنگ بدهد و همان را همه‌جا بگذاریم،
 * دکمه دوباره تخت می‌شود.
 */
function shade(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;

  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(clean.slice(i, i + 2), 16);
    return Math.max(0, Math.min(255, value + amount));
  });

  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export default function PosPage() {
  const { t } = useI18n();
  const [shift, setShift] = useState<Shift | null>(null);
  const [cashBoxes, setCashBoxes] = useState<CashBox[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  // پشتیبانی دوربین فقط در مرورگر معلوم می‌شود؛ خواندنش هنگام رندر باعث
  // اختلاف رندر سرور و کلاینت می‌شود.
  const [cameraReady, setCameraReady] = useState(false);
  // تشخیص گفتار هم مثل دوربین فقط در مرورگر معلوم می‌شود.
  const [micReady, setMicReady] = useState(false);
  const [listening, setListening] = useState(false);
  /**
   * مقداری که گفته شده ولی هنوز قلمش وارد سبد نشده.
   *
   * `addByCode` غیرهمگام است و کلیدِ سطر را برنمی‌گرداند؛ مقدار پس از
   * دیده شدن قلم در سبد اعمال می‌شود.
   */
  const [pendingQty, setPendingQty] = useState<{
    productId: string;
    qty: number;
    /** مقداری که پیش از افزودن در سبد بود. */
    before: number;
  } | null>(null);
  /**
   * وقتی گفته‌شده به بیش از یک کالا می‌خورد.
   *
   * خودکار اولی برداشته **نمی‌شود**: موتور گفتار گاهی اشتباه می‌شنود، و
   * قلمِ اشتباه در فاکتور، پولِ واقعیِ مشتری است.
   */
  const [heard, setHeard] = useState<{
    term: string;
    qty: number | null;
    options: Array<{ id: string; name: string; sku: string }>;
  } | null>(null);
  // عامل چاپ روی دستگاه صندوق نصب می‌شود؛ اگر نباشد، چاپ معمولی مرورگر
  // استفاده می‌شود و هیچ‌چیز نمی‌شکند.
  const [agentReady, setAgentReady] = useState(false);
  // اقلام آخرین فروش برای چاپ نگه داشته می‌شوند؛ سبد بلافاصله پس از ثبت
  // خالی می‌شود و بدون این، رسید بدون قلم چاپ می‌شد.
  const [lastLines, setLastLines] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [cashAmount, setCashAmount] = useState('');
  const [cardAmount, setCardAmount] = useState('');

  // قیمت‌دهی سرور: سطح قیمت مشتری و تخفیف خودکار اینجا اعمال می‌شوند.
  const [quote, setQuote] = useState<Quote | null>(null);

  // مشتری شناسایی‌شده با QR اپلیکیشن.
  const [identified, setIdentified] = useState<Identified | null>(null);
  // سبدهای کنارگذاشته‌شده — مشترک بین همهٔ صندوق‌های فروشگاه.
  const [parked, setParked] = useState<Parked[]>([]);
  const [showParked, setShowParked] = useState(false);
  const [discountCode, setDiscountCode] = useState('');

  const [ration, setRation] = useState<RationAccount | null>(null);
  const [rationCode, setRationCode] = useState('');
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);

  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSale, setLastSale] = useState<Sale | null>(null);

  const scanRef = useRef<HTMLInputElement>(null);
  /**
   * سبد، همیشه تازه.
   *
   * `addBySpeech` غیرهمگام است و بستارش سبدِ لحظهٔ فراخوانی را می‌بیند.
   * برای دانستن «قبلاً چندتا در سبد بود» باید مقدارِ همان لحظه خوانده
   * شود، نه مقدارِ رندرِ قبلی.
   */
  const cartRef = useRef<CartLine[]>([]);

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
    void loadCompany();
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

  // جمع سبد از قیمت‌دهی سرور می‌آید؛ تا رسیدن پاسخ، قیمت اسکن نمایش داده
  // می‌شود تا صندوق‌دار عدد خالی نبیند.  عددی که واقعاً فاکتور را می‌سازد
  // در هر حال سمت سرور دوباره حساب می‌شود.
  const total = useMemo(
    () =>
      quote
        ? quote.subtotal
        : cart.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [quote, cart],
  );

  /** تخفیف قواعد خودکار — جدا از تخفیف دستی صندوق‌دار. */
  const autoDiscount = quote?.discount ?? 0;

  const payable = Math.max(0, total - autoDiscount - discount);

  // کالابرگ محدود است به: سقف اقلام مشمول، مانده اعتبار، و مبلغ فاکتور
  const rationShare = ration && eligibility
    ? Math.min(eligibility.eligibleTotal, Number(ration.balance), payable)
    : 0;

  const dueAfterRation = Math.max(0, payable - rationShare);
  const paid = Number(cashAmount || 0) + Number(cardAmount || 0);
  const change = paid - dueAfterRation;

  // ---------- کلید سریع ----------
  //
  // کالای فله (میوه، نان، سبزی) بارکد ندارد و کالای پرفروش با یک لمس
  // سریع‌تر از اسکن است.  چیدمان را مدیر در تنظیمات می‌سازد؛ اینجا فقط
  // خوانده و نشان داده می‌شود.
  const [quickGroups, setQuickGroups] = useState<QuickGroup[]>([]);
  const [quickTab, setQuickTab] = useState('');

  useEffect(() => {
    let alive = true;
    api<QuickGroup[]>('/retail/quick-keys')
      .then((groups) => {
        if (!alive) return;
        setQuickGroups(groups);
        if (groups[0]) setQuickTab(groups[0].id);
      })
      // نبودِ کلید سریع خطا نیست؛ فروشگاهی که چیدمان نساخته، فقط اسکن
      // دارد و صندوق باید مثل قبل کار کند.
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, []);

  /** لمس یک کلید — همان مسیر اسکن را می‌رود تا قیمت و موجودی یکی باشد. */
  async function pressQuickKey(key: QuickKey) {
    try {
      const result = await api<ScanResult>(
        `/retail/scan?code=${encodeURIComponent(key.productId)}`,
      );
      addLine({ ...result, quantity: Number(key.defaultQty) || 1 });
    } catch {
      // شناسهٔ داخلی را `/retail/scan` نمی‌شناسد؛ با SKU دوباره
      // امتحان می‌شود.  همان دامی که در فرم فاکتور هم خورده بود.
      try {
        const result = await api<ScanResult>(
          `/retail/scan?code=${encodeURIComponent(key.sku ?? '')}`,
        );
        addLine({ ...result, quantity: Number(key.defaultQty) || 1 });
      } catch {
        setError(`افزودن «${key.label ?? key.productName}» ناموفق بود`);
      }
    }
    refocus();
  }

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

  useEffect(() => {
    setCameraReady(isScannerSupported());
    setMicReady(isSpeechSupported());
    void isAgentAvailable().then(setAgentReady);
  }, []);

  /**
   * اعمال مقدارِ گفته‌شده وقتی قلم وارد سبد شد.
   *
   * «سه تا نان» دو کار است: پیدا کردن نان، و گذاشتن مقدار سه.  دومی
   * باید صبر کند تا اولی تمام شود.
   */
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    if (!pendingQty) return;
    const line = cart.find((item) => item.productId === pendingQty.productId);
    if (!line) return;

    // مقدار **اضافه** می‌شود به آنچه بود، جایگزینش نمی‌شود.
    //
    // اگر صندوق‌دار پنج نان اسکن کرده باشد و بعد بگوید «سه تا نان»،
    // انتظارش هشت است نه سه.  نسخهٔ اول مقدار را جایگزین می‌کرد و آن
    // پنج‌تا بی‌صدا به سه‌تا تبدیل می‌شد — روی فاکتور، پولِ مشتری.
    setQty(line.key, pendingQty.before + pendingQty.qty);
    setPendingQty(null);
  }, [cart, pendingQty]);

  /** مقدار فعلی یک کالا در سبد — از مرجع، نه از بستارِ کهنه. */
  const qtyInCart = useCallback((productId: string): number => {
    return cartRef.current
      .filter((line) => line.productId === productId)
      .reduce((sum, line) => sum + line.quantity, 0);
  }, []);

  /**
   * چاپ رسید: اول عامل محلی، بعد مرورگر.
   *
   * عامل بی‌صدا چاپ می‌کند و کشوی پول را هم باز می‌کند — که در صندوق
   * شلوغ تفاوت چند ثانیه در هر فروش است.
   */
  async function print(sale: Sale, lines: CartLine[]) {
    const text = receiptToText({
      // نام فروشگاه بالای رسید.  `print-agent` از اول پشتیبانی‌اش می‌کرد
      // ولی هیچ‌کس پرش نمی‌کرد، پس رسیدها بی‌نام چاپ می‌شدند.
      shopName: companyName(),
      invoiceNo: sale.invoiceNo,
      createdAt: sale.createdAt,
      // اقلام از سبدِ همان فروش می‌آید: پاسخ ثبت فاکتور فقط سربرگ
      // برمی‌گرداند و گرفتن دوبارهٔ فاکتور برای چاپ، یک رفت‌وبرگشت اضافه
      // در شلوغ‌ترین لحظهٔ صندوق است.
      items: lines.map((line) => ({
        name: line.name,
        quantity: Number(line.quantity),
        price: Number(line.price),
        total: Number(line.quantity) * Number(line.price),
      })),
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount ?? 0),
      tax: Number(sale.tax ?? 0),
      total: Number(sale.total),
    });

    const printed = await printViaAgent(text, { drawer: true });

    // بازگشت به چاپ مرورگر: شکست عامل نباید صندوق‌دار را بدون رسید بگذارد.
    if (!printed) {
      printReceipt(sale, { currency: currentCurrency() });
    }
  }

  /**
   * افزودن کالا با کد — مشترک بین ورود دستی، بارکدخوان سخت‌افزاری و
   * دوربین.  یکی بودنشان یعنی هر سه رفتار یکسانی دارند؛ سه نسخهٔ جدا دیر
   * یا زود از هم واگرا می‌شدند.
   */
  const addByCode = useCallback(
    async (input: string) => {
      const value = input.trim();
      if (!value || !shift) return;

      setError('');

      // QR شناسایی مشتری از همان ورودی اسکنر می‌آید.  صندوق‌دار نباید
      // پیش از اسکن تصمیم بگیرد این بارکد کالاست یا مشتری — پیشوند
      // خودش می‌گوید.
      if (value.startsWith(CHECKIN_PREFIX)) {
        try {
          const who = await api<Identified>('/loyalty/checkin/resolve', {
            method: 'POST',
            body: { token: value },
          });

          setIdentified(who);

          // کد فعال مشتری خودکار برداشته می‌شود؛ پرسیدن «کد تخفیفی
          // داری؟» از صندوق‌دار، همان جایی است که تخفیف فراموش می‌شود.
          if (who.availableCodes[0]) setDiscountCode(who.availableCodes[0].code);

          setMessage(t('customerIdentified').replace('{0}', who.name ?? '—'));
        } catch (err) {
          setError(err instanceof Error ? err.message : t('checkinFailed'));
        }
        return;
      }

      try {
        const params = new URLSearchParams({ code: value });
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
      }
    },
    [shift, t, fa, addLine],
  );

  /**
   * افزودن کالا از روی گفتار.
   *
   * چرا از مسیر `addByCode` رد می‌شود و سبد را مستقیم دست نمی‌زند:
   * بارکدخوان، دوربین و صدا باید یک رفتار داشته باشند.  مسیر جدا،
   * دیر یا زود با بقیه واگرا می‌شود.
   *
   * موتور گفتار **نام** می‌دهد نه بارکد، پس اول جست‌وجو لازم است — و
   * نتیجهٔ چندتایی به صندوق‌دار نشان داده می‌شود، نه اینکه اولی
   * خودکار برداشته شود.
   */
  const addBySpeech = useCallback(
    async (transcript: string) => {
      const { qty, term } = parseVoiceCommand(transcript);
      if (!term) return;

      setError('');

      // اگر آنچه شنیده شد فقط رقم است، همان بارکد است.
      if (/^[0-9]{4,}$/.test(term)) {
        await addByCode(term);
        return;
      }

      try {
        const found = await api<Array<{ id: string; name: string; sku: string }>>(
          `/retail/search?q=${encodeURIComponent(term)}&limit=8`,
        );

        if (!found.length) {
          setError(`«${term}» پیدا نشد`);
          return;
        }

        if (found.length === 1) {
          const before = qtyInCart(found[0].id);
          await addByCode(found[0].sku);
          if (qty && qty > 1) {
            setPendingQty({ productId: found[0].id, qty, before });
          }
          return;
        }

        setHeard({ term, qty, options: found });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'جست‌وجو ناموفق بود');
      }
    },
    [addByCode, qtyInCart],
  );

  const startListening = useCallback(() => {
    if (listening) return;
    setError('');
    setHeard(null);
    setListening(true);

    const handle = listenOnce(
      (text) => {
        setListening(false);
        void addBySpeech(text);
      },
      (message) => {
        setListening(false);
        setError(message);
      },
    );

    // اگر موتور اصلاً شروع نشد، دکمه نباید تا ابد «در حال شنیدن» بماند.
    if (!handle) setListening(false);
  }, [listening, addBySpeech]);

  async function onScan(event: React.FormEvent) {
    event.preventDefault();

    const input = code.trim();
    setCode('');

    await addByCode(input);
    refocus();
  }

  const loadParked = useCallback(async () => {
    try {
      setParked(await api<Parked[]>('/retail/parked'));
    } catch {
      // فهرست معلق‌ها نباید صندوق را بشکند؛ خالی ماندنش بی‌خطر است.
      setParked([]);
    }
  }, []);

  useEffect(() => {
    void loadParked();
  }, [loadParked]);

  /**
   * کنار گذاشتن سبد.
   *
   * مشتری وسط حساب یادش می‌افتد چیزی برنداشته؛ صندوق‌دار سبد را کنار
   * می‌گذارد و نفر بعد را حساب می‌کند.  بدون این، یا صف می‌ایستد یا سبد
   * دور ریخته می‌شود.
   */
  async function parkCart() {
    if (!cart.length) return;

    try {
      await api('/retail/parked', {
        method: 'POST',
        body: {
          lines: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            name: line.name,
            price: line.price,
          })),
          customerId: identified?.customerId,
          shiftId: shift?.id,
        },
      });

      resetSale();
      await loadParked();
      setMessage(t('cartParked'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saleError'));
    }
  }

  /** بازیابی سبد؛ قیمت‌ها دوباره از سرور می‌آیند. */
  async function resumeCart(id: string) {
    try {
      const result = await api<{
        lines: Array<{
          productId: string;
          quantity: number;
          name: string;
          unit: string;
          price: number;
          isWeighed: boolean;
          unavailable: boolean;
        }>;
      }>(`/retail/parked/${id}/resume`, { method: 'POST' });

      // کالای ناموجود کنار گذاشته می‌شود ولی بی‌سروصدا نه — صندوق‌دار
      // باید بداند چه چیزی از سبد افتاد.
      const gone = result.lines.filter((line) => line.unavailable);
      const usable = result.lines.filter((line) => !line.unavailable);

      setCart(
        usable.map((line, index) => ({
          key: `${line.productId}-${index}-${Date.now()}`,
          productId: line.productId,
          name: line.name,
          unit: line.unit,
          isWeighed: line.isWeighed,
          price: line.price,
          quantity: line.quantity,
        })),
      );

      setShowParked(false);
      await loadParked();

      if (gone.length) {
        setError(
          t('parkedItemsGone').replace('{0}', gone.map((l) => l.name).join('، ')),
        );
      }

      refocus();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saleError'));
    }
  }

  async function dropParked(id: string) {
    try {
      await api(`/retail/parked/${id}`, { method: 'DELETE' });
      await loadParked();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saleError'));
    }
  }

  /** تایپ مستقیم مقدار — برای ۲۴ عدد، ۲۴ بار زدن «+» کار نیست. */
  function setQty(key: string, value: number) {
    if (!Number.isFinite(value) || value <= 0) return;

    setCart((prev) =>
      prev.map((line) => (line.key === key ? { ...line, quantity: value } : line)),
    );
  }

  /** تخفیف دستی یک قلم؛ سقفش را سرور تعیین می‌کند. */
  function setLineDiscount(key: string, value: number) {
    setCart((prev) =>
      prev.map((line) =>
        line.key === key
          ? { ...line, manualDiscount: Math.max(0, value || 0) }
          : line,
      ),
    );
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
    // مشتری شناسایی‌شده هم پاک می‌شود: توکن یک‌بارمصرف است و ماندنش یعنی
    // فاکتور بعدی به حساب همان نفر می‌رود.
    setIdentified(null);
    setDiscountCode('');
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

  /**
   * قیمت‌دهی سبد.
   *
   * قیمت پلکانی («۱۰ تا به بالا ارزان‌تر») و تخفیف خودکار فقط سرور را
   * دارند، پس هر بار که سبد عوض می‌شود دوباره پرسیده می‌شود.
   *
   * تأخیر کوتاه لازم است: صندوق‌دار ده قلم را پشت سر هم اسکن می‌کند و
   * بدون آن، ده درخواست پشت هم می‌رود که نهمی‌اش هم بی‌فایده است.
   */
  useEffect(() => {
    if (!cart.length) {
      setQuote(null);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await api<Quote>('/pricing/quote', {
            method: 'POST',
            body: {
              customerId: identified?.customerId,
              code: discountCode || undefined,
              lines: cart.map((line) => ({
                productId: line.productId,
                qty: line.quantity,
              })),
            },
          });
          if (!cancelled) setQuote(result);
        } catch {
          // شکست قیمت‌دهی نباید صندوق را بخواباند: قیمت پایه نمایش داده
          // می‌شود و مبلغ نهایی را در هر حال سرور هنگام ثبت تعیین می‌کند.
          if (!cancelled) setQuote(null);
        }
      })();
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cart, identified, discountCode]);

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
          ...(identified
            ? { customerId: identified.customerId, checkinId: identified.checkinId }
            : {}),
          ...(discountCode ? { discountCode } : {}),
          ...(rationShare > 0 && ration ? { rationAccountId: ration.id } : {}),
          payments,
          // قیمت عمداً فرستاده نمی‌شود: سرور آن را تعیین می‌کند و
          // فرستادنش از اینجا فقط این توهم را می‌ساخت که قابل تغییر است.
          items: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            ...(line.manualDiscount ? { manualDiscount: line.manualDiscount } : {}),
          })),
        },
      });

      setLastSale(sale);
      // پیش از resetSale که سبد را خالی می‌کند
      setLastLines(cart);
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

      {/* کلید سریع — پیش از اسکنر، چون کالای فله بارکد ندارد و
          صندوق‌دار اول سراغ دکمه می‌رود. */}
      {quickGroups.length > 0 && (
        <div className="card" style={{ padding: 12 }}>
          {quickGroups.length > 1 && (
            <div className="lang-pills" style={{ marginBottom: 10 }}>
              {quickGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`lang-pill${quickTab === g.id ? ' active' : ''}`}
                  onClick={() => setQuickTab(g.id)}
                  style={g.color ? { borderColor: g.color } : undefined}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

          <div
            style={{
              display: 'grid',
              // دکمهٔ ۱۱۰ پیکسلی روی تبلت صندوق سه‌تا در ردیف جا می‌شود
              // و با انگشت قابل لمس است — کوچک‌تر یعنی خطای لمس.
              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
              gap: 8,
            }}
          >
            {(quickGroups.find((g) => g.id === quickTab)?.keys ?? []).map((key) => (
              <button
                key={key.id}
                type="button"
                className="quick-key"
                onClick={() => void pressQuickKey(key)}
                style={
                  key.color
                    ? ({
                        '--qk-top': shade(key.color, 14),
                        '--qk-bottom': key.color,
                        '--qk-edge': shade(key.color, -32),
                      } as React.CSSProperties)
                    : undefined
                }
              >
                <span className="qk-name">{key.label ?? key.productName}</span>
                <span className="qk-price">
                  {fa(key.salePrice)}
                  {Number(key.defaultQty) !== 1 ? ` × ${fa(key.defaultQty)}` : ''}
                </span>
              </button>
            ))}

            {(quickGroups.find((g) => g.id === quickTab)?.keys ?? []).length === 0 && (
              <p className="muted" style={{ gridColumn: '1 / -1', margin: 0, fontSize: 13 }}>
                {t('qkGroupEmpty')}
              </p>
            )}
          </div>
        </div>
      )}

      {/* آنچه شنیده شد به چند کالا می‌خورد — انتخاب با صندوق‌دار است */}
      {heard ? (
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>
              «{heard.term}» {heard.qty ? `— ${fa(heard.qty)} عدد` : ''}
            </strong>
            <button type="button" className="ghost" onClick={() => setHeard(null)}>
              {t('cancel')}
            </button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            چند کالا با این نام هست — کدام؟
          </p>
          <div style={{ display: 'grid', gap: 6 }}>
            {heard.options.map((option) => (
              <button
                key={option.id}
                type="button"
                style={{ ...TOUCH_ROW }}
                onClick={async () => {
                  const chosen = heard;
                  const before = qtyInCart(option.id);
                  setHeard(null);
                  await addByCode(option.sku);
                  if (chosen.qty && chosen.qty > 1) {
                    setPendingQty({ productId: option.id, qty: chosen.qty, before });
                  }
                  refocus();
                }}
              >
                {option.name}
                <span className="muted" style={{ fontSize: 12 }}>{option.sku}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

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

        {/* میکروفن هم مثل دوربین: فقط جایی که مرورگر دارد. */}
        {micReady ? (
          <button
            type="button"
            className="ghost"
            onClick={startListening}
            aria-label={listening ? 'در حال شنیدن' : 'افزودن با صدا'}
            title="نام کالا را بگویید — «سه تا نان»"
            style={{
              minWidth: 48,
              background: listening ? 'var(--danger)' : undefined,
              color: listening ? '#fff' : undefined,
            }}
          >
            <Icon name={listening ? 'clock' : 'user'} size={20} />
          </button>
        ) : null}

        {/* دکمهٔ دوربین فقط جایی دیده می‌شود که مرورگر پشتیبانی کند؛
            نمایشِ دکمه‌ای که کار نمی‌کند بدتر از نبودنش است. */}
        {cameraReady ? (
          <button
            type="button"
            className="ghost"
            onClick={() => setScanning(true)}
            aria-label="اسکن با دوربین"
            style={{ minWidth: 48 }}
          >
            <Icon name="pos" size={20} />
          </button>
        ) : null}
      </form>

      {scanning ? (
        <BarcodeScanner
          onScan={(scanned) => {
            void addByCode(scanned);
          }}
          onClose={() => {
            setScanning(false);
            refocus();
          }}
        />
      ) : null}

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
              {cart.map((line, index) => (
                <tr key={line.key}>
                  <td>
                    {line.name}
                    <div className="muted small">{line.unit}</div>

                    {/* تخفیف همین قلم — «این یکی ضربه دیده، کمتر حساب کن».
                        سقفش را سرور تعیین می‌کند؛ اگر شرکت اجازه نداده
                        باشد، ثبت فاکتور با پیام روشن رد می‌شود. */}
                    <label className="line-discount">
                      {t('lineDiscount')}
                      <input
                        type="number"
                        min={0}
                        value={line.manualDiscount || ''}
                        onChange={(event) =>
                          setLineDiscount(line.key, Number(event.target.value))
                        }
                        placeholder="۰"
                      />
                    </label>
                  </td>
                  <td className="qty">
                    <button type="button" onClick={() => changeQty(line.key, line.isWeighed ? -0.1 : -1)}>
                      −
                    </button>
                    {/* تایپ مستقیم: برای ۲۴ عدد، ۲۴ بار زدن «+» کار نیست. */}
                    <input
                      className="qty-input"
                      type="number"
                      inputMode="decimal"
                      min={line.isWeighed ? 0.001 : 1}
                      step={line.isWeighed ? 0.001 : 1}
                      value={line.quantity}
                      onChange={(event) =>
                        setQty(line.key, Number(event.target.value))
                      }
                      onFocus={(event) => event.target.select()}
                      aria-label={t('quantity')}
                    />
                    <button type="button" onClick={() => changeQty(line.key, line.isWeighed ? 0.1 : 1)}>
                      +
                    </button>
                  </td>
                  <td>
                    {fa(quote?.lines[index]?.unitPrice ?? line.price)}
                    {/* قیمت پلکانی: وقتی تعداد از پله رد می‌کند، قیمت
                        واحد پایین می‌آید و صندوق‌دار باید همان را ببیند
                        که مشتری می‌پردازد. */}
                    {quote?.lines[index]?.discountName ? (
                      <div className="muted small">
                        {quote.lines[index].discountName}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    {fa(
                      quote?.lines[index]?.total ?? line.price * line.quantity,
                    )}
                  </td>
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
      {/* سبدهای کنارگذاشته‌شده.
          همیشه دیده می‌شود نه فقط وقتی سبد خالی است: مشتریِ سبد معلق
          ممکن است وسط حسابِ نفر بعد برگردد. */}
      {parked.length > 0 ? (
        <div className="card parked-bar">
          <button
            type="button"
            className="ghost"
            onClick={() => setShowParked((open) => !open)}
          >
            <Icon name="clipboard" size={17} /> {t('parkedCarts')} ({fa(parked.length)})
          </button>

          {showParked ? (
            <div className="parked-list">
              {parked.map((item) => (
                <div key={item.id} className="parked-item">
                  <div>
                    <strong>{item.label ?? '—'}</strong>
                    <div className="muted small">
                      {fa(item.lineCount)} {t('itemWord')}
                      {item.customerName ? ` — ${item.customerName}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => void resumeCart(item.id)}
                    >
                      {t('resumeCart')}
                    </button>
                    <button
                      type="button"
                      className="btn-sm ghost"
                      onClick={() => void dropParked(item.id)}
                      aria-label={t('remove')}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {cart.length > 0 ? (
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>{t('checkout')}</h3>

          <div className="row-between">
            <span>{t('total')}</span>
            <strong>{fa(total)}</strong>
          </div>

          {/* مشتری شناسایی‌شده با QR اپلیکیشن.  اینجا نشان داده می‌شود
              نه در بالای صفحه: صندوق‌دار در لحظهٔ تسویه باید ببیند
              فاکتور به حساب چه کسی می‌رود. */}
          {identified ? (
            <div className="row-between">
              <span>
                {t('identifiedCustomer')}: <strong>{identified.name ?? '—'}</strong>
              </span>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setIdentified(null);
                  setDiscountCode('');
                }}
              >
                {t('removeCustomer')}
              </button>
            </div>
          ) : null}

          <label>
            {t('discountCode')}
            <input
              value={discountCode}
              onChange={(event) =>
                setDiscountCode(event.target.value.toUpperCase())
              }
              placeholder="ABCD2345"
              style={{ letterSpacing: 2, textTransform: 'uppercase' }}
            />
          </label>

          {/* کدی که وارد شده ولی اثری نداشته، باید همان‌جا گفته شود؛
              وگرنه صندوق‌دار به مشتری می‌گوید «اعمال شد» و فاکتور
              چیز دیگری نشان می‌دهد. */}
          {discountCode && quote && quote.codeApplied === false ? (
            <div className="error">{quote.codeError ?? t('codeInvalid')}</div>
          ) : null}

          {autoDiscount > 0 ? (
            <div className="row-between">
              <span>{t('autoDiscount')}</span>
              <strong>−{fa(autoDiscount)}</strong>
            </div>
          ) : null}

          <label>
            {t('discount')}
            <input
              type="number"
              min={0}
              max={Math.max(0, total - autoDiscount)}
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

          <div className="checkout-actions">
            <button type="button" onClick={checkout} disabled={busy || paid < dueAfterRation}>
              {busy ? t('recording') : t('recordSale')}
            </button>

            {/* کنار گذاشتن سبد، نه پاک کردنش.  صندوق‌دار در فروشگاه شلوغ
                این را بیشتر از هر دکمهٔ دیگری می‌زند. */}
            <button type="button" className="ghost" onClick={() => void parkCart()}>
              <Icon name="clipboard" size={17} /> {t('parkCart')}
            </button>
          </div>
        </div>
      ) : null}

      {/* آخرین فاکتور */}
      {lastSale ? (
        <div className="card">
          <div className="row-between">
            <span>
              {t('lastInvoice')}: {lastSale.invoiceNo}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => void print(lastSale, lastLines)}>
                <Icon name="print" size={18} /> {t('printReceipt')}
              </button>

              {/* کشوی پول جدا هم باز می‌شود: برای دادن پول خرد بدون فروش
                  تازه.  فقط وقتی عامل هست، چون بدون آن ممکن نیست. */}
              {agentReady ? (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void openCashDrawer()}
                  aria-label="باز کردن کشوی پول"
                >
                  <Icon name="money" size={18} />
                </button>
              ) : null}
            </div>
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
