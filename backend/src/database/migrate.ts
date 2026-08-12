import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { adminDatabaseConfig } from './connection';

const migrationsDir = join(process.cwd(), 'sql', 'migrations');

/**
 * رمز نقش برنامه را با آنچه در محیط تنظیم شده همگام می‌کند.
 *
 * مهاجرت ۰۱۳ نقش `molido_app` را با یک رمز پیش‌فرض می‌سازد، چون فایل SQL
 * به متغیرهای محیطی دسترسی ندارد.  اگر کاربر `APP_DB_PASSWORD` را در
 * `.env` عوض کند، بک‌اند با رمز تازه وصل می‌شود ولی رمز نقش هنوز قدیمی
 * است — و اتصال با خطای احراز هویت می‌شکند، بی‌آنکه علتش روشن باشد.
 *
 * این تابع با نقش صاحب (که همین‌جا در دست است) رمز را هر بار می‌نشاند.
 */
async function syncAppRolePassword(pool: Pool): Promise<void> {
  // متغیرهای صریح، نه PGUSER: سرویس migrate خودش با نقش ادمین وصل می‌شود،
  // پس PGUSER اینجا نقش برنامه نیست.
  const user = process.env.APP_DB_USER;
  const password = process.env.APP_DB_PASSWORD;

  if (!user || !password) return;

  const roles = await pool.query<{ rolname: string }>(
    'SELECT rolname FROM pg_roles WHERE rolname = $1',
    [user],
  );
  if (!roles.rows[0]) return;

  // نه نام نقش و نه رمز در ALTER ROLE پارامتر می‌پذیرند، پس دستور با
  // `format` در سمت سرور و با نقل‌قول درست ساخته می‌شود — نه با الحاق رشته
  // در سمت ما.
  const statement = await pool.query<{ format: string }>(
    "SELECT format('ALTER ROLE %I WITH PASSWORD %L', $1::text, $2::text)",
    [user, password],
  );

  await pool.query(statement.rows[0].format);
  console.log(`رمز نقش ${user} همگام شد`);
}

async function migrate(): Promise<void> {
  const pool = new Pool(adminDatabaseConfig());
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const names = (await readdir(migrationsDir))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    const applied = new Set(
      (await pool.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map(
        (row) => row.name,
      ),
    );

    for (const name of names) {
      if (applied.has(name)) continue;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(await readFile(join(migrationsDir, name), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    await syncAppRolePassword(pool);
  } finally {
    await pool.end();
  }
}

migrate().catch((error: unknown) => {
  console.error('Database migration failed', error);
  process.exit(1);
});
