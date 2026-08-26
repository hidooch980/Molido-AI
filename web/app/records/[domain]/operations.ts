/**
 * حوزه‌های عملیاتیِ باقی‌مانده — تعریف، نه صفحه.
 *
 * ⚠️ این فایل زمانی شانزده حوزه داشت؛ حالا سه‌تا.
 *
 *    سیزده حوزهٔ دیگر متعلق به گروه‌های `municipal`، `verticals` و
 *    `operations` بودند که به درخواستِ صاحبِ محصول کاملاً حذف شدند
 *    (مهاجرت ۰۵۶).  ماژولِ بک‌اندشان دیگر وجود ندارد، پس تعریفشان
 *    اینجا فقط منویی می‌ساخت که به ۴۰۴ می‌رسید.
 *
 *    سه‌تای مانده به قابلیت‌های ماندگار وصل‌اند: مرخصی به `hr`، و
 *    سطوح قیمت و قواعد تخفیف به `sales`.
 *
 * ⚠️ ستون‌ها از خودِ پایگاه‌داده خوانده شده‌اند
 *    (`information_schema.columns`)، نه از حدس و نه از سند.
 *
 * ⚠️ گزینه‌های `LeaveRequest` و `DiscountRule` عیناً از قیدِ `CHECK`
 *    جدول آمده‌اند — این دو تنها جاهایی‌اند که پایگاه‌داده خودش مهار
 *    می‌کند.
 */

import type { DomainDef, FieldDef } from './config';

const STATUS = (opts: [string, string][]): FieldDef['options'] =>
  opts.map(([value, label]) => ({ value, label }));

const C = {
  done: '#34d399',
  bad: '#f87171',
  dead: '#94a3b8',
  warn: '#fbbf24',
};

export const OPERATIONS: Record<string, DomainDef> = {
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
};
