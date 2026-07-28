/**
 * چندزبانگی داشبورد — فارسی / English / العربية
 *
 * کلیدها با پیشوند بخش گروه‌بندی شده‌اند (nav.* ، pos.* و…) تا افزودن
 * صفحه جدید ساده بماند. در کامپوننت‌ها از هوک `useI18n()` استفاده کنید،
 * نه از `t()` مستقیم — تا زبان جاری خودکار اعمال شود.
 */

export type Lang = 'fa' | 'en' | 'ar';

export const LANGS: Array<{ code: Lang; label: string }> = [
  { code: 'fa', label: 'فارسی' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
];

type Entry = Record<Lang, string>;

const DICT: Record<string, Entry> = {
  // ─────────────── عمومی ───────────────
  appName: { fa: 'Molido AI', en: 'Molido AI', ar: 'Molido AI' },
  loading: { fa: 'در حال بارگذاری…', en: 'Loading…', ar: 'جارٍ التحميل…' },
  saving: { fa: 'در حال ثبت…', en: 'Saving…', ar: 'جارٍ الحفظ…' },
  save: { fa: 'ثبت', en: 'Save', ar: 'حفظ' },
  delete: { fa: 'حذف', en: 'Delete', ar: 'حذف' },
  search: { fa: 'جستجو', en: 'Search', ar: 'بحث' },
  refresh: { fa: 'به‌روزرسانی', en: 'Refresh', ar: 'تحديث' },
  print: { fa: 'چاپ', en: 'Print', ar: 'طباعة' },
  optional: { fa: 'اختیاری', en: 'Optional', ar: 'اختياري' },
  total: { fa: 'جمع', en: 'Total', ar: 'الإجمالي' },
  amount: { fa: 'مبلغ', en: 'Amount', ar: 'المبلغ' },
  quantity: { fa: 'تعداد', en: 'Qty', ar: 'الكمية' },
  price: { fa: 'قیمت', en: 'Price', ar: 'السعر' },
  discount: { fa: 'تخفیف', en: 'Discount', ar: 'الخصم' },
  tax: { fa: 'مالیات', en: 'Tax', ar: 'الضريبة' },
  status: { fa: 'وضعیت', en: 'Status', ar: 'الحالة' },
  date: { fa: 'تاریخ', en: 'Date', ar: 'التاريخ' },
  actions: { fa: 'عملیات', en: 'Actions', ar: 'إجراءات' },
  product: { fa: 'کالا', en: 'Product', ar: 'المنتج' },
  code: { fa: 'کد', en: 'Code', ar: 'الرمز' },
  note: { fa: 'توضیحات', en: 'Note', ar: 'ملاحظات' },
  warehouse: { fa: 'انبار', en: 'Warehouse', ar: 'المستودع' },
  cashbox: { fa: 'صندوق', en: 'Cash box', ar: 'الصندوق' },
  customer: { fa: 'مشتری', en: 'Customer', ar: 'العميل' },
  supplier: { fa: 'تأمین‌کننده', en: 'Supplier', ar: 'المورّد' },
  phone: { fa: 'تلفن', en: 'Phone', ar: 'الهاتف' },
  name: { fa: 'نام', en: 'Name', ar: 'الاسم' },
  type: { fa: 'نوع', en: 'Type', ar: 'النوع' },
  from: { fa: 'از تاریخ', en: 'From', ar: 'من' },
  to: { fa: 'تا تاریخ', en: 'To', ar: 'إلى' },
  select: { fa: 'انتخاب کنید…', en: 'Select…', ar: 'اختر…' },
  fetchError: {
    fa: 'خطا در دریافت اطلاعات',
    en: 'Failed to load data',
    ar: 'فشل تحميل البيانات',
  },
  actionError: {
    fa: 'خطا در انجام عملیات',
    en: 'Operation failed',
    ar: 'فشلت العملية',
  },
  empty: { fa: 'موردی یافت نشد.', en: 'Nothing found.', ar: 'لا يوجد شيء.' },

  // ─────────────── ورود ───────────────
  loginTitle: { fa: 'ورود به سامانه', en: 'Sign in', ar: 'تسجيل الدخول' },
  loginSubtitle: {
    fa: 'سامانه مدیریت هوشمند کسب‌وکار و شهرداری',
    en: 'Smart business & municipality management',
    ar: 'نظام إدارة ذكي للأعمال والبلدية',
  },
  email: { fa: 'ایمیل', en: 'Email', ar: 'البريد الإلكتروني' },
  password: { fa: 'رمز عبور', en: 'Password', ar: 'كلمة المرور' },
  signIn: { fa: 'ورود', en: 'Sign in', ar: 'دخول' },
  signingIn: { fa: 'در حال ورود…', en: 'Signing in…', ar: 'جارٍ الدخول…' },
  loginError: { fa: 'خطا در ورود', en: 'Login failed', ar: 'فشل تسجيل الدخول' },
  demoHint: {
    fa: 'ورود آزمایشی: admin@molido.ai / admin123',
    en: 'Demo login: admin@molido.ai / admin123',
    ar: 'دخول تجريبي: admin@molido.ai / admin123',
  },
  logout: { fa: 'خروج', en: 'Log out', ar: 'خروج' },
  more: { fa: 'بیشتر', en: 'More', ar: 'المزيد' },
  menu: { fa: 'منو', en: 'Menu', ar: 'القائمة' },
  offlineBar: {
    fa: 'آفلاین — آخرین اطلاعات ذخیره‌شده',
    en: 'Offline — showing last saved data',
    ar: 'غير متصل — آخر بيانات محفوظة',
  },

  // ─────────────── ناوبری ───────────────
  'nav.dashboard': { fa: 'داشبورد', en: 'Dashboard', ar: 'لوحة التحكم' },
  'nav.pos': { fa: 'صندوق', en: 'POS', ar: 'نقطة البيع' },
  'nav.restaurant': { fa: 'رستوران', en: 'Restaurant', ar: 'المطعم' },
  'nav.recipes': { fa: 'رسپی', en: 'Recipes', ar: 'الوصفات' },
  'nav.products': { fa: 'کالاها', en: 'Products', ar: 'المنتجات' },
  'nav.customers': { fa: 'مشتریان', en: 'Customers', ar: 'العملاء' },
  'nav.sales': { fa: 'فروش', en: 'Sales', ar: 'المبيعات' },
  'nav.purchases': { fa: 'ورود کالا', en: 'Purchasing', ar: 'المشتريات' },
  'nav.inventory': { fa: 'انبار', en: 'Inventory', ar: 'المخزون' },
  'nav.returns': { fa: 'مرجوعی', en: 'Returns', ar: 'المرتجعات' },
  'nav.shift': { fa: 'بستن صندوق', en: 'Shift close', ar: 'إغلاق الوردية' },
  'nav.labels': { fa: 'چاپ برچسب', en: 'Labels', ar: 'الملصقات' },
  'nav.treasury': { fa: 'خزانه‌داری', en: 'Treasury', ar: 'الخزينة' },
  'nav.cheques': { fa: 'چک‌ها', en: 'Cheques', ar: 'الشيكات' },
  'nav.expenses': { fa: 'هزینه‌ها', en: 'Expenses', ar: 'المصروفات' },
  'nav.reports': { fa: 'گزارش‌ها', en: 'Reports', ar: 'التقارير' },
  'nav.crm': { fa: 'باشگاه مشتریان', en: 'Customer club', ar: 'نادي العملاء' },
  'nav.assistant': { fa: 'دستیار هوشمند', en: 'AI assistant', ar: 'المساعد الذكي' },

  // ─────────────── داشبورد ───────────────
  dashboardTitle: { fa: 'داشبورد مدیریت', en: 'Dashboard', ar: 'لوحة التحكم' },
  overview: {
    fa: 'نمای کلی امروز',
    en: "Today's overview",
    ar: 'نظرة عامة اليوم',
  },

  // ─────────────── صندوق فروش ───────────────
  'pos.title': { fa: 'صندوق فروش', en: 'Point of sale', ar: 'نقطة البيع' },
  'pos.subtitle': {
    fa: 'سوپرمارکت — اسکن بارکد و پرداخت',
    en: 'Supermarket — scan & pay',
    ar: 'سوبر ماركت — مسح ودفع',
  },
  'pos.scanPlaceholder': {
    fa: 'بارکد را اسکن کنید یا نام کالا را بنویسید…',
    en: 'Scan a barcode or type a product name…',
    ar: 'امسح الباركود أو اكتب اسم المنتج…',
  },
  'pos.hint': {
    fa: 'Enter افزودن • F2 پرداخت • F4 پاک',
    en: 'Enter add • F2 pay • F4 clear',
    ar: 'Enter إضافة • F2 دفع • F4 مسح',
  },
  'pos.cart': { fa: 'سبد خرید', en: 'Cart', ar: 'السلة' },
  'pos.items': { fa: 'قلم', en: 'items', ar: 'صنف' },
  'pos.cartEmpty': {
    fa: 'سبد خالی است. بارکد کالا را اسکن کنید یا از فهرست پایین انتخاب کنید.',
    en: 'Cart is empty. Scan a barcode or pick from the list below.',
    ar: 'السلة فارغة. امسح الباركود أو اختر من القائمة أدناه.',
  },
  'pos.payment': { fa: 'پرداخت', en: 'Payment', ar: 'الدفع' },
  'pos.subtotal': { fa: 'جمع کل', en: 'Subtotal', ar: 'المجموع' },
  'pos.invoiceDiscount': {
    fa: 'تخفیف فاکتور',
    en: 'Invoice discount',
    ar: 'خصم الفاتورة',
  },
  'pos.payable': { fa: 'قابل پرداخت', en: 'Payable', ar: 'المستحق' },
  'pos.received': {
    fa: 'مبلغ دریافتی',
    en: 'Amount received',
    ar: 'المبلغ المستلم',
  },
  'pos.exact': { fa: 'دقیق', en: 'Exact', ar: 'بالضبط' },
  'pos.change': { fa: 'باقی‌مانده مشتری', en: 'Change due', ar: 'الباقي للعميل' },
  'pos.checkout': { fa: 'ثبت فاکتور', en: 'Complete sale', ar: 'إتمام البيع' },
  'pos.clear': { fa: 'پاک کردن سبد', en: 'Clear cart', ar: 'مسح السلة' },
  'pos.products': { fa: 'کالاها', en: 'Products', ar: 'المنتجات' },
  'pos.stock': { fa: 'موجودی', en: 'Stock', ar: 'المخزون' },
  'pos.outOfStock': { fa: 'ناموجود', en: 'Out of stock', ar: 'غير متوفر' },
  'pos.walkIn': { fa: 'مشتری گذری', en: 'Walk-in customer', ar: 'عميل عابر' },
  'pos.taxPercent': { fa: 'مالیات ٪', en: 'Tax %', ar: 'الضريبة ٪' },
  'pos.selectWarehouse': {
    fa: 'ابتدا انبار را انتخاب کنید',
    en: 'Select a warehouse first',
    ar: 'اختر المستودع أولاً',
  },
  'pos.notEnough': {
    fa: 'مبلغ دریافتی کافی نیست',
    en: 'Amount received is not enough',
    ar: 'المبلغ المستلم غير كافٍ',
  },
  'pos.remaining': { fa: 'باقی مانده است', en: 'remaining', ar: 'متبقٍ' },
  'pos.invoiceSaved': {
    fa: 'فاکتور ثبت شد',
    en: 'Invoice saved',
    ar: 'تم حفظ الفاتورة',
  },
  'pos.saveError': {
    fa: 'خطا در ثبت فاکتور',
    en: 'Failed to save invoice',
    ar: 'فشل حفظ الفاتورة',
  },
  'pos.notFoundBarcode': {
    fa: 'کالایی با این بارکد یافت نشد',
    en: 'No product with this barcode',
    ar: 'لا يوجد منتج بهذا الباركود',
  },
  'pos.lastInvoice': { fa: 'آخرین فاکتور', en: 'Last invoice', ar: 'آخر فاتورة' },
  'pos.printReceipt': {
    fa: 'چاپ رسید',
    en: 'Print receipt',
    ar: 'طباعة الإيصال',
  },
  'pos.thanks': {
    fa: 'با تشکر از خرید شما',
    en: 'Thank you for your purchase',
    ar: 'شكراً لتسوقكم',
  },
  'pos.store': { fa: 'فروشگاه', en: 'Store', ar: 'المتجر' },
  'pos.invoice': { fa: 'فاکتور', en: 'Invoice', ar: 'فاتورة' },
  'pos.paid': { fa: 'دریافتی', en: 'Paid', ar: 'المدفوع' },

  'pay.CASH': { fa: 'نقدی', en: 'Cash', ar: 'نقداً' },
  'pay.CARD': { fa: 'کارت‌خوان', en: 'Card', ar: 'بطاقة' },
  'pay.BANK_TRANSFER': {
    fa: 'انتقال بانکی',
    en: 'Bank transfer',
    ar: 'تحويل بنكي',
  },
  'pay.CHEQUE': { fa: 'چک', en: 'Cheque', ar: 'شيك' },
  'pay.ONLINE': { fa: 'آنلاین', en: 'Online', ar: 'إلكتروني' },
  'pay.WALLET': { fa: 'کیف پول', en: 'Wallet', ar: 'محفظة' },

  // ─────────────── ورود کالا ───────────────
  'buy.title': { fa: 'ورود کالا', en: 'Goods receipt', ar: 'إدخال البضائع' },
  'buy.subtitle': {
    fa: 'ثبت خرید از تأمین‌کننده و افزودن به انبار',
    en: 'Record supplier purchases and add to stock',
    ar: 'تسجيل مشتريات المورّد وإضافتها للمخزون',
  },
  'buy.destWarehouse': {
    fa: 'انبار مقصد',
    en: 'Destination warehouse',
    ar: 'مستودع الوجهة',
  },
  'buy.searchPlaceholder': {
    fa: 'بارکد یا نام کالا برای افزودن به فاکتور خرید…',
    en: 'Barcode or product name to add to the purchase…',
    ar: 'باركود أو اسم منتج لإضافته للفاتورة…',
  },
  'buy.lines': { fa: 'اقلام فاکتور', en: 'Purchase lines', ar: 'بنود الفاتورة' },
  'buy.rows': { fa: 'ردیف', en: 'rows', ar: 'صفوف' },
  'buy.noLines': {
    fa: 'کالایی اضافه نشده است.',
    en: 'No items added yet.',
    ar: 'لم تتم إضافة أصناف.',
  },
  'buy.purchasePrice': { fa: 'قیمت خرید', en: 'Cost price', ar: 'سعر الشراء' },
  'buy.summary': { fa: 'جمع فاکتور', en: 'Purchase total', ar: 'إجمالي الفاتورة' },
  'buy.lineTotal': { fa: 'جمع اقلام', en: 'Line total', ar: 'مجموع البنود' },
  'buy.grandTotal': { fa: 'مبلغ کل', en: 'Grand total', ar: 'الإجمالي الكلي' },
  'buy.submit': { fa: 'ثبت فاکتور خرید', en: 'Save purchase', ar: 'حفظ الفاتورة' },
  'buy.recent': {
    fa: 'فاکتورهای خرید اخیر',
    en: 'Recent purchases',
    ar: 'المشتريات الأخيرة',
  },
  'buy.noPurchases': {
    fa: 'فاکتوری ثبت نشده است.',
    en: 'No purchases recorded.',
    ar: 'لا توجد مشتريات.',
  },
  'buy.receive': { fa: 'تأیید دریافت', en: 'Confirm receipt', ar: 'تأكيد الاستلام' },
  'buy.cancel': { fa: 'لغو', en: 'Cancel', ar: 'إلغاء' },
  'buy.saved': {
    fa: 'فاکتور خرید ثبت شد — برای افزودن به موجودی، «تأیید دریافت» بزنید.',
    en: 'Purchase saved — press “Confirm receipt” to add it to stock.',
    ar: 'تم حفظ الفاتورة — اضغط «تأكيد الاستلام» لإضافتها للمخزون.',
  },
  'buy.received': {
    fa: 'کالا دریافت شد و به موجودی انبار اضافه گردید',
    en: 'Goods received and added to stock',
    ar: 'تم استلام البضاعة وإضافتها للمخزون',
  },
  'buy.cancelled': {
    fa: 'فاکتور خرید لغو شد',
    en: 'Purchase cancelled',
    ar: 'تم إلغاء الفاتورة',
  },
  'buy.pickSupplier': {
    fa: 'تأمین‌کننده را انتخاب کنید',
    en: 'Select a supplier',
    ar: 'اختر المورّد',
  },

  'st.DRAFT': { fa: 'پیش‌نویس', en: 'Draft', ar: 'مسودة' },
  'st.PENDING': { fa: 'در انتظار', en: 'Pending', ar: 'معلّق' },
  'st.RECEIVED': { fa: 'دریافت‌شده', en: 'Received', ar: 'مستلم' },
  'st.CANCELLED': { fa: 'لغو شده', en: 'Cancelled', ar: 'ملغى' },
  'st.PAID': { fa: 'پرداخت‌شده', en: 'Paid', ar: 'مدفوع' },
  'st.PARTIAL': { fa: 'پرداخت جزئی', en: 'Partially paid', ar: 'مدفوع جزئياً' },

  // ─────────────── انبار ───────────────
  'inv.title': { fa: 'انبار', en: 'Inventory', ar: 'المخزون' },
  'inv.subtitle': {
    fa: 'موجودی، انبارگردانی و انتقال',
    en: 'Stock, counting and transfers',
    ar: 'المخزون والجرد والتحويلات',
  },
  'inv.itemCount': { fa: 'اقلام انبار', en: 'Stock lines', ar: 'بنود المخزون' },
  'inv.totalQty': { fa: 'مجموع موجودی', en: 'Total quantity', ar: 'إجمالي الكمية' },
  'inv.lowStock': {
    fa: 'زیر حد سفارش',
    en: 'Below reorder point',
    ar: 'تحت حد الطلب',
  },
  'inv.lowStockTitle': {
    fa: 'کالاهای زیر حد سفارش',
    en: 'Products below reorder point',
    ar: 'منتجات تحت حد الطلب',
  },
  'inv.minStock': { fa: 'حد سفارش', en: 'Reorder point', ar: 'حد الطلب' },
  'inv.transfer': {
    fa: 'انتقال بین انبارها',
    en: 'Transfer between warehouses',
    ar: 'التحويل بين المستودعات',
  },
  'inv.fromWh': { fa: 'از انبار', en: 'From', ar: 'من' },
  'inv.toWh': { fa: 'به انبار', en: 'To', ar: 'إلى' },
  'inv.doTransfer': { fa: 'انجام انتقال', en: 'Transfer', ar: 'تحويل' },
  'inv.transferDone': {
    fa: 'انتقال بین انبارها انجام شد',
    en: 'Transfer completed',
    ar: 'تم التحويل',
  },
  'inv.sameWarehouse': {
    fa: 'انبار مبدأ و مقصد نباید یکی باشند',
    en: 'Source and destination must differ',
    ar: 'يجب أن يختلف المصدر عن الوجهة',
  },
  'inv.pickProduct': {
    fa: 'کالا و مقدار انتقال را مشخص کنید',
    en: 'Choose a product and quantity',
    ar: 'اختر المنتج والكمية',
  },
  'inv.counting': { fa: 'انبارگردانی', en: 'Stock count', ar: 'الجرد' },
  'inv.countingHint': {
    fa: 'مقدار شمرده‌شده را وارد کنید؛ اختلاف با موجودی سیستم به عنوان اصلاحیه ثبت می‌شود.',
    en: 'Enter the counted quantity; the difference from system stock is recorded as an adjustment.',
    ar: 'أدخل الكمية المعدودة؛ يُسجَّل الفرق عن مخزون النظام كتسوية.',
  },
  'inv.systemQty': { fa: 'موجودی سیستم', en: 'System qty', ar: 'كمية النظام' },
  'inv.countedQty': { fa: 'شمارش شد', en: 'Counted', ar: 'المعدود' },
  'inv.diff': { fa: 'اختلاف', en: 'Difference', ar: 'الفرق' },
  'inv.applyCount': { fa: 'ثبت اصلاح', en: 'Apply', ar: 'تطبيق' },
  'inv.noDiff': {
    fa: 'اختلافی وجود ندارد.',
    en: 'No difference.',
    ar: 'لا يوجد فرق.',
  },
  'inv.adjusted': { fa: 'اصلاح شد', en: 'adjusted', ar: 'تم التعديل' },
  'inv.searchPlaceholder': {
    fa: 'نام یا کد کالا',
    en: 'Product name or code',
    ar: 'اسم المنتج أو رمزه',
  },
  'inv.none': {
    fa: 'موجودی‌ای یافت نشد.',
    en: 'No stock found.',
    ar: 'لا يوجد مخزون.',
  },

  // ─────────────── مرجوعی ───────────────
  'ret.title': { fa: 'مرجوعی کالا', en: 'Product returns', ar: 'مرتجعات المنتجات' },
  'ret.subtitle': {
    fa: 'ثبت مرجوعی، بازگشت به انبار و بازپرداخت',
    en: 'Record returns, restock and refund',
    ar: 'تسجيل المرتجعات وإعادة التخزين والاسترداد',
  },
  'ret.reason': { fa: 'علت مرجوعی', en: 'Reason', ar: 'السبب' },
  'ret.restockWarehouse': {
    fa: 'انبار بازگشت',
    en: 'Restock warehouse',
    ar: 'مستودع الإرجاع',
  },
  'ret.refundBox': {
    fa: 'صندوق بازپرداخت',
    en: 'Refund cash box',
    ar: 'صندوق الاسترداد',
  },
  'ret.searchPlaceholder': {
    fa: 'بارکد یا نام کالای مرجوعی…',
    en: 'Barcode or name of returned product…',
    ar: 'باركود أو اسم المنتج المرتجع…',
  },
  'ret.lines': { fa: 'اقلام مرجوعی', en: 'Returned items', ar: 'الأصناف المرتجعة' },
  'ret.unitPrice': { fa: 'قیمت واحد', en: 'Unit price', ar: 'سعر الوحدة' },
  'ret.summary': { fa: 'جمع مرجوعی', en: 'Return total', ar: 'إجمالي المرتجع' },
  'ret.submit': { fa: 'ثبت مرجوعی', en: 'Save return', ar: 'حفظ المرتجع' },
  'ret.list': {
    fa: 'مرجوعی‌های ثبت‌شده',
    en: 'Recorded returns',
    ar: 'المرتجعات المسجلة',
  },
  'ret.none': {
    fa: 'مرجوعی‌ای ثبت نشده است.',
    en: 'No returns recorded.',
    ar: 'لا توجد مرتجعات.',
  },
  'ret.no': { fa: 'شماره', en: 'No.', ar: 'الرقم' },
  'ret.restockCol': { fa: 'بازگشت انبار', en: 'Restocked', ar: 'أُعيد للمخزون' },
  'ret.refundCol': { fa: 'بازپرداخت', en: 'Refunded', ar: 'مُسترد' },
  'ret.restock': { fa: 'بازگشت به انبار', en: 'Restock', ar: 'إعادة للمخزون' },
  'ret.refund': { fa: 'بازپرداخت', en: 'Refund', ar: 'استرداد' },
  'ret.complete': { fa: 'تکمیل شده', en: 'Completed', ar: 'مكتمل' },
  'ret.saved': { fa: 'مرجوعی ثبت شد', en: 'Return saved', ar: 'تم حفظ المرتجع' },
  'ret.restocked': {
    fa: 'کالا به انبار برگشت و موجودی افزایش یافت',
    en: 'Items returned to stock',
    ar: 'أُعيدت الأصناف للمخزون',
  },
  'ret.refunded': {
    fa: 'وجه مرجوعی از صندوق بازپرداخت شد',
    en: 'Refund paid from the cash box',
    ar: 'تم الاسترداد من الصندوق',
  },
  'ret.noLines': {
    fa: 'کالایی اضافه نشده است.',
    en: 'No items added yet.',
    ar: 'لم تتم إضافة أصناف.',
  },
  'reason.DEFECTIVE': { fa: 'معیوب', en: 'Defective', ar: 'تالف' },
  'reason.WRONG_ITEM': { fa: 'کالای اشتباه', en: 'Wrong item', ar: 'صنف خاطئ' },
  'reason.CUSTOMER_CHANGE': {
    fa: 'انصراف مشتری',
    en: 'Customer changed mind',
    ar: 'عدول العميل',
  },
  'reason.EXCESS': { fa: 'مازاد', en: 'Excess', ar: 'فائض' },
  'reason.OTHER': { fa: 'سایر', en: 'Other', ar: 'أخرى' },

  // ─────────────── بستن صندوق ───────────────
  'shift.title': { fa: 'بستن صندوق', en: 'Shift close', ar: 'إغلاق الوردية' },
  'shift.subtitle': {
    fa: 'گزارش شیفت و تسویه پایان روز',
    en: 'Shift report and end-of-day settlement',
    ar: 'تقرير الوردية وتسوية نهاية اليوم',
  },
  'shift.invoices': { fa: 'تعداد فاکتور', en: 'Invoices', ar: 'عدد الفواتير' },
  'shift.revenue': { fa: 'جمع فروش', en: 'Total sales', ar: 'إجمالي المبيعات' },
  'shift.discounts': {
    fa: 'جمع تخفیف',
    en: 'Total discounts',
    ar: 'إجمالي الخصومات',
  },
  'shift.returns': { fa: 'مرجوعی', en: 'Returns', ar: 'المرتجعات' },
  'shift.byMethod': {
    fa: 'تفکیک روش پرداخت',
    en: 'Breakdown by payment method',
    ar: 'التفصيل حسب طريقة الدفع',
  },
  'shift.method': { fa: 'روش', en: 'Method', ar: 'الطريقة' },
  'shift.noPayments': {
    fa: 'پرداختی در این بازه ثبت نشده است.',
    en: 'No payments in this period.',
    ar: 'لا مدفوعات في هذه الفترة.',
  },
  'shift.boxes': {
    fa: 'موجودی صندوق‌ها',
    en: 'Cash box balances',
    ar: 'أرصدة الصناديق',
  },
  'shift.settle': { fa: 'تسویه نقدی', en: 'Cash settlement', ar: 'التسوية النقدية' },
  'shift.cashSales': { fa: 'فروش نقدی', en: 'Cash sales', ar: 'المبيعات النقدية' },
  'shift.refunds': {
    fa: 'بازپرداخت مرجوعی',
    en: 'Return refunds',
    ar: 'استردادات المرتجعات',
  },
  'shift.expected': {
    fa: 'باید در صندوق باشد',
    en: 'Expected in drawer',
    ar: 'المتوقع في الصندوق',
  },
  'shift.counted': {
    fa: 'شمارش فیزیکی صندوق',
    en: 'Counted cash',
    ar: 'النقد المعدود',
  },
  'shift.balanced': { fa: 'تراز است', en: 'Balanced', ar: 'متوازن' },
  'shift.over': { fa: 'اضافه صندوق', en: 'Over', ar: 'زيادة' },
  'shift.short': { fa: 'کسری صندوق', en: 'Short', ar: 'عجز' },
  'shift.printReport': {
    fa: 'چاپ گزارش شیفت',
    en: 'Print shift report',
    ar: 'طباعة تقرير الوردية',
  },
  'shift.reportTitle': {
    fa: 'گزارش بستن صندوق',
    en: 'Shift close report',
    ar: 'تقرير إغلاق الوردية',
  },
  'shift.signature': {
    fa: 'امضا صندوق‌دار',
    en: 'Cashier signature',
    ar: 'توقيع أمين الصندوق',
  },
  'shift.export': { fa: 'خروجی CSV', en: 'Export CSV', ar: 'تصدير CSV' },
  'shift.csvError': {
    fa: 'خطا در دریافت فایل CSV',
    en: 'Failed to download CSV',
    ar: 'فشل تنزيل ملف CSV',
  },
  'shift.calculating': {
    fa: 'در حال محاسبه…',
    en: 'Calculating…',
    ar: 'جارٍ الحساب…',
  },

  // ─────────────── برچسب ───────────────
  'lbl.title': { fa: 'چاپ برچسب', en: 'Label printing', ar: 'طباعة الملصقات' },
  'lbl.subtitle': {
    fa: 'برچسب بارکد و قیمت برای قفسه',
    en: 'Barcode and price labels for shelves',
    ar: 'ملصقات الباركود والسعر للرفوف',
  },
  'lbl.searchPlaceholder': {
    fa: 'نام، کد یا بارکد کالا…',
    en: 'Product name, code or barcode…',
    ar: 'اسم المنتج أو رمزه أو الباركود…',
  },
  'lbl.pick': { fa: 'انتخاب کالا', en: 'Choose products', ar: 'اختر المنتجات' },
  'lbl.noBarcode': {
    fa: 'بدون بارکد معتبر',
    en: 'No valid barcode',
    ar: 'لا يوجد باركود صالح',
  },
  'lbl.ready': {
    fa: 'برچسب آماده چاپ',
    en: 'labels ready to print',
    ar: 'ملصقات جاهزة',
  },
  'lbl.printAll': { fa: 'چاپ برچسب‌ها', en: 'Print labels', ar: 'طباعة الملصقات' },
  'lbl.count': { fa: 'تعداد برچسب', en: 'Label count', ar: 'عدد الملصقات' },
  'lbl.preview': { fa: 'پیش‌نمایش', en: 'Preview', ar: 'معاينة' },
  'lbl.barcode': { fa: 'بارکد', en: 'Barcode', ar: 'الباركود' },
  'lbl.currency': { fa: 'ریال', en: 'IRR', ar: 'ريال' },

  // ─────────────── رسپی ───────────────
  'rec.title': { fa: 'رسپی غذاها', en: 'Recipes', ar: 'وصفات الأصناف' },
  'rec.subtitle': {
    fa: 'مواد اولیه هر آیتم منو — پایه کسر خودکار از انبار',
    en: 'Ingredients per menu item — drives automatic stock deduction',
    ar: 'مكوّنات كل صنف — أساس الخصم التلقائي من المخزون',
  },
  'rec.menuItems': { fa: 'آیتم‌های منو', en: 'Menu items', ar: 'أصناف القائمة' },
  'rec.searchItem': { fa: 'جستجوی آیتم…', en: 'Search item…', ar: 'ابحث عن صنف…' },
  'rec.noItems': { fa: 'آیتمی یافت نشد.', en: 'No items found.', ar: 'لا توجد أصناف.' },
  'rec.pickItem': {
    fa: 'برای دیدن یا ویرایش رسپی، یک آیتم منو انتخاب کنید.',
    en: 'Select a menu item to view or edit its recipe.',
    ar: 'اختر صنفاً لعرض أو تعديل وصفته.',
  },
  'rec.recipeOf': { fa: 'رسپی', en: 'Recipe for', ar: 'وصفة' },
  'rec.addIngredient': {
    fa: 'افزودن ماده اولیه — نام یا کد کالا…',
    en: 'Add ingredient — product name or code…',
    ar: 'أضف مكوّناً — اسم المنتج أو رمزه…',
  },
  'rec.loadingRecipe': {
    fa: 'در حال بارگذاری رسپی…',
    en: 'Loading recipe…',
    ar: 'جارٍ تحميل الوصفة…',
  },
  'rec.emptyRecipe': {
    fa: 'رسپی خالی است — هنگام فروش، چیزی از انبار کسر نمی‌شود.',
    en: 'Recipe is empty — nothing will be deducted from stock on sale.',
    ar: 'الوصفة فارغة — لن يُخصم شيء من المخزون عند البيع.',
  },
  'rec.ingredient': { fa: 'ماده اولیه', en: 'Ingredient', ar: 'المكوّن' },
  'rec.unit': { fa: 'واحد', en: 'Unit', ar: 'الوحدة' },
  'rec.waste': { fa: 'ضایعات ٪', en: 'Waste %', ar: 'الهدر ٪' },
  'rec.effective': { fa: 'مصرف واقعی', en: 'Actual usage', ar: 'الاستهلاك الفعلي' },
  'rec.cost': { fa: 'بها', en: 'Cost', ar: 'التكلفة' },
  'rec.totalCost': {
    fa: 'بهای تمام‌شده (با ضایعات)',
    en: 'Total cost (incl. waste)',
    ar: 'التكلفة الكلية (مع الهدر)',
  },
  'rec.salePrice': { fa: 'قیمت فروش', en: 'Sale price', ar: 'سعر البيع' },
  'rec.margin': { fa: 'حاشیه سود', en: 'Margin', ar: 'هامش الربح' },
  'rec.lossWarning': {
    fa: 'بهای مواد از قیمت فروش بیشتر است — این آیتم زیان‌ده است.',
    en: 'Ingredient cost exceeds the sale price — this item loses money.',
    ar: 'تكلفة المكوّنات تفوق سعر البيع — هذا الصنف خاسر.',
  },
  'rec.save': { fa: 'ذخیره رسپی', en: 'Save recipe', ar: 'حفظ الوصفة' },
  'rec.saved': { fa: 'رسپی ذخیره شد', en: 'Recipe saved', ar: 'تم حفظ الوصفة' },

  // ─────────────── خزانه‌داری ───────────────
  'tre.title': { fa: 'خزانه‌داری', en: 'Treasury', ar: 'الخزينة' },
  'tre.subtitle': {
    fa: 'حساب‌ها، واریز و برداشت، انتقال وجه',
    en: 'Accounts, deposits, withdrawals and transfers',
    ar: 'الحسابات والإيداع والسحب والتحويل',
  },
  'tre.accounts': { fa: 'حساب‌ها', en: 'Accounts', ar: 'الحسابات' },
  'tre.accountCount': { fa: 'تعداد حساب', en: 'Accounts', ar: 'عدد الحسابات' },
  'tre.totalBalance': {
    fa: 'مجموع موجودی',
    en: 'Total balance',
    ar: 'إجمالي الرصيد',
  },
  'tre.txCount': { fa: 'گردش ثبت‌شده', en: 'Transactions', ar: 'الحركات' },
  'tre.newAccount': { fa: 'حساب جدید', en: 'New account', ar: 'حساب جديد' },
  'tre.accountName': { fa: 'نام حساب', en: 'Account name', ar: 'اسم الحساب' },
  'tre.bank': { fa: 'بانک', en: 'Bank', ar: 'البنك' },
  'tre.accountNo': { fa: 'شماره حساب', en: 'Account no.', ar: 'رقم الحساب' },
  'tre.balance': { fa: 'موجودی', en: 'Balance', ar: 'الرصيد' },
  'tre.saveAccount': { fa: 'ثبت حساب', en: 'Save account', ar: 'حفظ الحساب' },
  'tre.accountSaved': { fa: 'حساب ساخته شد', en: 'Account created', ar: 'تم إنشاء الحساب' },
  'tre.noAccounts': {
    fa: 'حسابی ثبت نشده است.',
    en: 'No accounts yet.',
    ar: 'لا توجد حسابات.',
  },
  'tre.depositWithdraw': {
    fa: 'واریز و برداشت',
    en: 'Deposit & withdraw',
    ar: 'إيداع وسحب',
  },
  'tre.account': { fa: 'حساب', en: 'Account', ar: 'الحساب' },
  'tre.desc': { fa: 'شرح', en: 'Description', ar: 'الوصف' },
  'tre.saveTx': { fa: 'ثبت گردش', en: 'Save transaction', ar: 'حفظ الحركة' },
  'tre.txSaved': { fa: 'گردش ثبت شد', en: 'Transaction saved', ar: 'تم حفظ الحركة' },
  'tre.transferTitle': {
    fa: 'انتقال بین حساب‌ها',
    en: 'Transfer between accounts',
    ar: 'التحويل بين الحسابات',
  },
  'tre.fromAcc': { fa: 'از حساب', en: 'From account', ar: 'من حساب' },
  'tre.toAcc': { fa: 'به حساب', en: 'To account', ar: 'إلى حساب' },
  'tre.doTransfer': { fa: 'انجام انتقال', en: 'Transfer', ar: 'تحويل' },
  'tre.transferDone': { fa: 'انتقال انجام شد', en: 'Transfer completed', ar: 'تم التحويل' },
  'tre.sameAccount': {
    fa: 'مبدأ و مقصد نباید یکی باشند.',
    en: 'Source and destination must differ.',
    ar: 'يجب أن يختلف المصدر عن الوجهة.',
  },
  'tre.recentTx': { fa: 'گردش اخیر', en: 'Recent transactions', ar: 'الحركات الأخيرة' },
  'tre.noTx': {
    fa: 'گردشی ثبت نشده است.',
    en: 'No transactions yet.',
    ar: 'لا توجد حركات.',
  },
  'acc.BANK': { fa: 'بانکی', en: 'Bank', ar: 'بنكي' },
  'acc.CASH': { fa: 'نقدی', en: 'Cash', ar: 'نقدي' },
  'acc.PETTY_CASH': { fa: 'تنخواه', en: 'Petty cash', ar: 'عهدة نقدية' },
  'tx.DEPOSIT': { fa: 'واریز', en: 'Deposit', ar: 'إيداع' },
  'tx.WITHDRAWAL': { fa: 'برداشت', en: 'Withdrawal', ar: 'سحب' },
  'tx.TRANSFER_IN': { fa: 'انتقال ورودی', en: 'Transfer in', ar: 'تحويل وارد' },
  'tx.TRANSFER_OUT': { fa: 'انتقال خروجی', en: 'Transfer out', ar: 'تحويل صادر' },

  // ─────────────── چک ───────────────
  'chq.title': { fa: 'چک‌ها', en: 'Cheques', ar: 'الشيكات' },
  'chq.subtitle': {
    fa: 'چک دریافتی و پرداختی، سررسید و وصول',
    en: 'Incoming and outgoing cheques, due dates and clearing',
    ar: 'الشيكات الواردة والصادرة والاستحقاق والتحصيل',
  },
  'chq.openReceived': {
    fa: 'چک دریافتی باز',
    en: 'Open incoming',
    ar: 'واردة مفتوحة',
  },
  'chq.openIssued': { fa: 'چک پرداختی باز', en: 'Open outgoing', ar: 'صادرة مفتوحة' },
  'chq.dueSoon': { fa: 'سررسید تا ۷ روز', en: 'Due within 7 days', ar: 'تستحق خلال ٧ أيام' },
  'chq.overdue': { fa: 'سررسید گذشته', en: 'Overdue', ar: 'متأخرة' },
  'chq.bouncedCount': { fa: 'برگشتی', en: 'Bounced', ar: 'مرتجعة' },
  'chq.add': { fa: 'ثبت چک', en: 'Add cheque', ar: 'إضافة شيك' },
  'chq.no': { fa: 'شماره چک', en: 'Cheque no.', ar: 'رقم الشيك' },
  'chq.due': { fa: 'سررسید', en: 'Due date', ar: 'تاريخ الاستحقاق' },
  'chq.owner': { fa: 'صاحب چک', en: 'Cheque owner', ar: 'صاحب الشيك' },
  'chq.list': { fa: 'فهرست چک‌ها', en: 'Cheques', ar: 'قائمة الشيكات' },
  'chq.allStatuses': { fa: 'همه وضعیت‌ها', en: 'All statuses', ar: 'كل الحالات' },
  'chq.none': { fa: 'چکی یافت نشد.', en: 'No cheques found.', ar: 'لا توجد شيكات.' },
  'chq.changeStatus': { fa: 'تغییر وضعیت', en: 'Change status', ar: 'تغيير الحالة' },
  'chq.finished': { fa: 'پایان یافته', en: 'Finalised', ar: 'منتهٍ' },
  'chq.saved': { fa: 'چک ثبت شد', en: 'Cheque saved', ar: 'تم حفظ الشيك' },
  'chq.daysLeft': { fa: 'روز مانده', en: 'days left', ar: 'يوم متبقٍ' },
  'chq.daysPast': { fa: 'روز گذشته', en: 'days overdue', ar: 'يوم تأخير' },
  'chq.today': { fa: 'امروز', en: 'Today', ar: 'اليوم' },
  'chqType.RECEIVED': { fa: 'دریافتی', en: 'Incoming', ar: 'واردة' },
  'chqType.ISSUED': { fa: 'پرداختی', en: 'Outgoing', ar: 'صادرة' },
  'chqSt.REGISTERED': { fa: 'ثبت‌شده', en: 'Registered', ar: 'مسجل' },
  'chqSt.DEPOSITED': { fa: 'به بانک رفته', en: 'Deposited', ar: 'مودع' },
  'chqSt.CLEARED': { fa: 'وصول شده', en: 'Cleared', ar: 'محصّل' },
  'chqSt.BOUNCED': { fa: 'برگشتی', en: 'Bounced', ar: 'مرتجع' },
  'chqSt.RETURNED': { fa: 'عودت‌شده', en: 'Returned', ar: 'معاد' },

  // ─────────────── هزینه ───────────────
  'exp.title': { fa: 'هزینه‌ها', en: 'Expenses', ar: 'المصروفات' },
  'exp.subtitle': {
    fa: 'اجاره، قبض، حقوق و هزینه‌های جاری',
    en: 'Rent, bills, payroll and running costs',
    ar: 'الإيجار والفواتير والرواتب والمصاريف الجارية',
  },
  'exp.thisMonth': { fa: 'هزینه این ماه', en: 'This month', ar: 'هذا الشهر' },
  'exp.totalPaid': { fa: 'مجموع پرداخت‌شده', en: 'Total paid', ar: 'إجمالي المدفوع' },
  'exp.pending': {
    fa: 'در انتظار پرداخت',
    en: 'Awaiting payment',
    ar: 'بانتظار الدفع',
  },
  'exp.add': { fa: 'ثبت هزینه', en: 'Add expense', ar: 'إضافة مصروف' },
  'exp.titleField': { fa: 'عنوان', en: 'Title', ar: 'العنوان' },
  'exp.list': { fa: 'فهرست هزینه‌ها', en: 'Expenses', ar: 'قائمة المصروفات' },
  'exp.none': {
    fa: 'هزینه‌ای ثبت نشده است.',
    en: 'No expenses recorded.',
    ar: 'لا توجد مصروفات.',
  },
  'exp.markPaid': { fa: 'پرداخت شد', en: 'Mark paid', ar: 'تم الدفع' },
  'exp.saved': { fa: 'هزینه ثبت شد', en: 'Expense saved', ar: 'تم حفظ المصروف' },
  'exp.deleted': { fa: 'هزینه حذف شد', en: 'Expense deleted', ar: 'تم حذف المصروف' },
  'expSt.DRAFT': { fa: 'ثبت‌شده', en: 'Recorded', ar: 'مسجل' },
  'expSt.PAID': { fa: 'پرداخت‌شده', en: 'Paid', ar: 'مدفوع' },
  'expSt.CANCELLED': { fa: 'لغو شده', en: 'Cancelled', ar: 'ملغى' },

  // ─────────────── گزارش ───────────────
  'rep.title': { fa: 'گزارش سود و زیان', en: 'Profit & loss', ar: 'الأرباح والخسائر' },
  'rep.subtitle': {
    fa: 'فروش، بهای تمام‌شده، هزینه و سود خالص',
    en: 'Sales, cost of goods, expenses and net profit',
    ar: 'المبيعات وتكلفة البضاعة والمصروفات وصافي الربح',
  },
  'rep.statement': { fa: 'صورت سود و زیان', en: 'Income statement', ar: 'قائمة الدخل' },
  'rep.netSales': { fa: 'فروش خالص', en: 'Net sales', ar: 'صافي المبيعات' },
  'rep.cogs': {
    fa: 'بهای تمام‌شده کالای فروش‌رفته',
    en: 'Cost of goods sold',
    ar: 'تكلفة البضاعة المباعة',
  },
  'rep.grossProfit': { fa: 'سود ناخالص', en: 'Gross profit', ar: 'إجمالي الربح' },
  'rep.opex': {
    fa: 'هزینه‌های جاری (پرداخت‌شده)',
    en: 'Operating expenses (paid)',
    ar: 'المصروفات التشغيلية (المدفوعة)',
  },
  'rep.netProfit': { fa: 'سود خالص', en: 'Net profit', ar: 'صافي الربح' },
  'rep.grossMargin': {
    fa: 'حاشیه سود ناخالص',
    en: 'Gross margin',
    ar: 'هامش الربح الإجمالي',
  },
  'rep.netMargin': {
    fa: 'حاشیه سود خالص',
    en: 'Net margin',
    ar: 'هامش صافي الربح',
  },
  'rep.lossWarning': {
    fa: 'در این بازه زیان‌ده بوده‌اید — هزینه‌ها از سود ناخالص بیشتر است.',
    en: 'You made a loss in this period — expenses exceeded gross profit.',
    ar: 'حققت خسارة في هذه الفترة — المصروفات تفوق إجمالي الربح.',
  },
  'rep.summary': { fa: 'خلاصه', en: 'Summary', ar: 'ملخّص' },
  'rep.avgInvoice': { fa: 'میانگین فاکتور', en: 'Avg. invoice', ar: 'متوسط الفاتورة' },
  'rep.salesDays': { fa: 'روزهای فروش', en: 'Selling days', ar: 'أيام البيع' },
  'rep.avgDaily': { fa: 'میانگین روزانه', en: 'Daily average', ar: 'المتوسط اليومي' },
  'rep.dailySales': { fa: 'فروش روزانه', en: 'Daily sales', ar: 'المبيعات اليومية' },
  'rep.topProducts': {
    fa: 'پرفروش‌ترین کالاها',
    en: 'Best-selling products',
    ar: 'أكثر المنتجات مبيعاً',
  },
  'rep.soldQty': { fa: 'تعداد فروش', en: 'Units sold', ar: 'الكمية المباعة' },
  'rep.revenue': { fa: 'درآمد', en: 'Revenue', ar: 'الإيراد' },
  'rep.noData': {
    fa: 'داده‌ای برای نمایش نیست.',
    en: 'No data to display.',
    ar: 'لا توجد بيانات.',
  },

  // ─────────────── باشگاه مشتریان ───────────────
  'crm.title': { fa: 'باشگاه مشتریان', en: 'Customer club', ar: 'نادي العملاء' },
  'crm.subtitle': {
    fa: 'امتیاز وفاداری، سطح‌بندی و کوپن تخفیف',
    en: 'Loyalty points, tiers and discount coupons',
    ar: 'نقاط الولاء والمستويات وكوبونات الخصم',
  },
  'crm.members': { fa: 'اعضا', en: 'Members', ar: 'الأعضاء' },
  'crm.totalPoints': { fa: 'مجموع امتیاز', en: 'Total points', ar: 'إجمالي النقاط' },
  'crm.points': { fa: 'امتیاز', en: 'Points', ar: 'النقاط' },
  'crm.tier': { fa: 'سطح', en: 'Tier', ar: 'المستوى' },
  'crm.join': { fa: 'عضویت مشتری', en: 'Enrol a customer', ar: 'تسجيل عميل' },
  'crm.saveJoin': { fa: 'ثبت عضویت', en: 'Enrol', ar: 'تسجيل' },
  'crm.joined': {
    fa: 'مشتری عضو باشگاه شد',
    en: 'Customer enrolled',
    ar: 'تم تسجيل العميل',
  },
  'crm.allJoined': {
    fa: 'همه مشتریان عضو باشگاه هستند.',
    en: 'All customers are already members.',
    ar: 'كل العملاء أعضاء بالفعل.',
  },
  'crm.memberList': { fa: 'اعضای باشگاه', en: 'Club members', ar: 'أعضاء النادي' },
  'crm.searchMember': {
    fa: 'جستجوی نام یا تلفن…',
    en: 'Search name or phone…',
    ar: 'ابحث بالاسم أو الهاتف…',
  },
  'crm.noMembers': { fa: 'عضوی یافت نشد.', en: 'No members found.', ar: 'لا يوجد أعضاء.' },
  'crm.changePoints': { fa: 'تغییر امتیاز', en: 'Adjust points', ar: 'تعديل النقاط' },
  'crm.pointsUpdated': {
    fa: 'امتیاز به‌روز شد',
    en: 'Points updated',
    ar: 'تم تحديث النقاط',
  },
  'crm.rule': {
    fa: 'به ازای هر {n} ریال خرید، ۱ امتیاز ثبت می‌شود.',
    en: 'One point is earned for every {n} IRR spent.',
    ar: 'تُمنح نقطة واحدة لكل {n} ريال إنفاق.',
  },
  'crm.newCoupon': {
    fa: 'کوپن تخفیف جدید',
    en: 'New discount coupon',
    ar: 'كوبون خصم جديد',
  },
  'crm.couponCode': { fa: 'کد کوپن', en: 'Coupon code', ar: 'رمز الكوبون' },
  'crm.discountType': { fa: 'نوع تخفیف', en: 'Discount type', ar: 'نوع الخصم' },
  'crm.percent': { fa: 'درصدی', en: 'Percentage', ar: 'نسبة مئوية' },
  'crm.fixed': { fa: 'مبلغ ثابت', en: 'Fixed amount', ar: 'مبلغ ثابت' },
  'crm.percentValue': { fa: 'درصد', en: 'Percent', ar: 'النسبة' },
  'crm.maxUses': {
    fa: 'سقف استفاده (۰ = نامحدود)',
    en: 'Max uses (0 = unlimited)',
    ar: 'حد الاستخدام (٠ = بلا حد)',
  },
  'crm.expires': { fa: 'تاریخ انقضا', en: 'Expiry date', ar: 'تاريخ الانتهاء' },
  'crm.createCoupon': { fa: 'ساخت کوپن', en: 'Create coupon', ar: 'إنشاء كوبون' },
  'crm.couponCreated': { fa: 'کوپن ساخته شد', en: 'Coupon created', ar: 'تم إنشاء الكوبون' },
  'crm.coupons': { fa: 'کوپن‌ها', en: 'Coupons', ar: 'الكوبونات' },
  'crm.noCoupons': {
    fa: 'کوپنی ساخته نشده است.',
    en: 'No coupons yet.',
    ar: 'لا توجد كوبونات.',
  },
  'crm.uses': { fa: 'استفاده', en: 'Uses', ar: 'الاستخدام' },
  'crm.noExpiry': { fa: 'بدون انقضا', en: 'No expiry', ar: 'بلا انتهاء' },
  'crm.active': { fa: 'فعال', en: 'Active', ar: 'نشط' },
  'crm.inactive': { fa: 'غیرفعال', en: 'Inactive', ar: 'غير نشط' },
  'crm.expired': { fa: 'منقضی', en: 'Expired', ar: 'منتهٍ' },
  'crm.exhausted': { fa: 'سقف پر', en: 'Limit reached', ar: 'بلغ الحد' },
  'crm.deactivate': { fa: 'غیرفعال کن', en: 'Deactivate', ar: 'تعطيل' },
  'crm.activate': { fa: 'فعال کن', en: 'Activate', ar: 'تفعيل' },
  'crm.couponToggled': {
    fa: 'وضعیت کوپن تغییر کرد',
    en: 'Coupon status changed',
    ar: 'تغيّرت حالة الكوبون',
  },
  'biz.retail': { fa: 'فروشگاه', en: 'Retail', ar: 'متجر' },
  'biz.restaurant': { fa: 'رستوران', en: 'Restaurant', ar: 'مطعم' },
  'biz.both': { fa: 'هر دو', en: 'Both', ar: 'كلاهما' },

  'tier.BRONZE': { fa: 'برنز', en: 'Bronze', ar: 'برونزي' },
  'tier.SILVER': { fa: 'نقره‌ای', en: 'Silver', ar: 'فضي' },
  'tier.GOLD': { fa: 'طلایی', en: 'Gold', ar: 'ذهبي' },
  'tier.VIP': { fa: 'ویژه', en: 'VIP', ar: 'مميّز' },
};

const STORAGE_KEY = 'molido_lang';

export function getLang(): Lang {
  if (typeof window === 'undefined') {
    return 'fa';
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);

  return stored === 'en' || stored === 'ar' ? stored : 'fa';
}

export function setLangStorage(lang: Lang) {
  window.localStorage.setItem(STORAGE_KEY, lang);
}

export function dirFor(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'en' ? 'ltr' : 'rtl';
}

export function localeFor(lang: Lang): string {
  if (lang === 'en') {
    return 'en-US';
  }

  if (lang === 'ar') {
    return 'ar-EG';
  }

  return 'fa-IR';
}

/**
 * ترجمه یک کلید. `vars` جای‌گذاری `{name}` را انجام می‌دهد.
 * اگر کلید نبود، خودِ کلید برمی‌گردد تا در توسعه فوراً دیده شود.
 */
export function t(
  key: string,
  lang: Lang,
  vars?: Record<string, string | number>,
): string {
  let text = DICT[key]?.[lang] ?? key;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }

  return text;
}

/** کلیدهایی که ترجمه ناقص دارند — برای تست. */
export function missingTranslations(): string[] {
  const missing: string[] = [];

  for (const [key, entry] of Object.entries(DICT)) {
    for (const lang of ['fa', 'en', 'ar'] as Lang[]) {
      if (!entry[lang]) missing.push(`${key}.${lang}`);
    }
  }

  return missing;
}

export const DICT_SIZE = Object.keys(DICT).length;
