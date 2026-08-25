/**
 * حوزه‌های شهرداری — تعریف، نه صفحه.
 *
 * ⚠️ چرا اینجا و نه هجده صفحهٔ جداگانه؟
 *
 *    نگهبانِ `verify-api-reachable` نشان داد ۲۲۴ مسیر از ۶۵۳ هیچ
 *    صفحه‌ای صدایشان نمی‌زند — و بیشترشان ماژول‌های شهرداری‌اند که
 *    هرکدام دقیقاً شش مسیر و سرویسی **سیزده خطی** دارند:
 *    `BaseCrudService` خالص.
 *
 *    موتورِ `[domain]` دقیقاً برای همین ساخته شده بود و هشت حوزه را
 *    می‌گرداند.  افزودنِ این‌ها یعنی هجده رابطِ تازه بدونِ یک خط
 *    کدِ صفحه.
 *
 * ⚠️ ستون‌ها از `schema.generated.ts` خوانده شده‌اند، نه حدس.
 *
 *    هر میدانی که اینجا هست، در آن جدول هم هست.  میدانی که نیست،
 *    یعنی جدول ندارد — نه اینکه فراموش شده.
 */

import type { DomainDef, FieldDef } from './config';

const STATUS = (opts: [string, string][]): FieldDef['options'] =>
  opts.map(([value, label]) => ({ value, label }));

const C = {
  open: '#38bdf8',
  done: '#34d399',
  bad: '#f87171',
  dead: '#94a3b8',
  active: '#a78bfa',
};

