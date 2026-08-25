/**
 * تعریف حوزه‌های سادهٔ CRUD.
 *
 * ده ماژول باقی‌مانده همگی `BaseCrudService` خالص‌اند: همان پنج مسیر،
 * همان شکل پاسخ، فقط ستون‌های متفاوت.  ساختن ده صفحهٔ جداگانه یعنی ده
 * نسخهٔ تکراری از یک منطق — و ده جا که باید هر اصلاحی تکرار شود.
 *
 * پس یک موتور و ده تعریف.  حوزه‌ای که بعداً منطق خاص پیدا کند (مثل
 * قرارداد که اقساط دارد، یا کارت‌خوان که چرخهٔ وضعیت دارد) صفحهٔ خودش
 * را می‌گیرد؛ این‌جا فقط جایی است که «فهرست، ساخت، ویرایش، حذف» کافی
 * است.
 *
 * ⚠️ ستون‌ها از خودِ طرح دیتابیس گرفته شده‌اند، نه حدس.  هر میدانی که
 *    اینجا نیست، در آن جدول هم نیست.
 */

import { MUNICIPAL } from './municipal';

export type FieldKind = 'text' | 'num' | 'int' | 'date' | 'bool' | 'select' | 'textarea';

export type FieldDef = {
  name: string;
  label: string;
  kind: FieldKind;
  options?: { value: string; label: string }[];
  required?: boolean;
  /** در فهرست نمایش داده شود؟  ستون‌های کم‌اهمیت فقط در فرم می‌آیند. */
  inList?: boolean;
};

export type DomainDef = {
  path: string;
  endpoint: string;
  title: string;
  /** میدانی که عنوان هر رکورد است — تیتر کارت. */
  titleField: string;
  fields: FieldDef[];
  /** میدان وضعیت، اگر دارد: برای رنگ و فیلتر. */
  statusField?: string;
  statusColors?: Record<string, string>;
};

const STATUS = (opts: [string, string][]): FieldDef['options'] =>
  opts.map(([value, label]) => ({ value, label }));

/** رنگ‌های مشترک وضعیت — سبز یعنی تمام‌شده/موفق، نارنجی یعنی در جریان. */
const C = {
  open: '#b45309',
  active: '#1d4ed8',
  done: '#047857',
  dead: '#6b7280',
  bad: '#b91c1c',
};

