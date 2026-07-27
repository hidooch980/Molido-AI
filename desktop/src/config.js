'use strict';

/**
 * تنظیمات محلی برنامه.
 *
 * رمزها در اولین اجرا به صورت تصادفی ساخته و در پوشه داده کاربر ذخیره
 * می‌شوند — هیچ رمز ثابتی داخل بسته نصبی وجود ندارد.
 */

const fs = require('node:fs');
const crypto = require('node:crypto');
const { paths } = require('./paths');

/**
 * پورت‌های ثابت و غیرمتعارف تا با سرویس‌های رایج توسعه (۳۰۰۰/۳۰۰۱/۵۴۳۲)
 * تداخل نداشته باشند. آدرس API هنگام build داخل باندل وب نوشته می‌شود،
 * بنابراین پورت API نمی‌تواند در زمان اجرا تغییر کند.
 */
const PORTS = {
  api: 37701,
  web: 37702,
  postgres: 37703,
};

const DB_NAME = 'molido_ai';
const DB_USER = 'molido';

function secret() {
  return crypto.randomBytes(32).toString('hex');
}

function load() {
  if (fs.existsSync(paths.configFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(paths.configFile, 'utf8'));

      if (parsed && typeof parsed.dbPassword === 'string') {
        return parsed;
      }
    } catch {
      // فایل خراب است — با تنظیمات تازه ادامه می‌دهیم.
      // رمز دیتابیس بازتولید می‌شود ولی کلاستر موجود آن را نمی‌پذیرد،
      // پس عمداً خطا می‌دهیم تا داده کاربر بی‌صدا از دست نرود.
      if (fs.existsSync(paths.pgData)) {
        throw new Error(
          `فایل تنظیمات خراب است: ${paths.configFile}\n` +
            'برای جلوگیری از دست رفتن داده، برنامه متوقف شد. ' +
            'در صورت داشتن نسخه پشتیبان، فایل تنظیمات را بازگردانی کنید.',
        );
      }
    }
  }

  const fresh = {
    dbPassword: secret(),
    jwtSecret: secret(),
    jwtRefreshSecret: secret(),
    createdAt: new Date().toISOString(),
  };

  fs.mkdirSync(paths.userData, { recursive: true });
  fs.writeFileSync(paths.configFile, JSON.stringify(fresh, null, 2), {
    mode: 0o600,
  });

  return fresh;
}

const config = load();

const databaseUrl =
  `postgresql://${DB_USER}:${encodeURIComponent(config.dbPassword)}` +
  `@127.0.0.1:${PORTS.postgres}/${DB_NAME}?schema=public&connection_limit=10`;

module.exports = {
  PORTS,
  DB_NAME,
  DB_USER,
  config,
  databaseUrl,
  /** URL اتصال به دیتابیس سیستمی `postgres` — برای ساخت دیتابیس اصلی. */
  adminDatabaseUrl:
    `postgresql://${DB_USER}:${encodeURIComponent(config.dbPassword)}` +
    `@127.0.0.1:${PORTS.postgres}/postgres`,
};
