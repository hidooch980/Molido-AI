import process from 'node:process';
import { PoolConfig } from 'pg';

/**
 * پیکربندی اتصال دیتابیس
 *
 * دو حالت پشتیبانی می‌شود و اجزای جداگانه اولویت دارند:
 *
 *   ۱. PGHOST / PGPORT / PGUSER / PGPASSWORD / PGDATABASE
 *   ۲. DATABASE_URL
 *
 * چرا اجزای جداگانه اولویت دارند: رمز عبور قوی معمولاً `@`، `#`، `/` یا `:`
 * دارد و در یک URL بدون درصد-کدگذاری، تجزیه را می‌شکند — به‌شکلی که خطایش
 * گمراه‌کننده است (میزبان اشتباه، نه «رمز نامعتبر»).  با فرستادن اجزا، رمز
 * هرگز از URL عبور نمی‌کند و این دسته خطا حذف می‌شود.
 */
export function databaseConfig(): PoolConfig {
  const host = process.env.PGHOST;

  if (host) {
    return {
      host,
      port: Number(process.env.PGPORT ?? 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    };
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'اتصال دیتابیس تنظیم نشده است: PGHOST یا DATABASE_URL را مقدار دهید',
    );
  }

  return { connectionString };
}

/**
 * اتصال با نقش صاحبِ جدول‌ها — فقط برای مهاجرت و داده اولیه.
 *
 * برنامه با نقش `molido_app` وصل می‌شود که تحت RLS است.  مهاجرت و داده
 * اولیه باید روی همهٔ شرکت‌ها کار کنند، پس با نقش صاحب اجرا می‌شوند که
 * طبق رفتار پیش‌فرض PostgreSQL از RLS معاف است.
 *
 * اگر PGADMIN_USER تنظیم نشده باشد، همان اتصال عادی برگردانده می‌شود —
 * یعنی در نصبی که هنوز RLS ندارد، رفتار عوض نمی‌شود.
 */
export function adminDatabaseConfig(): PoolConfig {
  const user = process.env.PGADMIN_USER;

  if (!user) {
    return databaseConfig();
  }

  return {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    user,
    password: process.env.PGADMIN_PASSWORD,
    database: process.env.PGDATABASE,
  };
}
