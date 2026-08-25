/**
 * حوزه‌های عملیاتی و شهریِ باقی‌مانده — تعریف، نه صفحه.
 *
 * ⚠️ چرا اینجا و نه شانزده صفحهٔ جداگانه؟
 *
 *    همان استدلالِ `municipal.ts`.  نگهبانِ `verify-api-reachable`
 *    نشان داد ۱۶۴ مسیر از ۶۵۳ هیچ مصرف‌کنندهٔ وبی ندارند، و بیشترشان
 *    الگوی «شش مسیر» دارند: `BaseCrudService` خالص در سرویسی
 *    **سیزده خطی**.  موتورِ `[domain]` دقیقاً برای همین ساخته شد.
 *
 * ⚠️ ستون‌ها از خودِ پایگاه‌داده خوانده شده‌اند
 *    (`information_schema.columns`)، نه از حدس و نه از سند.
 *
 *    میدانی که اینجا هست، در آن جدول هم هست.  `NOT NULL`ها
 *    `required` شده‌اند تا فرم پیش از رفتن به سرور جلویشان را بگیرد.
 *
 * ⚠️ مقادیرِ وضعیت **در پایگاه‌داده مهار نشده‌اند**.
 *
 *    این ماژول‌ها `@Body() dto: any` می‌گیرند — نه DTO دارند نه
 *    `CHECK`.  تنها استثناها `LeaveRequest` و `DiscountRule` هستند که
 *    قیدِ واقعی دارند و گزینه‌هایشان اینجا عیناً از همان قید آمده.
 *
 *    برای بقیه، گزینه‌ها از `column_default` و معنیِ ماژول ساخته شده‌اند.
 *    یعنی این فهرست **راهنماست، نه ضمانت**: کاربر از رابط نمی‌تواند
 *    مقدارِ دیگری بفرستد، ولی API هنوز هرچه بدهی می‌پذیرد.  بستنِ آن
 *    سمتِ سرور کارِ جداگانه‌ای است.
 *
 * ⚠️ `api-keys` عمداً اینجا نیست.
 *
 *    جدولِ `ApiKey` ستونِ `keyHash` دارد و رابطِ CRUD عمومی همهٔ
 *    ستون‌ها را نشان می‌دهد.  از آن مهم‌تر: کلید باید سمتِ سرور ساخته
 *    شود، نه با فرمِ آزادی که `keyHash` را دستی می‌گیرد.  این ماژول
 *    صفحهٔ اختصاصیِ خودش را لازم دارد.
 */

import type { DomainDef, FieldDef } from './config';

const STATUS = (opts: [string, string][]): FieldDef['options'] =>
  opts.map(([value, label]) => ({ value, label }));

const C = {
  open: '#38bdf8',
  done: '#34d399',
  bad: '#f87171',
  dead: '#94a3b8',
  warn: '#fbbf24',
};

