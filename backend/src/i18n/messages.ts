/**
 * زیرساخت چندزبانه (i18n)
 *
 * زبان پیش‌فرض سیستم فارسی است. مترجم پیام‌ها بر اساس متن فارسی
 * پیام را به انگلیسی یا عربی برمی‌گرداند.
 *
 * انتخاب زبان در هر درخواست:
 *   1. پارامتر کوئری  ?lang=en
 *   2. هدر  x-lang: ar
 *   3. هدر  Accept-Language
 */

export const SUPPORTED_LANGS = ['fa', 'en', 'ar'] as const;

export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

type Translation = { en: string; ar: string };

export const MESSAGES: Record<string, Translation> = {
  'حساب خزانه یافت نشد': {
    en: 'Treasury account not found',
    ar: 'لم يتم العثور على حساب الخزينة',
  },
  'موجودی حساب کافی نیست': {
    en: 'Insufficient account balance',
    ar: 'رصيد الحساب غير كافٍ',
  },
  'حساب مبدأ و مقصد نباید یکسان باشند': {
    en: 'Source and destination accounts must be different',
    ar: 'يجب أن يختلف حساب المصدر عن حساب الوجهة',
  },
  'قرارداد یافت نشد': {
    en: 'Contract not found',
    ar: 'لم يتم العثور على العقد',
  },
  'شماره قرارداد تکراری است': {
    en: 'Contract number already exists',
    ar: 'رقم العقد مكرر',
  },
  'قسط قرارداد یافت نشد': {
    en: 'Contract payment not found',
    ar: 'لم يتم العثور على دفعة العقد',
  },
  'کارمند یافت نشد': {
    en: 'Employee not found',
    ar: 'لم يتم العثور على الموظف',
  },
  'شماره پرسنلی تکراری است': {
    en: 'Employee number already exists',
    ar: 'الرقم الوظيفي مكرر',
  },
  'فیش حقوقی یافت نشد': {
    en: 'Payroll slip not found',
    ar: 'لم يتم العثور على قسيمة الراتب',
  },
  'فیش حقوقی این دوره قبلاً صادر شده است': {
    en: 'A payroll slip already exists for this period',
    ar: 'قسيمة الراتب لهذه الفترة موجودة بالفعل',
  },
  'خالص پرداختی نمی‌تواند منفی باشد': {
    en: 'Net pay cannot be negative',
    ar: 'لا يمكن أن يكون صافي الراتب سالبًا',
  },
  'فقط فیش پیش‌نویس قابل تأیید است': {
    en: 'Only draft slips can be approved',
    ar: 'يمكن اعتماد المسودات فقط',
  },
  'فقط فیش تأییدشده قابل پرداخت است': {
    en: 'Only approved slips can be paid',
    ar: 'يمكن دفع القسائم المعتمدة فقط',
  },
  'آتش‌نشان یافت نشد': {
    en: 'Firefighter not found',
    ar: 'لم يتم العثور على رجل الإطفاء',
  },
  'انبار مبدأ و مقصد یکسان است': {
    en: 'Source and destination warehouses are the same',
    ar: 'المستودع المصدر والوجهة متطابقان',
  },
  'انبار یافت نشد': {
    en: 'Warehouse not found',
    ar: 'لم يتم العثور على المستودع',
  },
  'ایستگاه آتش‌نشانی یافت نشد': {
    en: 'Fire station not found',
    ar: 'لم يتم العثور على محطة الإطفاء',
  },
  'ایمیل یا رمز عبور اشتباه است': {
    en: 'Invalid email or password',
    ar: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  },
  'این حادثه قبلاً بسته شده است': {
    en: 'This incident is already closed',
    ar: 'هذه الحادثة مغلقة بالفعل',
  },
  'این فاکتور قبلاً دریافت شده است': {
    en: 'This invoice has already been received',
    ar: 'تم استلام هذه الفاتورة بالفعل',
  },
  'این فاکتور مانده‌ای برای تقسیط ندارد': {
    en: 'This invoice has no remaining balance to split into installments',
    ar: 'لا يوجد رصيد متبقٍ لهذه الفاتورة للتقسيط',
  },
  'این فیش قبلاً پرداخت شده است': {
    en: 'This bill has already been paid',
    ar: 'تم دفع هذه الفاتورة بالفعل',
  },
  'این قسط قبلاً پرداخت شده است': {
    en: 'This installment has already been paid',
    ar: 'تم دفع هذا القسط بالفعل',
  },
  'برای این فاکتور قبلاً اقساط تعریف شده است': {
    en: 'Installments have already been defined for this invoice',
    ar: 'تم تعريف أقساط لهذه الفاتورة بالفعل',
  },
  'برای فاکتور لغوشده نمی‌توان قسط تعریف کرد': {
    en: 'Cannot define installments for a cancelled invoice',
    ar: 'لا يمكن تعريف أقساط لفاتورة ملغاة',
  },
  'برخی کالاها یافت نشدند': {
    en: 'Some products were not found',
    ar: 'لم يتم العثور على بعض المنتجات',
  },
  'تأمین‌کننده یافت نشد': {
    en: 'Supplier not found',
    ar: 'لم يتم العثور على المورد',
  },
  'تعداد اقساط باید بین ۲ تا ۶۰ باشد': {
    en: 'Installment count must be between 2 and 60',
    ar: 'يجب أن يكون عدد الأقساط بين 2 و 60',
  },
  'توکن ارسال نشده است': {
    en: 'Token not provided',
    ar: 'لم يتم إرسال الرمز',
  },
  'توکن نامعتبر یا منقضی شده است': {
    en: 'Invalid or expired token',
    ar: 'الرمز غير صالح أو منتهي الصلاحية',
  },
  'حادثه یافت نشد': {
    en: 'Incident not found',
    ar: 'لم يتم العثور على الحادثة',
  },
  'حساب کاربری شما غیرفعال است': {
    en: 'Your account is inactive',
    ar: 'حسابك غير نشط',
  },
  'حساب یافت نشد': {
    en: 'Account not found',
    ar: 'لم يتم العثور على الحساب',
  },
  'خودرو یافت نشد': {
    en: 'Vehicle not found',
    ar: 'لم يتم العثور على المركبة',
  },
  'دسته‌بندی یافت نشد': {
    en: 'Category not found',
    ar: 'لم يتم العثور على الفئة',
  },
  'رکورد موجودی یافت نشد': {
    en: 'Inventory record not found',
    ar: 'لم يتم العثور على سجل المخزون',
  },
  'شرکت یافت نشد': {
    en: 'Company not found',
    ar: 'لم يتم العثور على الشركة',
  },
  'شماره پایانه (ترمینال) الزامی است': {
    en: 'Terminal number is required',
    ar: 'رقم الجهاز (الطرفية) مطلوب',
  },
  'صندوق مرتبط یافت نشد': {
    en: 'Linked cash box not found',
    ar: 'لم يتم العثور على الصندوق المرتبط',
  },
  'صندوق یافت نشد': {
    en: 'Cash box not found',
    ar: 'لم يتم العثور على الصندوق',
  },
  'فاکتور خرید یافت نشد': {
    en: 'Purchase invoice not found',
    ar: 'لم يتم العثور على فاتورة الشراء',
  },
  'فاکتور فروش یافت نشد': {
    en: 'Sales invoice not found',
    ar: 'لم يتم العثور على فاتورة البيع',
  },
  'فاکتور قبلاً لغو شده است': {
    en: 'Invoice has already been cancelled',
    ar: 'الفاتورة ملغاة بالفعل',
  },
  'فاکتور لغوشده قابل دریافت نیست': {
    en: 'A cancelled invoice cannot be received',
    ar: 'لا يمكن استلام فاتورة ملغاة',
  },
  'فاکتور لغوشده قابل پرداخت نیست': {
    en: 'A cancelled invoice cannot be paid',
    ar: 'لا يمكن دفع فاتورة ملغاة',
  },
  'فاکتور مرتبط یافت نشد': {
    en: 'Related invoice not found',
    ar: 'لم يتم العثور على الفاتورة المرتبطة',
  },
  'فایلی ارسال نشده است': {
    en: 'No file was uploaded',
    ar: 'لم يتم إرسال أي ملف',
  },
  'فیش عوارض یافت نشد': {
    en: 'Municipal bill not found',
    ar: 'لم يتم العثور على فاتورة الرسوم',
  },
  'فیش لغوشده قابل پرداخت نیست': {
    en: 'A cancelled bill cannot be paid',
    ar: 'لا يمكن دفع فاتورة ملغاة',
  },
  'فیش پرداخت‌شده قابل لغو نیست': {
    en: 'A paid bill cannot be cancelled',
    ar: 'لا يمكن إلغاء فاتورة مدفوعة',
  },
  'قسط یافت نشد': {
    en: 'Installment not found',
    ar: 'لم يتم العثور على القسط',
  },
  'مبلغ باید بزرگ‌تر از صفر باشد': {
    en: 'Amount must be greater than zero',
    ar: 'يجب أن يكون المبلغ أكبر من الصفر',
  },
  'مبلغ جریمه باید بزرگ‌تر از صفر باشد': {
    en: 'Fine amount must be greater than zero',
    ar: 'يجب أن يكون مبلغ الغرامة أكبر من الصفر',
  },
  'مبلغ فاکتور نامعتبر است': {
    en: 'Invalid invoice amount',
    ar: 'مبلغ الفاتورة غير صالح',
  },
  'مبلغ فیش باید بزرگ‌تر از صفر باشد': {
    en: 'Bill amount must be greater than zero',
    ar: 'يجب أن يكون مبلغ الفاتورة أكبر من الصفر',
  },
  'مبلغ پرداخت باید بزرگ‌تر از صفر باشد': {
    en: 'Payment amount must be greater than zero',
    ar: 'يجب أن يكون مبلغ الدفع أكبر من الصفر',
  },
  'مبلغ چک باید بزرگ‌تر از صفر باشد': {
    en: 'Cheque amount must be greater than zero',
    ar: 'يجب أن يكون مبلغ الشيك أكبر من الصفر',
  },
  'مشتری یافت نشد': {
    en: 'Customer not found',
    ar: 'لم يتم العثور على العميل',
  },
  'مقدار انتقال باید بزرگ‌تر از صفر باشد': {
    en: 'Transfer quantity must be greater than zero',
    ar: 'يجب أن تكون كمية النقل أكبر من الصفر',
  },
  'موجودی انبار مبدأ کافی نیست': {
    en: 'Insufficient stock in source warehouse',
    ar: 'المخزون في المستودع المصدر غير كافٍ',
  },
  'موجودی صندوق کافی نیست': {
    en: 'Insufficient cash box balance',
    ar: 'رصيد الصندوق غير كافٍ',
  },
  'موجودی نمی‌تواند منفی شود': {
    en: 'Stock cannot become negative',
    ar: 'لا يمكن أن يصبح المخزون سالباً',
  },
  'نام بانک الزامی است': {
    en: 'Bank name is required',
    ar: 'اسم البنك مطلوب',
  },
  'نام و کد انبار الزامی است': {
    en: 'Warehouse name and code are required',
    ar: 'اسم المستودع ورمزه مطلوبان',
  },
  'نام واحد مقصد الزامی است': {
    en: 'Destination unit name is required',
    ar: 'اسم الوحدة المقصودة مطلوب',
  },
  'هزینه یافت نشد': {
    en: 'Expense not found',
    ar: 'لم يتم العثور على المصروف',
  },
  'وضعیت نامعتبر است': {
    en: 'Invalid status',
    ar: 'الحالة غير صالحة',
  },
  'پرداخت یافت نشد': {
    en: 'Payment not found',
    ar: 'لم يتم العثور على الدفعة',
  },
  'پروانه ساختمانی یافت نشد': {
    en: 'Building permit not found',
    ar: 'لم يتم العثور على رخصة البناء',
  },
  'پروانه قبلاً صادر شده است': {
    en: 'Permit has already been issued',
    ar: 'تم إصدار الرخصة بالفعل',
  },
  'پروانه مرتبط یافت نشد': {
    en: 'Related permit not found',
    ar: 'لم يتم العثور على الرخصة المرتبطة',
  },
  'پرونده تخلف یافت نشد': {
    en: 'Violation case not found',
    ar: 'لم يتم العثور على ملف المخالفة',
  },
  'پیام شهروندی یافت نشد': {
    en: 'Citizen complaint not found',
    ar: 'لم يتم العثور على بلاغ المواطن',
  },
  'پیوست یافت نشد': {
    en: 'Attachment not found',
    ar: 'لم يتم العثور على المرفق',
  },
  'چک یافت نشد': {
    en: 'Cheque not found',
    ar: 'لم يتم العثور على الشيك',
  },
  'کاربر به شرکتی متصل نیست': {
    en: 'User is not linked to a company',
    ar: 'المستخدم غير مرتبط بأي شركة',
  },
  'کاربر یافت نشد': {
    en: 'User not found',
    ar: 'لم يتم العثور على المستخدم',
  },
  'کاربر یافت نشد یا غیرفعال است': {
    en: 'User not found or inactive',
    ar: 'المستخدم غير موجود أو غير نشط',
  },
  'کاربری با این ایمیل قبلاً ثبت شده است': {
    en: 'A user with this email already exists',
    ar: 'يوجد مستخدم بهذا البريد الإلكتروني بالفعل',
  },
  'کاربری با این ایمیل وجود دارد': {
    en: 'A user with this email already exists',
    ar: 'يوجد مستخدم بهذا البريد الإلكتروني بالفعل',
  },
  'کارت‌خوان یافت نشد': {
    en: 'POS terminal not found',
    ar: 'لم يتم العثور على جهاز نقاط البيع',
  },
  'کالا یافت نشد': {
    en: 'Product not found',
    ar: 'لم يتم العثور على المنتج',
  },
  'کالایی با این SKU وجود دارد': {
    en: 'A product with this SKU already exists',
    ar: 'يوجد منتج بهذا الرمز (SKU) بالفعل',
  },
  'کالایی با این بارکد یافت نشد': {
    en: 'No product found with this barcode',
    ar: 'لم يتم العثور على منتج بهذا الباركود',
  },
  'کد رهگیری نامعتبر است': {
    en: 'Invalid tracking code',
    ar: 'رمز التتبع غير صالح',
  },
};

