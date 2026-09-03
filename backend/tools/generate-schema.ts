/**
 * تولیدِ `src/database/schema.generated.ts` از خودِ پایگاه‌داده.
 *
 * ---------- چرا این ابزار لازم شد ----------
 *
 * ⚠️ پس از حذفِ Prisma، این فایل «دستی نگهداری می‌شود» — و همان‌طور که
 *    انتظار می‌رفت، نشد.
 *
 *    نگهبانِ `check-schema-drift` در CI ده‌ها اختلاف پیدا کرد: جدول‌های
 *    مرده‌ای که با مهاجرت ۰۵۶ حذف شده بودند و هنوز در نقشه بودند، و
 *    ده‌ها جدول و ستونِ تازه که هرگز اضافه نشدند.
 *
 * ⚠️ و پیامدش خاموش بود، نه پرسروصدا.
 *
 *    `BaseCrudService` ستونی را که در نقشه نباشد **دور می‌ریزد** —
 *    بدونِ خطا.  یعنی `Customer.personType` که برای گزارش فصلی افزوده
 *    شد، از راهِ API ذخیره نمی‌شد.  فرم پر می‌شد، پاسخ ۲۰۰ می‌آمد، و
 *    میدان خالی می‌ماند.
 *
 *    نگهبان این را گرفت.  «دستی نگهداری کنید» راهکار نبود؛ ابزار است.
 *
 * اجرا:  npm run gen:schema
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { Pool } from 'pg';

import { databaseConfig } from '../src/database/connection';

/**
 * ⚠️ ترتیبِ ستون‌ها همان `ordinal_position` است، نه الفبایی.
 *
 *    ترتیبِ پایگاه‌داده پایدار است و دیفِ فایل را کوچک نگه می‌دارد:
 *    افزودنِ یک ستون یک خط عوض می‌کند، نه کلِ آرایه را.
 */
const QUERY = `
  SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
   WHERE c.table_schema = 'public'
     AND t.table_type = 'BASE TABLE'
     -- جدولِ ردیابیِ مهاجرت‌ها دادهٔ کسب‌وکار نیست.
     AND c.table_name <> 'schema_migrations'
   ORDER BY c.table_name, c.ordinal_position`;

async function main(): Promise<void> {
  const pool = new Pool(databaseConfig());
  try {
    const { rows } = await pool.query<{ table_name: string; column_name: string }>(QUERY);

    const tables = new Map<string, string[]>();
    for (const row of rows) {
      const cols = tables.get(row.table_name) ?? [];
      cols.push(row.column_name);
      tables.set(row.table_name, cols);
    }

    if (tables.size === 0) {
      // ⚠️ نوشتنِ فایلِ خالی یعنی هر نوشتنی در سامانه بی‌صدا داده را
      //    دور می‌ریزد.  بهتر است ابزار شکست بخورد.
      throw new Error(
        'هیچ جدولی پیدا نشد — آیا مهاجرت‌ها اجرا شده‌اند؟ فایل دست‌نخورده ماند.',
      );
    }

    const lines = [...tables.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([table, cols]) => `  ${table}: [${cols.map((c) => `'${c}'`).join(', ')}],`);

    const out = `// تولیدشده از خودِ پایگاه‌داده با tools/generate-schema.ts — دست نزنید.
//
// ⚠️ پس از هر مهاجرت، \`npm run gen:schema\` را اجرا کنید.
//
//    \`BaseCrudService\` ستونی را که این‌جا نباشد بی‌صدا دور می‌ریزد:
//    فرم پر می‌شود، پاسخ ۲۰۰ می‌آید، و میدان خالی می‌ماند.
//    نگهبانِ \`npm run check:schema\` در CI همین را می‌گیرد.

export const TABLE_COLUMNS: Record<string, readonly string[]> = {
${lines.join('\n')}
};
`;

    const target = join(__dirname, '..', 'src', 'database', 'schema.generated.ts');
    writeFileSync(target, out, 'utf8');
    process.stdout.write(`نقشه ساخته شد: ${tables.size} جدول\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