export const OPERATIONS: Record<string, DomainDef> = {
  helpdesk: {
    path: 'helpdesk',
    endpoint: '/helpdesk',
    title: 'هلپ‌دسک',
    titleField: 'subject',
    statusField: 'status',
    statusColors: {
      OPEN: C.open,
      IN_PROGRESS: C.warn,
      RESOLVED: C.done,
      CLOSED: C.dead,
    },
    fields: [
      { name: 'ticketNo', label: 'شمارهٔ تیکت', kind: 'text', required: true, inList: true },
      { name: 'subject', label: 'موضوع', kind: 'text', required: true, inList: true },
      { name: 'category', label: 'دسته', kind: 'text', inList: true },
      {
        name: 'priority',
        label: 'اولویت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['LOW', 'کم'],
          ['MEDIUM', 'متوسط'],
          ['HIGH', 'زیاد'],
          ['URGENT', 'فوری'],
        ]),
      },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['OPEN', 'باز'],
          ['IN_PROGRESS', 'در جریان'],
          ['RESOLVED', 'رفع‌شده'],
          ['CLOSED', 'بسته'],
        ]),
      },
      // ⚠️ در فهرست می‌آید: کلِ فایدهٔ SLA این است که پیش از سررسید دیده شود.
      { name: 'slaHours', label: 'مهلت (ساعت)', kind: 'int', inList: true },
      { name: 'resolvedAt', label: 'زمان رفع', kind: 'date' },
      { name: 'description', label: 'شرح', kind: 'textarea' },
    ],
  },

  projects: {
    path: 'projects',
    endpoint: '/projects',
    title: 'پروژه‌ها',
    titleField: 'title',
    statusField: 'status',
    statusColors: {
      PLANNING: C.dead,
      ACTIVE: C.open,
      ON_HOLD: C.warn,
      DONE: C.done,
      CANCELLED: C.bad,
    },
    fields: [
      { name: 'projectNo', label: 'شمارهٔ پروژه', kind: 'text', required: true, inList: true },
      { name: 'title', label: 'عنوان', kind: 'text', required: true, inList: true },
      { name: 'clientName', label: 'کارفرما', kind: 'text', inList: true },
      { name: 'budget', label: 'بودجه', kind: 'num', required: true, inList: true },
      { name: 'progress', label: 'پیشرفت (٪)', kind: 'int', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['PLANNING', 'برنامه‌ریزی'],
          ['ACTIVE', 'در جریان'],
          ['ON_HOLD', 'متوقف'],
          ['DONE', 'پایان‌یافته'],
          ['CANCELLED', 'لغوشده'],
        ]),
      },
      { name: 'startDate', label: 'شروع', kind: 'date' },
      { name: 'endDate', label: 'پایان', kind: 'date' },
      { name: 'description', label: 'شرح', kind: 'textarea' },
    ],
  },

  'leave-requests': {
    path: 'leave-requests',
    endpoint: '/leave-requests',
    title: 'درخواست مرخصی',
    titleField: 'employeeId',
    statusField: 'status',
    statusColors: {
      PENDING: C.warn,
      APPROVED: C.done,
      REJECTED: C.bad,
      CANCELLED: C.dead,
    },
    fields: [
      { name: 'employeeId', label: 'کارمند', kind: 'text', required: true, inList: true },
      {
        // ⚠️ این گزینه‌ها عیناً از قیدِ `CHECK` جدول‌اند (مهاجرت ۰۱۸)،
        //    نه از حدس.  مقدارِ دیگری خطای پایگاه‌داده می‌دهد.
        name: 'kind',
        label: 'نوع',
        kind: 'select',
        required: true,
        inList: true,
        options: STATUS([
          ['ANNUAL', 'استحقاقی'],
          ['SICK', 'استعلاجی'],
          ['UNPAID', 'بدون حقوق'],
          ['MISSION', 'مأموریت'],
          ['EMERGENCY', 'اضطراری'],
        ]),
      },
      { name: 'startDate', label: 'از تاریخ', kind: 'date', required: true, inList: true },
      { name: 'endDate', label: 'تا تاریخ', kind: 'date', required: true, inList: true },
      { name: 'days', label: 'تعداد روز', kind: 'num', required: true, inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['PENDING', 'در انتظار'],
          ['APPROVED', 'تأییدشده'],
          ['REJECTED', 'ردشده'],
          ['CANCELLED', 'لغوشده'],
        ]),
      },
      { name: 'reason', label: 'دلیل', kind: 'textarea' },
      { name: 'decidedAt', label: 'زمان تصمیم', kind: 'date' },
      { name: 'decisionNote', label: 'یادداشت تصمیم', kind: 'textarea' },
    ],
  },

  approvals: {
    path: 'approvals',
    endpoint: '/approvals',
    title: 'کارتابل تأیید',
    titleField: 'title',
    statusField: 'status',
    statusColors: {
      PENDING: C.warn,
      APPROVED: C.done,
      REJECTED: C.bad,
      CANCELLED: C.dead,
    },
    fields: [
      { name: 'title', label: 'عنوان', kind: 'text', required: true, inList: true },
      { name: 'entityType', label: 'نوع سند', kind: 'text', required: true, inList: true },
      { name: 'entityId', label: 'شناسهٔ سند', kind: 'text' },
      { name: 'amount', label: 'مبلغ', kind: 'num', inList: true },
      { name: 'requestedBy', label: 'درخواست‌کننده', kind: 'text', inList: true },
      { name: 'currentStep', label: 'گام جاری', kind: 'int', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['PENDING', 'در انتظار'],
          ['APPROVED', 'تأییدشده'],
          ['REJECTED', 'ردشده'],
          ['CANCELLED', 'لغوشده'],
        ]),
      },
    ],
  },

  appointments: {
    path: 'appointments',
    endpoint: '/appointments',
    title: 'نوبت‌دهی',
    titleField: 'serviceUnit',
    statusField: 'status',
    statusColors: {
      BOOKED: C.open,
      DONE: C.done,
      NO_SHOW: C.warn,
      CANCELLED: C.bad,
    },
    fields: [
      { name: 'serviceUnit', label: 'واحد خدمت', kind: 'text', required: true, inList: true },
      { name: 'customerId', label: 'مشتری', kind: 'text', inList: true },
      { name: 'appointmentDate', label: 'تاریخ نوبت', kind: 'date', required: true, inList: true },
      { name: 'slot', label: 'بازهٔ زمانی', kind: 'text', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['BOOKED', 'رزروشده'],
          ['DONE', 'انجام‌شده'],
          ['NO_SHOW', 'عدم مراجعه'],
          ['CANCELLED', 'لغوشده'],
        ]),
      },
      { name: 'note', label: 'یادداشت', kind: 'textarea' },
    ],
  },

  'price-levels': {
    path: 'price-levels',
    endpoint: '/price-levels',
    title: 'سطوح قیمت',
    titleField: 'name',
    fields: [
      { name: 'name', label: 'نام', kind: 'text', required: true, inList: true },
      { name: 'description', label: 'شرح', kind: 'textarea', inList: true },
      { name: 'isDefault', label: 'پیش‌فرض', kind: 'bool', inList: true },
    ],
  },

  'discount-rules': {
    path: 'discount-rules',
    endpoint: '/discount-rules',
    title: 'قواعد تخفیف',
    titleField: 'name',
    fields: [
      { name: 'name', label: 'نام', kind: 'text', required: true, inList: true },
      {
        // ⚠️ از قیدِ `CHECK` جدول.  ضمناً برای `PERCENT` مقدار نباید از
        //    ۱۰۰ بیشتر شود — قیدِ دیگری همان را می‌گیرد.
        name: 'kind',
        label: 'نوع',
        kind: 'select',
        required: true,
        inList: true,
        options: STATUS([
          ['PERCENT', 'درصدی'],
          ['AMOUNT', 'مبلغی'],
          ['BUY_X_GET_Y', 'خرید X دریافت Y'],
        ]),
      },
      { name: 'value', label: 'مقدار', kind: 'num', required: true, inList: true },
      { name: 'minQty', label: 'حداقل تعداد', kind: 'int' },
      { name: 'minAmount', label: 'حداقل مبلغ', kind: 'num' },
      { name: 'getQty', label: 'تعداد رایگان', kind: 'int' },
      { name: 'code', label: 'کد تخفیف', kind: 'text', inList: true },
      { name: 'requiresCode', label: 'نیازمند کد', kind: 'bool' },
      { name: 'maxUses', label: 'سقف مصرف', kind: 'int' },
      { name: 'usedCount', label: 'مصرف‌شده', kind: 'int', inList: true },
      { name: 'priority', label: 'اولویت', kind: 'int' },
      { name: 'startsAt', label: 'از تاریخ', kind: 'date', inList: true },
      { name: 'endsAt', label: 'تا تاریخ', kind: 'date', inList: true },
      { name: 'isActive', label: 'فعال', kind: 'bool', inList: true },
    ],
  },

  dms: {
    path: 'dms',
    endpoint: '/dms',
    title: 'پوشه‌های اسناد',
    titleField: 'name',
    fields: [
      { name: 'name', label: 'نام پوشه', kind: 'text', required: true, inList: true },
      { name: 'parentId', label: 'پوشهٔ والد', kind: 'text', inList: true },
    ],
  },

  'business-licenses': {
    path: 'business-licenses',
    endpoint: '/business-licenses',
    title: 'پروانهٔ کسب',
    titleField: 'businessName',
    statusField: 'status',
    statusColors: {
      ACTIVE: C.done,
      EXPIRED: C.warn,
      SUSPENDED: C.bad,
      REVOKED: C.dead,
    },
    fields: [
      { name: 'licenseNo', label: 'شمارهٔ پروانه', kind: 'text', required: true, inList: true },
      { name: 'businessName', label: 'نام کسب', kind: 'text', required: true, inList: true },
      { name: 'ownerName', label: 'مالک', kind: 'text', inList: true },
      { name: 'businessType', label: 'نوع صنف', kind: 'text', inList: true },
      { name: 'phone', label: 'تلفن', kind: 'text' },
      { name: 'address', label: 'نشانی', kind: 'text' },
      { name: 'annualFee', label: 'عوارض سالانه', kind: 'num', required: true, inList: true },
      { name: 'issueDate', label: 'تاریخ صدور', kind: 'date' },
      // ⚠️ انقضا در فهرست می‌آید: هدفِ این ماژول دیدنِ پروانه‌های
      //    نزدیک به سررسید است.
      { name: 'expiryDate', label: 'تاریخ انقضا', kind: 'date', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['ACTIVE', 'معتبر'],
          ['EXPIRED', 'منقضی'],
          ['SUSPENDED', 'تعلیق'],
          ['REVOKED', 'ابطال‌شده'],
        ]),
      },
    ],
  },

  'construction-projects': {
    path: 'construction-projects',
    endpoint: '/construction-projects',
    title: 'پروژه‌های عمرانی',
    titleField: 'title',
    statusField: 'status',
    statusColors: {
      PLANNING: C.dead,
      ACTIVE: C.open,
      ON_HOLD: C.warn,
      DONE: C.done,
      CANCELLED: C.bad,
    },
    fields: [
      { name: 'projectNo', label: 'شمارهٔ پروژه', kind: 'text', required: true, inList: true },
      { name: 'title', label: 'عنوان', kind: 'text', required: true, inList: true },
      { name: 'contractorName', label: 'پیمانکار', kind: 'text', inList: true },
      { name: 'location', label: 'محل', kind: 'text' },
      { name: 'budgetAmount', label: 'بودجه', kind: 'num', required: true, inList: true },
      // ⚠️ دو پیشرفت جداگانه‌اند و باید کنارِ هم دیده شوند: فاصله‌شان
      //    نشانهٔ اصلیِ انحرافِ پروژهٔ عمرانی است.
      { name: 'physicalProgress', label: 'پیشرفت فیزیکی (٪)', kind: 'num', inList: true },
      { name: 'financialProgress', label: 'پیشرفت مالی (٪)', kind: 'num', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['PLANNING', 'برنامه‌ریزی'],
          ['ACTIVE', 'در جریان'],
          ['ON_HOLD', 'متوقف'],
          ['DONE', 'پایان‌یافته'],
          ['CANCELLED', 'لغوشده'],
        ]),
      },
      { name: 'startDate', label: 'شروع', kind: 'date' },
      { name: 'endDate', label: 'پایان', kind: 'date' },
      { name: 'description', label: 'شرح', kind: 'textarea' },
    ],
  },

  'e-city': {
    path: 'e-city',
    endpoint: '/e-city',
    title: 'شهر الکترونیک',
    titleField: 'subject',
    statusField: 'status',
    statusColors: {
      SUBMITTED: C.open,
      IN_PROGRESS: C.warn,
      ANSWERED: C.done,
      REJECTED: C.bad,
      CLOSED: C.dead,
    },
    fields: [
      { name: 'trackingCode', label: 'کد رهگیری', kind: 'text', required: true, inList: true },
      { name: 'subject', label: 'موضوع', kind: 'text', required: true, inList: true },
      { name: 'serviceType', label: 'نوع خدمت', kind: 'text', required: true, inList: true },
      { name: 'citizenId', label: 'شهروند', kind: 'text' },
      { name: 'assignedTo', label: 'ارجاع به', kind: 'text', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['SUBMITTED', 'ثبت‌شده'],
          ['IN_PROGRESS', 'در جریان'],
          ['ANSWERED', 'پاسخ‌داده‌شده'],
          ['REJECTED', 'ردشده'],
          ['CLOSED', 'بسته'],
        ]),
      },
      { name: 'answeredAt', label: 'زمان پاسخ', kind: 'date' },
      { name: 'details', label: 'شرح', kind: 'textarea' },
      { name: 'response', label: 'پاسخ', kind: 'textarea' },
    ],
  },

  council: {
    path: 'council',
    endpoint: '/council',
    title: 'جلسات شورا',
    titleField: 'title',
    statusField: 'status',
    statusColors: {
      SCHEDULED: C.open,
      HELD: C.done,
      CANCELLED: C.bad,
    },
    fields: [
      { name: 'title', label: 'عنوان', kind: 'text', required: true, inList: true },
      { name: 'meetingDate', label: 'تاریخ جلسه', kind: 'date', required: true, inList: true },
      { name: 'location', label: 'محل', kind: 'text', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['SCHEDULED', 'برنامه‌ریزی‌شده'],
          ['HELD', 'برگزارشده'],
          ['CANCELLED', 'لغوشده'],
        ]),
      },
      { name: 'agenda', label: 'دستور جلسه', kind: 'textarea' },
    ],
  },

  cctv: {
    path: 'cctv',
    endpoint: '/cctv',
    title: 'دوربین‌های شهری',
    titleField: 'cameraCode',
    statusField: 'status',
    statusColors: {
      WORKING: C.done,
      FAULTY: C.bad,
      MAINTENANCE: C.warn,
      OFFLINE: C.dead,
    },
    fields: [
      { name: 'cameraCode', label: 'کد دوربین', kind: 'text', required: true, inList: true },
      { name: 'location', label: 'محل', kind: 'text', inList: true },
      { name: 'zone', label: 'منطقه', kind: 'text', inList: true },
      { name: 'streamUrl', label: 'نشانی پخش', kind: 'text' },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['WORKING', 'سالم'],
          ['FAULTY', 'خراب'],
          ['MAINTENANCE', 'تعمیر'],
          ['OFFLINE', 'قطع'],
        ]),
      },
      { name: 'installDate', label: 'تاریخ نصب', kind: 'date' },
    ],
  },

  'utility-meters': {
    path: 'utility-meters',
    endpoint: '/utility-meters',
    title: 'کنتورهای خدماتی',
    titleField: 'meterNo',
    fields: [
      { name: 'meterNo', label: 'شمارهٔ کنتور', kind: 'text', required: true, inList: true },
      {
        name: 'kind',
        label: 'نوع',
        kind: 'select',
        required: true,
        inList: true,
        options: STATUS([
          ['WATER', 'آب'],
          ['POWER', 'برق'],
          ['GAS', 'گاز'],
        ]),
      },
      { name: 'ownerName', label: 'مالک', kind: 'text', inList: true },
      { name: 'address', label: 'نشانی', kind: 'text', inList: true },
    ],
  },

  cemetery: {
    path: 'cemetery',
    endpoint: '/cemetery',
    title: 'آرامستان',
    titleField: 'name',
    fields: [
      { name: 'name', label: 'نام', kind: 'text', required: true, inList: true },
      { name: 'location', label: 'محل', kind: 'text', inList: true },
      { name: 'capacity', label: 'ظرفیت', kind: 'int', required: true, inList: true },
    ],
  },

  clinic: {
    path: 'clinic',
    endpoint: '/clinic',
    title: 'درمانگاه',
    titleField: 'patientName',
    fields: [
      { name: 'patientName', label: 'بیمار', kind: 'text', required: true, inList: true },
      { name: 'employeeId', label: 'کارمند', kind: 'text' },
      { name: 'visitDate', label: 'تاریخ مراجعه', kind: 'date', required: true, inList: true },
      {
        name: 'visitType',
        label: 'نوع مراجعه',
        kind: 'select',
        required: true,
        inList: true,
        options: STATUS([
          ['CHECKUP', 'معاینه'],
          ['EMERGENCY', 'اورژانس'],
          ['FOLLOWUP', 'پیگیری'],
          ['PERIODIC', 'دوره‌ای'],
        ]),
      },
      { name: 'doctorName', label: 'پزشک', kind: 'text', inList: true },
      { name: 'cost', label: 'هزینه', kind: 'num', required: true, inList: true },
      // ⚠️ تشخیص و نسخه در فهرست **نمی‌آیند**: دادهٔ سلامتِ فرد است و
      //    نباید در جدولی که از کنارِ میز دیده می‌شود پخش شود.
      { name: 'diagnosis', label: 'تشخیص', kind: 'textarea' },
      { name: 'prescription', label: 'نسخه', kind: 'textarea' },
      { name: 'note', label: 'یادداشت', kind: 'textarea' },
    ],
  },
};
