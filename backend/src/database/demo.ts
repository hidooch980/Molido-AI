/**
 * دادهٔ نمونه برای تست‌درایو.
 *
 * اجرا:  npm run demo          (یا  bash ops/demo-data.sh)
 *
 * ---------- چرا جدا از `seed.ts` ----------
 *
 * ⚠️ `seed` فیکسچرِ **آزمون‌ها**ست، نه ویترین.
 *
 *    ده‌ها مجموعهٔ آزمون روی `seed-p1`, `seed-warehouse` و موجودی‌شان
 *    حساب باز کرده‌اند.  یک بار دستکاریِ `seed-p3` شش سنجهٔ
 *    `e2e-cycles` را یک‌جا قرمز کرد، با پیام‌هایی که هیچ اشاره‌ای به
 *    علت نداشتند.
 *
 *    پس دادهٔ نمایشی هرگز به `seed` اضافه نمی‌شود.  این فایل
 *    شناسه‌های `demo-*` می‌سازد که هیچ آزمونی نمی‌شناسدشان.
 *
 * ---------- چه چیزی را نشان می‌دهد ----------
 *
 * ⚠️ فقط ماژول‌هایی که **تازه‌اند و خالی باز می‌شوند**.
 *
 *    صفحه‌ای که با جدولِ خالی باز شود، در تست‌درایو «کار نمی‌کند» به
 *    نظر می‌رسد — حتی وقتی کاملاً سالم است.  کالا و فروش از قبل
 *    دادهٔ seed دارند و این‌جا دست نمی‌خورند.
 *
 * ---------- بی‌خطر بودن ----------
 *
 * ⚠️ هر درج `ON CONFLICT DO NOTHING` روی شناسهٔ ثابت است، پس اجرای
 *    دوباره چیزی را دو برابر نمی‌کند.
 *
 * ⚠️ و **هیچ سندِ حسابداری نمی‌زند**.
 *
 *    وسوسه بود که فروشِ نمونه هم بسازد تا نمودارها پر شوند.  ولی سندِ
 *    نمایشی در دفتر کل، همان دفتری است که بعداً اظهارِ مالیاتی از آن
 *    درمی‌آید — و تشخیصِ «این سند نمایشی بود» چند ماه بعد ممکن نیست.
 *    داده‌های این‌جا همه **تعریف**اند: سند، الگو، یادآوری، امانی.
 */
import process from 'node:process';
import { Pool } from 'pg';

import { adminDatabaseConfig } from './connection';

const CO = 'seed-company';

/** لحظهٔ اجرا؛ تاریخ‌های نسبی از این ساخته می‌شوند. */
const NOW = new Date();