export const MUNICIPAL: Record<string, DomainDef> = {
  parking: {
    path: 'parking',
    endpoint: '/parking',
    title: 'پارکینگ',
    titleField: 'name',
    fields: [
      { name: 'name', label: 'نام', kind: 'text', required: true },
      { name: 'address', label: 'نشانی', kind: 'text', inList: true },
      { name: 'capacity', label: 'ظرفیت', kind: 'int', inList: true },
      { name: 'hourlyRate', label: 'نرخ ساعتی', kind: 'num', inList: true },
      { name: 'isActive', label: 'فعال', kind: 'bool', inList: true },
    ],
  },

  'street-lights': {
    path: 'street-lights',
    endpoint: '/street-lights',
    title: 'روشنایی معابر',
    titleField: 'lightCode',
    statusField: 'status',
    statusColors: { OK: C.done, FAULTY: C.bad, REPLACED: C.active },
    fields: [
      { name: 'lightCode', label: 'کد چراغ', kind: 'text', required: true },
      { name: 'address', label: 'نشانی', kind: 'text', inList: true },
      { name: 'zone', label: 'منطقه', kind: 'text', inList: true },
      { name: 'lightType', label: 'نوع', kind: 'text', inList: true },
      { name: 'installDate', label: 'تاریخ نصب', kind: 'date' },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['OK', 'سالم'],
          ['FAULTY', 'خراب'],
          ['REPLACED', 'تعویض‌شده'],
        ]),
      },
    ],
  },

  crisis: {
    path: 'crisis',
    endpoint: '/crisis',
    title: 'مدیریت بحران',
    titleField: 'title',
    statusField: 'status',
    statusColors: { OPEN: C.bad, ONGOING: C.open, RESOLVED: C.done },
    fields: [
      { name: 'title', label: 'عنوان', kind: 'text', required: true },
      { name: 'crisisType', label: 'نوع', kind: 'text', inList: true },
      { name: 'location', label: 'محل', kind: 'text', inList: true },
      // ⚠️ شدت عدد است نه متن: مرتب‌سازی و صافیِ «بحرانی‌ترین‌ها» به
      //    عدد نیاز دارد و با متن ممکن نیست.
      { name: 'severity', label: 'شدت', kind: 'int', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['OPEN', 'باز'],
          ['ONGOING', 'در جریان'],
          ['RESOLVED', 'رفع‌شده'],
        ]),
      },
      { name: 'reportedAt', label: 'زمان گزارش', kind: 'date' },
      { name: 'resolvedAt', label: 'زمان رفع', kind: 'date' },
      { name: 'description', label: 'شرح', kind: 'textarea' },
    ],
  },

  fleet: {
    path: 'fleet',
    endpoint: '/fleet',
    title: 'ناوگان',
    titleField: 'plateNo',
    statusField: 'status',
    statusColors: { ACTIVE: C.done, REPAIR: C.open, RETIRED: C.dead },
    fields: [
      { name: 'plateNo', label: 'پلاک', kind: 'text', required: true },
      { name: 'name', label: 'نام', kind: 'text', inList: true },
      { name: 'vehicleType', label: 'نوع', kind: 'text', inList: true },
      { name: 'modelYear', label: 'سال', kind: 'int' },
      { name: 'driverName', label: 'راننده', kind: 'text', inList: true },
      // ⚠️ تاریخِ انقضای بیمه و معاینه در فهرست می‌آید: کلِ فایدهٔ این
      //    ماژول همین است که پیش از سررسید دیده شوند.
      { name: 'insuranceExpiry', label: 'انقضای بیمه', kind: 'date', inList: true },
      { name: 'inspectionExpiry', label: 'انقضای معاینه', kind: 'date', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['ACTIVE', 'فعال'],
          ['REPAIR', 'تعمیر'],
          ['RETIRED', 'خارج از رده'],
        ]),
      },
    ],
  },

  taxi: {
    path: 'taxi',
    endpoint: '/taxi',
    title: 'تاکسیرانی',
    titleField: 'licenseNo',
    fields: [
      { name: 'licenseNo', label: 'شماره پروانه', kind: 'text', required: true },
      { name: 'firstName', label: 'نام', kind: 'text', inList: true },
      { name: 'lastName', label: 'نام خانوادگی', kind: 'text', inList: true },
      { name: 'phone', label: 'تلفن', kind: 'text', inList: true },
      { name: 'plateNo', label: 'پلاک', kind: 'text', inList: true },
      { name: 'vehicleModel', label: 'مدل خودرو', kind: 'text' },
      { name: 'licenseExpiry', label: 'انقضای پروانه', kind: 'date', inList: true },
    ],
  },

  iot: {
    path: 'iot',
    endpoint: '/iot',
    title: 'حسگرهای شهری',
    titleField: 'sensorCode',
    statusField: 'status',
    statusColors: { ONLINE: C.done, OFFLINE: C.bad, MAINTENANCE: C.open },
    fields: [
      { name: 'sensorCode', label: 'کد حسگر', kind: 'text', required: true },
      { name: 'name', label: 'نام', kind: 'text', inList: true },
      { name: 'kind', label: 'نوع', kind: 'text', inList: true },
      { name: 'location', label: 'محل', kind: 'text', inList: true },
      { name: 'lat', label: 'عرض جغرافیایی', kind: 'num' },
      { name: 'lng', label: 'طول جغرافیایی', kind: 'num' },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['ONLINE', 'متصل'],
          ['OFFLINE', 'قطع'],
          ['MAINTENANCE', 'تعمیر'],
        ]),
      },
    ],
  },

  letters: {
    path: 'letters',
    endpoint: '/letters',
    title: 'مکاتبات',
    titleField: 'subject',
    fields: [
      { name: 'indicatorNo', label: 'شماره اندیکاتور', kind: 'text', required: true },
      {
        name: 'direction',
        label: 'نوع',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['IN', 'وارده'],
          ['OUT', 'صادره'],
        ]),
      },
      { name: 'subject', label: 'موضوع', kind: 'text', required: true, inList: true },
      { name: 'fromEntity', label: 'از', kind: 'text', inList: true },
      { name: 'toEntity', label: 'به', kind: 'text', inList: true },
      { name: 'letterDate', label: 'تاریخ نامه', kind: 'date', inList: true },
      { name: 'referredTo', label: 'ارجاع به', kind: 'text' },
    ],
  },

  'municipal-properties': {
    path: 'municipal-properties',
    endpoint: '/municipal-properties',
    title: 'املاک شهرداری',
    titleField: 'name',
    statusField: 'status',
    statusColors: { FREE: C.done, RENTED: C.active, DISPUTED: C.bad },
    fields: [
      { name: 'propNo', label: 'شماره ملک', kind: 'text', required: true },
      { name: 'name', label: 'نام', kind: 'text', inList: true },
      { name: 'address', label: 'نشانی', kind: 'text', inList: true },
      { name: 'areaSqm', label: 'مساحت (م.م)', kind: 'num', inList: true },
      {
        name: 'status',
        label: 'وضعیت',
        kind: 'select',
        inList: true,
        options: STATUS([
          ['FREE', 'آزاد'],
          ['RENTED', 'اجاره‌داده‌شده'],
          ['DISPUTED', 'معارض'],
        ]),
      },
      { name: 'monthlyRent', label: 'اجارهٔ ماهانه', kind: 'num', inList: true },
      { name: 'tenantName', label: 'مستأجر', kind: 'text' },
    ],
  },

  'service-zones': {
    path: 'service-zones',
    endpoint: '/service-zones',
    title: 'مناطق خدماتی',
    titleField: 'name',
    fields: [
      { name: 'name', label: 'نام منطقه', kind: 'text', required: true },
      { name: 'kind', label: 'نوع خدمت', kind: 'text', inList: true },
      { name: 'areaSqm', label: 'مساحت (م.م)', kind: 'num' },
      { name: 'contractorName', label: 'پیمانکار', kind: 'text', inList: true },
      { name: 'schedule', label: 'برنامه', kind: 'text', inList: true },
      { name: 'monthlyCost', label: 'هزینهٔ ماهانه', kind: 'num', inList: true },
      { name: 'isActive', label: 'فعال', kind: 'bool', inList: true },
    ],
  },

  'property-audit': {
    path: 'property-audit',
    endpoint: '/property-audit',
    title: 'ممیزی املاک',
    titleField: 'auditNo',
    fields: [
      { name: 'auditNo', label: 'شماره ممیزی', kind: 'text', required: true },
      { name: 'ownerName', label: 'مالک', kind: 'text', inList: true },
      { name: 'address', label: 'نشانی', kind: 'text', inList: true },
      { name: 'areaSqm', label: 'مساحت (م.م)', kind: 'num', inList: true },
      { name: 'zone', label: 'منطقه', kind: 'text', inList: true },
      { name: 'annualTax', label: 'عوارض سالانه', kind: 'num', inList: true },
      { name: 'lastAuditYear', label: 'آخرین ممیزی', kind: 'int', inList: true },
    ],
  },
};