export const DOMAINS: Record<string, DomainDef> = {
  'customer-tickets': {
    path: 'customer-tickets',
    endpoint: '/customer-tickets',
    title: 'تیکت مشتریان',
    titleField: 'subject',
    statusField: 'status',
    statusColors: {
      OPEN: C.open,
      IN_PROGRESS: C.active,
      RESOLVED: C.done,
      CLOSED: C.dead,
    },
    fields: [
      { name: 'ticketNo', label: 'شمارهٔ تیکت', kind: 'text', required: true, inList: true },
      { name: 'subject', label: 'موضوع', kind: 'text', required: true },
      { name: 'category', label: 'دسته', kind: 'text', inList: true },
      {
        name: 'priority',
        label: 'اولویت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['LOW', 'کم'],
          ['NORMAL', 'عادی'],
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
          ['IN_PROGRESS', 'در حال بررسی'],
          ['RESOLVED', 'حل‌شده'],
          ['CLOSED', 'بسته'],
        ]),
      },
      { name: 'rating', label: 'امتیاز مشتری', kind: 'int' },
    ],
  },

  budget: {
    path: 'budget',
    endpoint: '/budget',
    title: 'بودجه',
    titleField: 'title',
    statusField: 'status',
    statusColors: { DRAFT: C.dead, APPROVED: C.done, CLOSED: C.active },
    fields: [
      { name: 'title', label: 'عنوان', kind: 'text', required: true },
      { name: 'year', label: 'سال', kind: 'int', required: true, inList: true },
      { name: 'department', label: 'واحد', kind: 'text', inList: true },
      { name: 'totalAmount', label: 'مبلغ کل', kind: 'num', inList: true },
      { name: 'spentAmount', label: 'هزینه‌شده', kind: 'num', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['DRAFT', 'پیش‌نویس'],
          ['APPROVED', 'تصویب‌شده'],
          ['CLOSED', 'بسته'],
        ]),
      },
      { name: 'description', label: 'توضیح', kind: 'textarea' },
    ],
  },

  loans: {
    path: 'loans',
    endpoint: '/loans',
    title: 'وام‌ها',
    titleField: 'borrowerName',
    statusField: 'status',
    statusColors: { ACTIVE: C.active, PAID: C.done, OVERDUE: C.bad, DEFAULTED: C.bad },
    fields: [
      { name: 'loanNo', label: 'شمارهٔ وام', kind: 'text', required: true, inList: true },
      { name: 'borrowerName', label: 'وام‌گیرنده', kind: 'text', required: true },
      { name: 'amount', label: 'مبلغ', kind: 'num', required: true, inList: true },
      { name: 'interestRate', label: 'نرخ سود (٪)', kind: 'num', inList: true },
      { name: 'months', label: 'مدت (ماه)', kind: 'int', inList: true },
      { name: 'startDate', label: 'شروع', kind: 'date', required: true, inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['ACTIVE', 'جاری'],
          ['PAID', 'تسویه‌شده'],
          ['OVERDUE', 'معوق'],
          ['DEFAULTED', 'سوخت‌شده'],
        ]),
      },
    ],
  },

  investments: {
    path: 'investments',
    endpoint: '/investments',
    title: 'سرمایه‌گذاری',
    titleField: 'title',
    statusField: 'status',
    statusColors: { ACTIVE: C.active, MATURED: C.done, SOLD: C.dead },
    fields: [
      { name: 'title', label: 'عنوان', kind: 'text', required: true },
      { name: 'kind', label: 'نوع', kind: 'text', inList: true },
      { name: 'principal', label: 'اصل سرمایه', kind: 'num', required: true, inList: true },
      { name: 'currentValue', label: 'ارزش فعلی', kind: 'num', inList: true },
      { name: 'returnRate', label: 'بازده (٪)', kind: 'num', inList: true },
      { name: 'startDate', label: 'شروع', kind: 'date', required: true },
      { name: 'maturityDate', label: 'سررسید', kind: 'date', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['ACTIVE', 'فعال'],
          ['MATURED', 'سررسیدشده'],
          ['SOLD', 'فروخته‌شده'],
        ]),
      },
      { name: 'note', label: 'یادداشت', kind: 'textarea' },
    ],
  },

  training: {
    path: 'training',
    endpoint: '/training',
    title: 'دوره‌های آموزشی',
    titleField: 'title',
    fields: [
      { name: 'title', label: 'عنوان دوره', kind: 'text', required: true },
      { name: 'instructor', label: 'مدرس', kind: 'text', inList: true },
      { name: 'hours', label: 'ساعت', kind: 'int', inList: true },
      { name: 'startDate', label: 'شروع', kind: 'date', inList: true },
      { name: 'endDate', label: 'پایان', kind: 'date', inList: true },
      { name: 'isActive', label: 'فعال', kind: 'bool', inList: true },
    ],
  },

  tenders: {
    path: 'tenders',
    endpoint: '/tenders',
    title: 'مناقصه‌ها',
    titleField: 'title',
    statusField: 'status',
    statusColors: { OPEN: C.open, EVALUATING: C.active, AWARDED: C.done, CANCELLED: C.dead },
    fields: [
      { name: 'tenderNo', label: 'شمارهٔ مناقصه', kind: 'text', required: true, inList: true },
      { name: 'title', label: 'عنوان', kind: 'text', required: true },
      { name: 'kind', label: 'نوع', kind: 'text', inList: true },
      { name: 'baseAmount', label: 'مبلغ پایه', kind: 'num', inList: true },
      { name: 'deadline', label: 'مهلت', kind: 'date', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['OPEN', 'باز'],
          ['EVALUATING', 'در حال ارزیابی'],
          ['AWARDED', 'برنده اعلام شد'],
          ['CANCELLED', 'لغو'],
        ]),
      },
      { name: 'description', label: 'شرح', kind: 'textarea' },
    ],
  },

  surveys: {
    path: 'surveys',
    endpoint: '/surveys',
    title: 'نظرسنجی‌ها',
    titleField: 'title',
    fields: [
      { name: 'title', label: 'عنوان', kind: 'text', required: true },
      { name: 'description', label: 'توضیح', kind: 'textarea' },
      { name: 'isActive', label: 'فعال', kind: 'bool', inList: true },
    ],
  },

  performance: {
    path: 'performance',
    endpoint: '/performance',
    title: 'ارزیابی عملکرد',
    titleField: 'period',
    fields: [
      { name: 'employeeId', label: 'شناسهٔ کارمند', kind: 'text', required: true },
      { name: 'period', label: 'دوره', kind: 'text', required: true, inList: true },
      { name: 'score', label: 'امتیاز', kind: 'num', required: true, inList: true },
      { name: 'reviewerName', label: 'ارزیاب', kind: 'text', inList: true },
      { name: 'suggestedBonus', label: 'پاداش پیشنهادی', kind: 'num', inList: true },
      { name: 'strengths', label: 'نقاط قوت', kind: 'textarea' },
      { name: 'weaknesses', label: 'نقاط ضعف', kind: 'textarea' },
      { name: 'note', label: 'یادداشت', kind: 'textarea' },
    ],
  },

  news: {
    path: 'news',
    endpoint: '/news',
    title: 'اطلاعیه‌ها',
    titleField: 'title',
    statusField: 'status',
    statusColors: { DRAFT: C.dead, PUBLISHED: C.done, ARCHIVED: C.active },
    fields: [
      { name: 'title', label: 'عنوان', kind: 'text', required: true },
      { name: 'category', label: 'دسته', kind: 'text', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['DRAFT', 'پیش‌نویس'],
          ['PUBLISHED', 'منتشرشده'],
          ['ARCHIVED', 'بایگانی'],
        ]),
      },
      { name: 'authorName', label: 'نویسنده', kind: 'text', inList: true },
      { name: 'publishedAt', label: 'تاریخ انتشار', kind: 'date', inList: true },
      { name: 'body', label: 'متن', kind: 'textarea', required: true },
    ],
  },

  'email-campaigns': {
    path: 'email-campaigns',
    endpoint: '/email-campaigns',
    title: 'کمپین ایمیلی',
    titleField: 'title',
    statusField: 'status',
    statusColors: { DRAFT: C.dead, SCHEDULED: C.open, SENT: C.done, CANCELLED: C.bad },
    fields: [
      { name: 'title', label: 'عنوان', kind: 'text', required: true },
      { name: 'subject', label: 'موضوع ایمیل', kind: 'text', required: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['DRAFT', 'پیش‌نویس'],
          ['SCHEDULED', 'زمان‌بندی‌شده'],
          ['SENT', 'ارسال‌شده'],
          ['CANCELLED', 'لغو'],
        ]),
      },
      { name: 'scheduledAt', label: 'زمان ارسال', kind: 'date', inList: true },
      { name: 'sentCount', label: 'ارسال‌شده', kind: 'int', inList: true },
      { name: 'openCount', label: 'بازشده', kind: 'int', inList: true },
      { name: 'clickCount', label: 'کلیک‌شده', kind: 'int', inList: true },
      { name: 'body', label: 'متن', kind: 'textarea', required: true },
    ],
  },
};

/**
 * ⚠️ حوزه‌های شهرداری در فایلِ جدا، ولی در همین نگاشت ادغام می‌شوند.
 *
 *    یک فایلِ هزارخطی که همه‌چیز در آن باشد، پیدا کردنِ یک تعریف را
 *    سخت می‌کند — و این‌ها دسته‌ای مستقل‌اند که با هم عوض می‌شوند.
 */
Object.assign(DOMAINS, MUNICIPAL);
