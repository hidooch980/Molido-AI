'use strict';

/**
 * اجرای بک‌اند NestJS و رابط وب Next.js به صورت زیرفرایند.
 *
 * چون Electron خودش یک نسخه Node دارد، با ELECTRON_RUN_AS_NODE=1 همان
 * اجرایی را به عنوان Node خالص به کار می‌گیریم و نیازی به نصب Node روی
 * دستگاه کاربر نیست.
 */

const fs = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');

const { paths } = require('./paths');
const { PORTS, databaseUrl, config } = require('./config');
const log = require('./log');

const children = new Set();

/** محیط پایه برای زیرفرایندهای Node. */
function nodeEnv(extra) {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    DATABASE_URL: databaseUrl,
    ...extra,
  };
}

/** اجرای یک اسکریپت Node تا پایان؛ در صورت خروج ناموفق خطا می‌دهد. */
function runToCompletion(label, script, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: options.cwd,
      env: nodeEnv(options.env),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    children.add(child);

    child.stdout.on('data', (chunk) => log.pipe(label, chunk));
    child.stderr.on('data', (chunk) => log.pipe(label, chunk));

    child.on('error', (error) => {
      children.delete(child);
      reject(new Error(`اجرای ${label} ممکن نشد: ${error.message}`));
    });

    child.on('exit', (code) => {
      children.delete(child);

      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} با کد ${code} خارج شد — جزئیات در ${log.file}`));
      }
    });
  });
}

/** اجرای یک سرویس ماندگار. */
function spawnService(label, script, options = {}) {
  const child = spawn(process.execPath, [script], {
    cwd: options.cwd,
    env: nodeEnv(options.env),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  children.add(child);

  child.stdout.on('data', (chunk) => log.pipe(label, chunk));
  child.stderr.on('data', (chunk) => log.pipe(label, chunk));

  child.on('exit', (code, signal) => {
    children.delete(child);
    log.warn(`${label} خاتمه یافت (کد ${code}، سیگنال ${signal}).`);
  });

  return child;
}

/** انتظار برای باز شدن یک پورت TCP روی 127.0.0.1. */
function waitForPort(port, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host: '127.0.0.1' });

      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });

      socket.once('error', () => {
        socket.destroy();

        if (Date.now() > deadline) {
          reject(
            new Error(
              `سرویس روی پورت ${port} در زمان مقرر بالا نیامد — جزئیات در ${log.file}`,
            ),
          );

          return;
        }

        setTimeout(attempt, 400);
      });
    };

    attempt();
  });
}

/** بررسی اینکه پورت از قبل اشغال نشده باشد. */
function assertPortFree(port, label) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ port, host: '127.0.0.1' });

    socket.once('connect', () => {
      socket.destroy();
      reject(
        new Error(
          `پورت ${port} (${label}) از قبل در حال استفاده است.\n` +
            'احتمالاً نسخه دیگری از Molido AI در حال اجراست یا برنامه‌ای این پورت را گرفته است.',
        ),
      );
    });

    socket.once('error', () => {
      socket.destroy();
      resolve();
    });
  });
}

/** همگام‌سازی اسکیمای دیتابیس. مخزن پوشه migrations ندارد، پس db push. */
async function applySchema() {
  log.info('همگام‌سازی ساختار دیتابیس...');

  await runToCompletion(
    'prisma',
    paths.prismaCli,
    ['db', 'push', `--schema=${paths.prismaSchema}`, '--skip-generate'],
    { cwd: paths.backendDir },
  );

  log.info('ساختار دیتابیس به‌روز است.');
}

/** درج داده اولیه — فقط یک بار در طول عمر نصب. */
async function seedIfNeeded() {
  const marker = `${paths.userData}/.seeded`;

  if (fs.existsSync(marker)) {
    return;
  }

  log.info('درج داده اولیه...');

  await runToCompletion('seed', paths.seedEntry, [], { cwd: paths.backendDir });

  fs.writeFileSync(marker, new Date().toISOString());
  log.info('داده اولیه درج شد.');
}

async function startBackend() {
  log.info(`راه‌اندازی بک‌اند روی پورت ${PORTS.api}...`);

  fs.mkdirSync(paths.uploads, { recursive: true });

  spawnService('backend', paths.backendEntry, {
    // بک‌اند آپلودها را نسبت به cwd سرو می‌کند، پس cwd را روی داده کاربر
    // می‌گذاریم تا فایل‌ها داخل Program Files نوشته نشوند.
    cwd: paths.userData,
    env: {
      PORT: String(PORTS.api),
      CORS_ORIGIN: `http://127.0.0.1:${PORTS.web}`,
      JWT_SECRET: config.jwtSecret,
      JWT_EXPIRES_IN: '7d',
      JWT_REFRESH_SECRET: config.jwtRefreshSecret,
      JWT_REFRESH_EXPIRES_IN: '30d',
    },
  });

  await waitForPort(PORTS.api);
  log.info('بک‌اند آماده است.');
}

async function startWeb() {
  log.info(`راه‌اندازی رابط وب روی پورت ${PORTS.web}...`);

  spawnService('web', paths.webEntry, {
    cwd: paths.webDir,
    env: {
      PORT: String(PORTS.web),
      HOSTNAME: '127.0.0.1',
    },
  });

  await waitForPort(PORTS.web);
  log.info('رابط وب آماده است.');
}

/** خاتمه دادن به همه زیرفرایندها. */
function stopAll() {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* در حال خروج هستیم */
    }
  }

  children.clear();
}

module.exports = {
  assertPortFree,
  applySchema,
  seedIfNeeded,
  startBackend,
  startWeb,
  stopAll,
};