/**
 * قواعد الگویی برای پیام‌های دارای مقدار پویا (مثل نام کالا یا وضعیت)
 */
const PATTERNS: Array<{
  test: (message: string) => boolean;
  en: string;
  ar: string;
}> = [
  {
    test: (m) => m.startsWith('موجودی کالای'),
    en: 'Insufficient stock for this product',
    ar: 'مخزون هذا المنتج غير كافٍ',
  },
  {
    test: (m) => m.startsWith('تغییر وضعیت از'),
    en: 'This status transition is not allowed',
    ar: 'تغيير الحالة هذا غير مسموح',
  },
  {
    test: (m) => m.startsWith('وضعیت نامعتبر است'),
    en: 'Invalid status',
    ar: 'الحالة غير صالحة',
  },
  {
    test: (m) => m.startsWith('نوع کارت‌خوان'),
    en: 'POS type must be FIXED or MOBILE',
    ar: 'يجب أن يكون نوع الجهاز FIXED أو MOBILE',
  },
  {
    test: (m) => m.startsWith('شماره گیرنده'),
    en: 'Recipient number and message text are required',
    ar: 'رقم المستلم ونص الرسالة مطلوبان',
  },
  {
    test: (m) => m.includes('قبلاً ثبت شده'),
    en: 'Already registered',
    ar: 'مسجل بالفعل',
  },
  {
    test: (m) => m.includes('یافت نشد'),
    en: 'Not found',
    ar: 'غير موجود',
  },
  {
    test: (m) => m.includes('کافی نیست'),
    en: 'Insufficient',
    ar: 'غير كافٍ',
  },
  {
    test: (m) => m.includes('الزامی است'),
    en: 'Required field is missing',
    ar: 'حقل مطلوب مفقود',
  },
];

