/**
 * نگهبان هم‌گامی نقشهٔ ستون‌ها
 *
 * `src/database/schema.generated.ts` پس از حذف Prisma دستی نگهداری می‌شود.
 * اگر کسی migration بنویسد و این فایل را به‌روز نکند، `BaseCrudService` ستون
 * تازه را بی‌صدا نادیده می‌گیرد — داده ذخیره نمی‌شود و هیچ خطایی هم نمی‌دهد.
 * این اسکریپت همان اختلاف را در CI به یک شکست تبدیل می‌کند.
 *
 * اجرا: DATABASE_URL=... npx tsx tools/check-schema-drift.ts
 */
import process from 'node:process';
import { Pool } from 'pg';
import { databaseConfig } from '../src/database/connection';
import { TABLE_COLUMNS } from '../src/database/schema.generated';

type Problem = { table: string; detail: string };

async function main(): Promise<void> {
  const pool = new Pool(databaseConfig());

  try {
    const { rows } = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position`,
    );

    const live = new Map<string, Set<string>>();
    for (const row of rows) {
      const columns = live.get(row.table_name) ?? new Set<string>();
      columns.add(row.column_name);
      live.set(row.table_name, columns);
    }

    const problems: Problem[] = [];

    for (const [table, declared] of Object.entries(TABLE_COLUMNS)) {
      const actual = live.get(table);

      // جدولی که هنوز migration ندارد خطا نیست — ممکن است در راه باشد؛ ولی
      // ستونی که در دیتابیس هست و در نقشه نیست، داده را بی‌صدا دور می‌ریزد.
      if (!actual) {
        problems.push({ table, detail: 'در نقشه هست ولی در دیتابیس نیست' });
        continue;
      }

      const missing = [...actual].filter((column) => !declared.includes(column));
      if (missing.length) {
        problems.push({
          table,
          detail: `ستون‌های جاافتاده در نقشه: ${missing.join(', ')}`,
        });
      }

      const extra = declared.filter((column) => !actual.has(column));
      if (extra.length) {
        problems.push({
          table,
          detail: `ستون‌هایی که در دیتابیس وجود ندارند: ${extra.join(', ')}`,
        });
      }
    }

    // جدول‌های سیستمی مهاجرت جزو نقشه نیستند و نباید باشند.
    const ignored = new Set(['schema_migrations']);
    for (const table of live.keys()) {
      if (ignored.has(table)) continue;
      if (!TABLE_COLUMNS[table]) {
        problems.push({ table, detail: 'در دیتابیس هست ولی در نقشه نیست' });
      }
    }

    if (!problems.length) {
      console.log(
        `✅ نقشهٔ ستون‌ها هم‌گام است — ${Object.keys(TABLE_COLUMNS).length} جدول بررسی شد`,
      );
      return;
    }

    console.error(`❌ ${problems.length} مغایرت بین نقشه و دیتابیس:\n`);
    for (const problem of problems) {
      console.error(`  ${problem.table} — ${problem.detail}`);
    }
    console.error(
      '\nپس از هر migration، src/database/schema.generated.ts را دستی به‌روز کنید.',
    );
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('بررسی نقشهٔ ستون‌ها شکست خورد', error);
  process.exit(1);
});
