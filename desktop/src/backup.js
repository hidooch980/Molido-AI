'use strict';

/**
 * پشتیبان‌گیری خودکار از دیتابیس.
 *
 * چون بسته embedded-postgres فقط initdb/pg_ctl/postgres را دارد و
 * pg_dump در آن نیست، پشتیبان به روش «کپی سرد» گرفته می‌شود: پوشه داده
 * تنها زمانی آرشیو می‌شود که سرور کاملاً متوقف باشد. این روش استاندارد
 * file-system level backup است و نسخه‌ای سازگار تولید می‌کند.
 *
 * زمان‌بندی: هنگام خروج برنامه، اگر از آخرین پشتیبان بیش از بازه تعیین‌شده
 * گذشته باشد. گرفتن پشتیبان هنگام خروج امن‌ترین حالت است چون دیتابیس
 * همان لحظه به صورت تمیز بسته شده است.
 */

const fs = require('node:fs');
const path = require('node:path');

const { paths } = require('./paths');
const { packDirectory, unpackArchive } = require('./tar');
const log = require('./log');

/** حداقل فاصله بین دو پشتیبان خودکار (ساعت). */
const INTERVAL_HOURS = 24;

/** تعداد نسخه‌هایی که نگهداری می‌شود. */
const KEEP = 7;

const BACKUP_DIR = path.join(paths.userData, 'backups');

/**
 * فایل‌هایی که نباید در آرشیو بیایند.
 * postmaster.pid اگر بازیابی شود، PostgreSQL فکر می‌کند نمونه دیگری
 * در حال اجراست و بالا نمی‌آید.
 */
function shouldSkip(relPath) {
  if (relPath === 'postmaster.pid') return true;
  if (relPath === 'postmaster.opts') return true;

  // فایل‌های موقت و سوکت‌ها ارزش آرشیو ندارند.
  if (relPath.startsWith('pg_stat_tmp/')) return true;

  return false;
}

function list() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('molido-') && f.endsWith('.tar.gz'))
    .map((f) => {
      const full = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(full);

      return { name: f, path: full, size: stat.size, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

/** نسخه‌های قدیمی‌تر از KEEP را حذف می‌کند. */
function rotate() {
  const all = list();

  for (const old of all.slice(KEEP)) {
    try {
      fs.rmSync(old.path, { force: true });
      log.info(`پشتیبان قدیمی حذف شد: ${old.name}`);
    } catch (error) {
      log.warn(`حذف پشتیبان قدیمی ناموفق بود: ${error.message}`);
    }
  }
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');

  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

/** آیا از آخرین پشتیبان به اندازه کافی گذشته است؟ */
function isDue() {
  const latest = list()[0];

  if (!latest) return true;

  return Date.now() - latest.mtime >= INTERVAL_HOURS * 3600 * 1000;
}

/**
 * یک پشتیبان می‌گیرد. **باید** زمانی صدا زده شود که PostgreSQL متوقف است.
 * برمی‌گرداند: مسیر فایل یا null در صورت شکست.
 */
function create() {
  if (!fs.existsSync(paths.pgData)) {
    log.warn('پوشه داده وجود ندارد — پشتیبان‌گیری انجام نشد.');

    return null;
  }

  const target = path.join(BACKUP_DIR, `molido-${timestamp()}.tar.gz`);
  // ابتدا در فایل موقت می‌نویسیم تا در صورت قطع برق، آرشیو ناقص به
  // عنوان پشتیبان معتبر شناخته نشود.
  const temp = `${target}.partial`;

  try {
    const started = Date.now();
    const result = packDirectory(paths.pgData, temp, { skip: shouldSkip });

    fs.renameSync(temp, target);

    log.info(
      `پشتیبان ساخته شد: ${path.basename(target)} — ` +
        `${result.fileCount} فایل، ${(result.bytes / 1048576).toFixed(1)}MB، ` +
        `${Date.now() - started}ms`,
    );

    rotate();

    return target;
  } catch (error) {
    log.error(`پشتیبان‌گیری ناموفق بود: ${error.message}`);

    try {
      fs.rmSync(temp, { force: true });
    } catch {
      /* بی‌اهمیت */
    }

    return null;
  }
}

/** اگر موعد رسیده باشد پشتیبان می‌گیرد. */
function createIfDue() {
  if (!isDue()) return null;

  return create();
}

/**
 * بازیابی از یک آرشیو. **باید** زمانی صدا زده شود که PostgreSQL متوقف است.
 *
 * پوشه داده فعلی پیش از بازنویسی کنار گذاشته می‌شود تا در صورت خراب بودن
 * آرشیو، داده فعلی از دست نرود.
 */
function restore(archivePath) {
  if (!fs.existsSync(archivePath)) {
    throw new Error(`فایل پشتیبان یافت نشد: ${archivePath}`);
  }

  const staging = `${paths.pgData}.restoring`;
  const previous = `${paths.pgData}.previous-${timestamp()}`;

  // ابتدا در پوشه موقت باز می‌کنیم تا آرشیو خراب، داده سالم را نابود نکند.
  fs.rmSync(staging, { recursive: true, force: true });

  const result = unpackArchive(archivePath, staging);

  if (!fs.existsSync(path.join(staging, 'PG_VERSION'))) {
    fs.rmSync(staging, { recursive: true, force: true });

    throw new Error('آرشیو معتبر نیست — فایل PG_VERSION در آن نیست.');
  }

  if (fs.existsSync(paths.pgData)) {
    fs.renameSync(paths.pgData, previous);
  }

  fs.renameSync(staging, paths.pgData);

  log.info(
    `بازیابی انجام شد: ${result.fileCount} فایل. ` +
      `نسخه قبلی در ${path.basename(previous)} نگهداری شد.`,
  );

  return { fileCount: result.fileCount, previous };
}

module.exports = {
  BACKUP_DIR,
  INTERVAL_HOURS,
  KEEP,
  list,
  isDue,
  create,
  createIfDue,
  restore,
};
