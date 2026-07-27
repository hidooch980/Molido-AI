'use strict';

/**
 * مسیرهای اجرایی برنامه دسکتاپ.
 *
 * در حالت بسته‌بندی‌شده، محتویات پوشه `staging/` توسط electron-builder به
 * `process.resourcesPath` کپی می‌شود. در حالت توسعه (`npm start`) همان پوشه
 * `staging/` کنار سورس قرار دارد.
 */

const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

/** ریشه منابع جاسازی‌شده (backend / web / pgsql). */
function resourcesRoot() {
  return app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..', 'staging');
}

const RESOURCES = resourcesRoot();

/** پوشه داده‌های کاربر — دیتابیس، آپلودها، تنظیمات و لاگ. */
const USER_DATA = app.getPath('userData');

const paths = {
  resources: RESOURCES,

  backendDir: path.join(RESOURCES, 'backend'),
  backendEntry: path.join(RESOURCES, 'backend', 'dist', 'main.js'),
  seedEntry: path.join(RESOURCES, 'backend', 'prisma-seed', 'seed.js'),
  prismaSchema: path.join(RESOURCES, 'backend', 'prisma', 'schema.prisma'),
  prismaCli: path.join(
    RESOURCES,
    'backend',
    'node_modules',
    'prisma',
    'build',
    'index.js',
  ),

  webDir: path.join(RESOURCES, 'web'),
  webEntry: path.join(RESOURCES, 'web', 'server.js'),

  pgBin: path.join(RESOURCES, 'pgsql', 'bin'),
  initdb: path.join(RESOURCES, 'pgsql', 'bin', 'initdb.exe'),
  pgCtl: path.join(RESOURCES, 'pgsql', 'bin', 'pg_ctl.exe'),

  userData: USER_DATA,
  pgData: path.join(USER_DATA, 'pgdata'),
  uploads: path.join(USER_DATA, 'uploads'),
  configFile: path.join(USER_DATA, 'config.json'),
  logFile: path.join(USER_DATA, 'molido.log'),
  pgPassFile: path.join(USER_DATA, 'pgpass.tmp'),
};

/**
 * بررسی می‌کند همه منابع لازم سر جایشان هستند. اگر مرحله stage اجرا نشده
 * باشد، بهتر است زود و با پیام روشن شکست بخوریم تا با خطای مبهم runtime.
 */
function verifyResources() {
  const required = [
    ['موتور دیتابیس (initdb.exe)', paths.initdb],
    ['موتور دیتابیس (pg_ctl.exe)', paths.pgCtl],
    ['بک‌اند (dist/main.js)', paths.backendEntry],
    ['رابط وب (server.js)', paths.webEntry],
    ['Prisma CLI', paths.prismaCli],
    ['اسکیمای دیتابیس', paths.prismaSchema],
  ];

  const missing = required
    .filter(([, target]) => !fs.existsSync(target))
    .map(([label]) => label);

  if (missing.length > 0) {
    throw new Error(
      `منابع برنامه ناقص است:\n  - ${missing.join('\n  - ')}\n\n` +
        `مسیر بررسی‌شده: ${RESOURCES}\n` +
        (app.isPackaged
          ? 'بسته نصبی معیوب است — لطفاً دوباره دانلود و نصب کنید.'
          : 'ابتدا «npm run stage» را در پوشه desktop اجرا کنید.'),
    );
  }
}

module.exports = { paths, verifyResources };