export function isSupportedLang(value: unknown): value is SupportedLang {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LANGS as readonly string[]).includes(value)
  );
}

/**
 * تشخیص زبان درخواست: ?lang= ← x-lang ← Accept-Language ← فارسی
 */
export function resolveLang(request: {
  query?: Record<string, unknown>;
  headers?: Record<string, unknown>;
}): SupportedLang {
  const queryLang = request?.query?.['lang'];

  if (isSupportedLang(queryLang)) {
    return queryLang;
  }

  const headerLang = request?.headers?.['x-lang'];

  if (isSupportedLang(headerLang)) {
    return headerLang;
  }

  const acceptLanguage = request?.headers?.['accept-language'];

  if (typeof acceptLanguage === 'string' && acceptLanguage.length >= 2) {
    const primary = acceptLanguage.slice(0, 2).toLowerCase();

    if (isSupportedLang(primary)) {
      return primary;
    }
  }

  return 'fa';
}

/**
 * ترجمه پیام فارسی به زبان مقصد. اگر ترجمه‌ای یافت نشود متن اصلی برمی‌گردد.
 */
export function translateMessage(message: string, lang: string): string {
  if (lang === 'fa' || !message) {
    return message;
  }

  const target: 'en' | 'ar' = lang === 'ar' ? 'ar' : 'en';

  const exact = MESSAGES[message];

  if (exact) {
    return exact[target];
  }

  for (const pattern of PATTERNS) {
    if (pattern.test(message)) {
      return pattern[target];
    }
  }

  return message;
}
