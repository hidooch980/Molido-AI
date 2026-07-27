'use strict';

/**
 * مدیریت چرخه عمر PostgreSQL جاسازی‌شده.
 *
 * کلاستر در پوشه داده کاربر ساخته می‌شود و فقط روی 127.0.0.1 گوش می‌دهد،
 * بنابراین از بیرون دستگاه قابل دسترسی نیست.
 */

const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { Client } = require('pg');

const { paths } = require('./paths');
const { PORTS, DB_NAME, DB_USER, config, adminDatabaseUrl } = require('./config');
const log = require('./log');

/**
 * اجرای یک ابزار PostgreSQL تا پایان.
 *
 * عمداً از `execFile` استفاده نمی‌کنیم: `pg_ctl start` دسته‌های stdout/stderr
 * خود را به postmaster ماندگار می‌سپارد، بنابراین لوله‌ها هرگز بسته نمی‌شوند
 * و promiseِ execFile با وجود خروج pg_ctl معلق می‌ماند. اینجا با
 * `stdio: 'ignore'` و اتکا به رویداد `exit` این مشکل را دور می‌زنیم
 * (خروجی سرور از طریق سوئیچ `-l` در فایل لاگ ثبت می‌شود).
 */
function run(file, args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      windowsHide: true,
      stdio: 'ignore',
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(`اجرای «${file}» بیش از حد طول کشید — جزئیات در ${log.file}`),
      );
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`اجرای «${file}» ممکن نشد: ${error.message}`));
    });

    child.on('exit', (code) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`«${file}» با کد ${code} خارج شد — جزئیات در ${log.file}`));
      }
    });
  });
}

/** کلاستر قبلاً ساخته شده است؟ */
function isInitialised() {
  return fs.existsSync(`${paths.pgData}/PG_VERSION`);
}

/**
 * ساخت کلاستر جدید. رمز از طریق فایل موقت به initdb داده می‌شود
 * (نه آرگومان خط فرمان) تا در لیست پردازه‌ها دیده نشود.
 */
async function initialise() {
  log.info('ساخت کلاستر دیتابیس برای اولین بار...');

  fs.mkdirSync(paths.userData, { recursive: true });
  fs.writeFileSync(paths.pgPassFile, config.dbPassword, { mode: 0o600 });

  try {
    await run(
      paths.initdb,
      [
        '-D', paths.pgData,
        '-U', DB_USER,
        '--auth-local=scram-sha-256',
        '--auth-host=scram-sha-256',
        `--pwfile=${paths.pgPassFile}`,
        '--encoding=UTF8',
        '--locale=C',
      ],
      { timeoutMs: 180000 },
    );

    log.info('کلاستر دیتابیس ساخته شد.');
  } finally {
    // رمز نباید روی دیسک باقی بماند.
    try {
      fs.rmSync(paths.pgPassFile, { force: true });
    } catch {
      /* بی‌اهمیت */
    }
  }
}

async function start() {
  if (!isInitialised()) {
    await initialise();
  }

  log.info(`راه‌اندازی دیتابیس روی پورت ${PORTS.postgres}...`);

  // pg_ctl تا آماده شدن سرور منتظر می‌ماند (-w) و سپس خارج می‌شود.
  await run(
    paths.pgCtl,
    [
      'start',
      '-D', paths.pgData,
      '-l', `${paths.userData}/postgres.log`,
      '-w',
      '-t', '60',
      '-o',
      `-p ${PORTS.postgres} -c listen_addresses=127.0.0.1 -c unix_socket_directories=`,
    ],
    { timeoutMs: 120000 },
  );

  log.info('دیتابیس آماده است.');

  await ensureDatabase();
}

/**
 * تلاش برای اتصال تا زمانی که سرور واقعاً پاسخ دهد.
 *
 * `pg_ctl -w` روی ویندوز گاهی پیش از آماده شدن کامل postmaster برمی‌گردد،
 * بنابراین به جای یک تلاش، با مهلت مشخص چند بار تلاش می‌کنیم.
 */
async function connectWithRetry(connectionString, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 5000,
    });

    try {
      await client.connect();

      return client;
    } catch (error) {
      lastError = error;

      try {
        await client.end();
      } catch {
        /* اتصال برقرار نشده بود */
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw new Error(
    `اتصال به دیتابیس برقرار نشد: ${lastError ? lastError.message : 'مهلت تمام شد'}`,
  );
}

/** اگر دیتابیس اصلی وجود ندارد، ساخته می‌شود. */
async function ensureDatabase() {
  const client = await connectWithRetry(adminDatabaseUrl);

  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [DB_NAME],
    );

    if (rowCount === 0) {
      // نام دیتابیس ثابت و کنترل‌شده است؛ پارامتر در CREATE DATABASE مجاز نیست.
      await client.query(`CREATE DATABASE "${DB_NAME}"`);
      log.info(`دیتابیس «${DB_NAME}» ساخته شد.`);
    }
  } finally {
    await client.end();
  }
}

/** توقف تمیز دیتابیس. خطاها فقط ثبت می‌شوند تا خروج برنامه معلق نماند. */
async function stop() {
  if (!isInitialised()) {
    return;
  }

  try {
    log.info('توقف دیتابیس...');

    await run(
      paths.pgCtl,
      ['stop', '-D', paths.pgData, '-m', 'fast', '-w', '-t', '30'],
      { timeoutMs: 60000 },
    );

    log.info('دیتابیس متوقف شد.');
  } catch (error) {
    log.warn(`توقف دیتابیس ناموفق بود: ${error.message}`);
  }
}

module.exports = { start, stop, isInitialised };
