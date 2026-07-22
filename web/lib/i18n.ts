/**
 * چندزبانگی داشبورد — فارسی / English / العربية
 */

export type Lang = 'fa' | 'en' | 'ar';

export const LANGS: Array<{ code: Lang; label: string }> = [
  { code: 'fa', label: 'فارسی' },
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'العربية' },
];

const DICT: Record<string, Record<Lang, string>> = {
  appName: { fa: 'Molido AI', en: 'Molido AI', ar: 'Molido AI' },
  loginTitle: {
    fa: 'ورود به سامانه',
    en: 'Sign in',
    ar: 'تسجيل الدخول',
  },
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
  dashboardTitle: { fa: 'داشبورد مدیریت', en: 'Dashboard', ar: 'لوحة التحكم' },
  overview: { fa: 'نمای کلی امروز', en: "Today's overview", ar: 'نظرة عامة اليوم' },
  logout: { fa: 'خروج', en: 'Log out', ar: 'خروج' },
  loading: { fa: 'در حال بارگذاری…', en: 'Loading…', ar: 'جارٍ التحميل…' },
  fetchError: {
    fa: 'خطا در دریافت اطلاعات',
    en: 'Failed to load data',
    ar: 'فشل تحميل البيانات',
  },
  notifications: { fa: 'اعلان‌ها', en: 'Notifications', ar: 'الإشعارات' },
  noNotifications: {
    fa: 'اعلان جدیدی ندارید 🎉',
    en: 'No new notifications 🎉',
    ar: 'لا توجد إشعارات جديدة 🎉',
  },
  todaySales: { fa: 'فروش امروز', en: 'Sales today', ar: 'مبيعات اليوم' },
  monthSales: { fa: 'فروش ماه', en: 'Sales this month', ar: 'مبيعات الشهر' },
  todayInvoices: {
    fa: 'فاکتورهای امروز',
    en: 'Invoices today',
    ar: 'فواتير اليوم',
  },
  monthExpenses: {
    fa: 'هزینه ماه',
    en: 'Expenses this month',
    ar: 'مصروفات الشهر',
  },
  productsCount: { fa: 'کالاها', en: 'Products', ar: 'المنتجات' },
  customersCount: { fa: 'مشتریان', en: 'Customers', ar: 'العملاء' },
  lowStockCount: {
    fa: 'کالاهای رو به اتمام',
    en: 'Low-stock items',
    ar: 'منتجات قليلة المخزون',
  },
  cashBalance: { fa: 'مانده صندوق‌ها', en: 'Cash balance', ar: 'رصيد الصناديق' },
  menuDashboard: { fa: 'داشبورد', en: 'Dashboard', ar: 'لوحة التحكم' },
  menuSales: { fa: 'فروش', en: 'Sales', ar: 'المبيعات' },
  menuProducts: { fa: 'کالاها', en: 'Products', ar: 'المنتجات' },
  menuCustomers: { fa: 'مشتریان', en: 'Customers', ar: 'العملاء' },
  menuPos: { fa: 'کارت‌خوان‌ها', en: 'POS terminals', ar: 'أجهزة الدفع' },
  menuMunicipality: { fa: 'شهرداری', en: 'Municipality', ar: 'البلدية' },
  menuReports: { fa: 'گزارش‌ها', en: 'Reports', ar: 'التقارير' },
  comingSoon: { fa: 'به‌زودی', en: 'Soon', ar: 'قريباً' },
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

export function t(key: string, lang: Lang): string {
  return DICT[key]?.[lang] ?? key;
}