/** تاریخِ نسبی به قالبِ `YYYY-MM-DD`. */
function day(offset: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const pool = new Pool(adminDatabaseConfig());
  const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);

  try {
    // ⚠️ اگر شرکتِ نمونه نباشد، `seed` هنوز اجرا نشده.
    //
    //    بدونِ این بررسی، هر درج با خطای کلیدِ خارجی می‌شکند و پیام‌ها
    //    دربارهٔ `companyId` است، نه دربارهٔ «اول seed را اجرا کن».
    const company = await q('SELECT 1 FROM "Company" WHERE id = $1', [CO]);
    if (company.rowCount === 0) {
      console.error('✗ شرکتِ نمونه نیست؛ اول `npm run seed` را اجرا کنید');
      process.exit(1);
    }

    let made = 0;
    const step = async (label: string, sql: string, params: unknown[] = []) => {
      const result = await q(sql, params);
      if (result.rowCount) made += result.rowCount;
      console.log(`  ${result.rowCount ? '+' : '·'} ${label}`);
    };

    // ─────────────── تأمین‌کننده و مشتریِ حقوقی ───────────────
    //
    // ⚠️ شناسهٔ ملی و کدِ اقتصادی عمداً پر است: گزارشِ فصلیِ مادهٔ ۱۶۹
    //    بدونشان سطرها را «ناقص» نشان می‌دهد و صفحه‌اش بی‌معنا باز
    //    می‌شود.
    await step(
      'تأمین‌کنندهٔ حقوقی (با شناسهٔ ملی)',
      `INSERT INTO "Supplier"
         (id, "companyId", name, phone, "personType", "nationalCode", "economicCode", "createdAt", "updatedAt")
       VALUES ('demo-sup-1', $1, 'پخش سراسری آرمان', '02188001100',
               'LEGAL', '10101234567', '411111111111', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [CO],
    );

    await step(
      'مشتریِ حقوقی (با شناسهٔ ملی)',
      `INSERT INTO "Customer"
         (id, "companyId", "firstName", "lastName", phone, "personType",
          "nationalCode", "economicCode", "createdAt", "updatedAt")
       VALUES ('demo-cus-1', $1, 'فروشگاه زنجیره‌ای', 'مهر', '02177003300',
               'LEGAL', '10987654321', '422222222222', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [CO],
    );

    // ─────────────── کالای امانی ───────────────
    //
    // ⚠️ دو جهت، چون فقط اسمشان شبیه است:
    //      IN  گرفته‌ایم — دستِ ماست، مالِ ما نیست
    //      OUT داده‌ایم  — مالِ ماست، جای دیگری است
    //
    //    نمونهٔ IN از صندوق **فروختنی** است (مهاجرت ۰۸۷)، پس
    //    تست‌درایو می‌تواند واقعاً بفروشدش.
    await step(
      'کالای امانیِ گرفته‌شده (۲۰ عدد، فروختنی از صندوق)',
      `INSERT INTO "Consignment"
         (id, "companyId", direction, "docNo", "supplierId", status, note, "createdAt", "updatedAt")
       VALUES ('demo-cons-in', $1, 'IN', 'AM-IN-1001', 'demo-sup-1', 'OPEN',
               'نمونه — امانی گرفته‌شده از پخش آرمان', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [CO],
    );

    await step(
      '  اقلامِ امانیِ گرفته‌شده',
      `INSERT INTO "ConsignmentItem"
         (id, "companyId", "consignmentId", "productId", quantity, "unitPrice", "createdAt", "updatedAt")
       VALUES ('demo-cons-in-1', $1, 'demo-cons-in', 'seed-p2', 20, 118000, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [CO],
    );

    await step(
      'کالای امانیِ داده‌شده (۵ عدد نزد مشتری)',
      `INSERT INTO "Consignment"
         (id, "companyId", direction, "docNo", "customerId", "warehouseId", status, note, "createdAt", "updatedAt")
       VALUES ('demo-cons-out', $1, 'OUT', 'AM-OUT-2001', 'demo-cus-1',
               'seed-warehouse', 'OPEN', 'نمونه — امانی نزد فروشگاه مهر', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [CO],
    );

    await step(
      '  اقلامِ امانیِ داده‌شده',
      `INSERT INTO "ConsignmentItem"
         (id, "companyId", "consignmentId", "productId", quantity, "unitPrice", "unitCost", "createdAt", "updatedAt")
       VALUES ('demo-cons-out-1', $1, 'demo-cons-out', 'seed-p3', 5, 310000, 250000, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [CO],
    );

    // ─────────────── تنخواه ───────────────
    await step(
      'تنخواهِ اداری (سقف ۵۰ میلیون ریال)',
      `INSERT INTO "PettyCash"
         (id, "companyId", name, ceiling, "isActive", note, "createdAt", "updatedAt")
       VALUES ('demo-petty', $1, 'تنخواه اداری', 50000000, true,
               'نمونه — هزینه‌های خرد دفتر', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [CO],
    );

    // ─────────────── یادآوری ───────────────
    //
    // ⚠️ تاریخ‌ها **نسبی**اند، نه ثابت.
    //
    //    یادآوریِ با تاریخِ ثابت، شش ماه بعد همه‌اش «سررسیدگذشته» است و
    //    صفحه قرمزِ بی‌معنا نشان می‌دهد.  نسبی یعنی هر وقت اجرا شود،
    //    صفحه همان‌قدر معنادار است.
    await step(
      'یادآوری‌ها (سررسیدِ نسبی: دیروز، فردا، هفتهٔ بعد)',
      `INSERT INTO "Reminder" (id, "companyId", title, note, "dueAt", status, "createdAt", "updatedAt")
       VALUES
         ('demo-rem-1', $1, 'پیگیری چک آقای رضایی',
          'چک ۱۵ام سررسید دارد', $2::date, 'PENDING', now(), now()),
         ('demo-rem-2', $1, 'تمدید بیمهٔ آتش‌سوزی انبار',
          'قرارداد سالانه', $3::date, 'PENDING', now(), now()),
         ('demo-rem-3', $1, 'ارسال گزارش فصلی مادهٔ ۱۶۹',
          'مهلت قانونی یک ماه پس از پایان فصل', $4::date, 'PENDING', now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [CO, day(-1), day(1), day(7)],
    );

    // ─────────────── الگوی سند ───────────────
    //
    // ⚠️ `nextRunOn` نسبی است، به همان دلیلِ بالا.
    //
    // ⚠️ `isActive=true` — و نسخهٔ اول `false` گذاشت که **اشتباه بود**.
    //
    //    استدلالم این بود که «الگویی که خودش سند بزند دفتر را شلوغ
    //    می‌کند».  ولی هیچ زمان‌بندی‌ای الگوها را اجرا نمی‌کند؛ اجرا
    //    فقط با دکمهٔ کاربر است.  در عوض `list()` پیش‌فرض فقط فعال‌ها را
    //    می‌دهد — پس الگوی غیرفعال **اصلاً دیده نمی‌شد**.
    //
    //    یعنی نمونه‌ای ساختم که هدفش پر کردنِ صفحه بود و صفحه را خالی
    //    می‌گذاشت.  `nextRunOn` سی روزِ بعد است، پس در فهرستِ «سررسید
    //    رسیده» هم نمی‌آید و کسی را غافلگیر نمی‌کند.
    await step(
      'الگوی سندِ ماهانه (اجرا فقط با دکمهٔ کاربر)',
      `INSERT INTO "JournalTemplate"
         (id, "companyId", title, description, lines, frequency, "nextRunOn", "isActive", "createdAt", "updatedAt")
       VALUES ('demo-tpl-1', $1, 'اجارهٔ ماهانهٔ دفتر',
               'نمونه — هر ماه یک سند یکسان',
               $3::jsonb, 'MONTHLY', $2::date, true, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [
        CO,
        day(30),
        JSON.stringify([
          { accountCode: '6101', debit: 80000000, description: 'هزینهٔ اجاره' },
          { accountCode: '1101', credit: 80000000, description: 'پرداخت نقدی' },
        ]),
      ],
    );

    // ─────────────── گزارش‌ساز ───────────────
    //
    // ⚠️ فهرستِ ستون‌ها باید با `report-datasets.ts` بخواند.
    //    گزارشی که ستونِ ناشناس داشته باشد، در باز شدن خطا می‌دهد —
    //    یعنی نمونه‌ای که بدتر از نبودنش است.
    await step(
      'گزارشِ آمادهٔ «فروش هر صندوق‌دار»',
      `INSERT INTO "ReportDefinition"
         (id, "companyId", name, description, dataset, spec, "isShared", "createdAt", "updatedAt")
       VALUES ('demo-rep-1', $1, 'فروش هر صندوق‌دار',
               'نمونه — گروه‌بندی بر صندوق‌دار با جمعِ مبلغ',
               'sales', $2::jsonb, true, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [
        CO,
        // ⚠️ شکلِ `spec` را `report-builder.service.ts` می‌سنجد و
        //    نسخهٔ اول هر دو نکته را غلط نوشت:
        //
        //      • کلیدِ تجمیع `field` است، نه `column`
        //      • ستونی که تجمیع می‌شود نباید در `columns` هم بیاید،
        //        وگرنه «نه در گروه‌بندی است نه تجمیع شده» می‌گیرد
        //
        //    گزارشِ ذخیره‌شده‌ای که در باز شدن ۴۰۰ بدهد، بدتر از
        //    نبودنش است: کاربر فکر می‌کند گزارش‌ساز خراب است.
        JSON.stringify({
          columns: ['cashier'],
          groupBy: ['cashier'],
          aggregates: [{ field: 'total', fn: 'sum', as: 'جمع فروش' }],
          orderBy: { field: 'cashier', dir: 'asc' },
        }),
      ],
    );

    // ─────────────── چاپ چک ───────────────
    await step(
      'الگوی چاپ چک (بانک ملی)',
      `INSERT INTO "ChequePrintTemplate"
         (id, "companyId", name, "bankName", "widthMm", "heightMm", fields, "isDefault", "createdAt", "updatedAt")
       VALUES ('demo-chq-1', $1, 'چک بانک ملی', 'ملی', 175, 85, $2::jsonb, true, now(), now())
       ON CONFLICT (id) DO NOTHING`,
      [
        CO,
        // ⚠️ شکلش **شیء** است نه آرایه، و کلیدهایش همان‌اند که
        //    `DEFAULT_FIELDS` در `cheque-print.service.ts` دارد.
        //
        //    نسخهٔ اول آرایه نوشت و قیدِ `jsonb_typeof(fields)='object'`
        //    ردش کرد.  نمونه‌ای که با کد نخواند، بدتر از نبودنش است:
        //    صفحه باز می‌شود و در چاپ می‌شکند.
        JSON.stringify({
          date: { x: 132, y: 16, size: 11 },
          amountDigits: { x: 120, y: 34, size: 12 },
          amountWords: { x: 28, y: 46, size: 11 },
          payee: { x: 40, y: 28, size: 11 },
          note: { x: 28, y: 60, size: 9 },
        }),
      ],
    );

    // ─────────────── نسخه‌های فروش ───────────────
    //
    // ⚠️ قیمت‌ها **دست نمی‌خورند**.
    //
    //    مهاجرت ۰۸۵ عددِ جای‌نگه‌دار گذاشت و صاحبِ سامانه باید عوضش
    //    کند.  اگر این اسکریپت هم عددی بنویسد، دو منبعِ حقیقت می‌شود و
    //    اجرای دوباره قیمتِ واقعی را با نمونه بازمی‌نویسد.
    console.log('  · قیمتِ نسخه‌ها دست نخورد (تنظیمش با شماست)');

    console.log(`\n✅ دادهٔ نمونه آماده شد — ${made} ردیف تازه`);
    console.log('   صفحه‌هایی که حالا پر باز می‌شوند:');
    console.log('   /records/consignment · /treasury (تنخواه) · /operations (یادآوری)');
    console.log('   /accounting (الگوی سند) · /reports (گزارش‌ساز) · /tax (گزارش فصلی)');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('✗ دادهٔ نمونه ساخته نشد:', error);
  process.exit(1);
});
