'use strict';

/**
 * ساخت و چیدن همه اجزا در پوشه `staging/`.
 *
 * خروجی این اسکریپت عیناً به `process.resourcesPath` بسته نصبی کپی می‌شود:
 *
 *   staging/
 *     backend/   dist + prisma + node_modules تولیدی + seed کامپایل‌شده
 *     web/       خروجی standalone نکست
 *     pgsql/     باینری‌های PostgreSQL
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const DESKTOP = path.join(__dirname, '..');
const STAGING = path.join(DESKTOP, 'staging');

const BACKEND_SRC = path.join(ROOT, 'backend');
const WEB_SRC = path.join(ROOT, 'web');

const API_PORT = 37701;

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function step(message) {
  console.log(`\n[36m▶ ${message}[0m`);
}

function sh(command, args, cwd, env) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  });
}

/** با lockfile از `npm ci` استفاده می‌کند، وگرنه `npm install`. */
function installDeps(dir) {
  const hasLock = fs.existsSync(path.join(dir, 'package-lock.json'));

  sh(npm, [hasLock ? 'ci' : 'install', '--no-audit', '--no-fund'], dir);
}

function copyDir(from, to) {
  fs.cpSync(from, to, { recursive: true, dereference: true });
}

function reset(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------- backend

function stageBackend() {
  const out = path.join(STAGING, 'backend');

  step('نصب وابستگی‌های بک‌اند');
  installDeps(BACKEND_SRC);

  step('تولید کلاینت Prisma');
  sh(npm, ['exec', '--', 'prisma', 'generate'], BACKEND_SRC);

  step('کامپایل بک‌اند');
  sh(npm, ['run', 'build'], BACKEND_SRC);

  step('کامپایل اسکریپت seed');
  // seed.ts با tsx اجرا می‌شد؛ برای اجرای زمان-اجرا بدون tsx آن را
  // به JavaScript کامپایل می‌کنیم.
  const seedOut = path.join(out, 'prisma-seed');

  fs.mkdirSync(seedOut, { recursive: true });
  sh(
    npm,
    [
      'exec', '--', 'tsc',
      path.join('prisma', 'seed.ts'),
      '--outDir', seedOut,
      '--module', 'commonjs',
      '--target', 'es2022',
      '--moduleResolution', 'node',
      '--esModuleInterop',
      '--skipLibCheck',
    ],
    BACKEND_SRC,
  );

  step('حذف وابستگی‌های توسعه');
  // prisma در dependencies است (نه devDependencies) چون CLI آن در زمان
  // اجرا برای «db push» لازم است، بنابراین از prune جان سالم به در می‌برد.
  sh(npm, ['prune', '--omit=dev'], BACKEND_SRC);

  step('کپی بک‌اند به staging');
  copyDir(path.join(BACKEND_SRC, 'dist'), path.join(out, 'dist'));
  copyDir(path.join(BACKEND_SRC, 'prisma'), path.join(out, 'prisma'));
  copyDir(path.join(BACKEND_SRC, 'node_modules'), path.join(out, 'node_modules'));
  fs.copyFileSync(
    path.join(BACKEND_SRC, 'package.json'),
    path.join(out, 'package.json'),
  );

  // seed.ts خام لازم نیست و فقط حجم اضافه می‌کند.
  fs.rmSync(path.join(out, 'prisma', 'seed.ts'), { force: true });

  if (!fs.existsSync(path.join(out, 'prisma-seed', 'seed.js'))) {
    throw new Error('کامپایل seed خروجی نداد — seed.js ساخته نشد.');
  }
}

// -------------------------------------------------------------------- web

function stageWeb() {
  const out = path.join(STAGING, 'web');

  step('نصب وابستگی‌های وب');
  installDeps(WEB_SRC);

  step('ساخت رابط وب');
  // آدرس API در زمان build داخل باندل کلاینت نوشته می‌شود، پس باید با
  // پورتی که main.js استفاده می‌کند یکی باشد.
  sh(npm, ['run', 'build'], WEB_SRC, {
    NEXT_PUBLIC_API_URL: `http://127.0.0.1:${API_PORT}`,
  });

  step('کپی خروجی standalone به staging');
  copyDir(path.join(WEB_SRC, '.next', 'standalone'), out);
  copyDir(path.join(WEB_SRC, '.next', 'static'), path.join(out, '.next', 'static'));

  if (fs.existsSync(path.join(WEB_SRC, 'public'))) {
    copyDir(path.join(WEB_SRC, 'public'), path.join(out, 'public'));
  }

  if (!fs.existsSync(path.join(out, 'server.js'))) {
    throw new Error(
      'خروجی standalone نکست ساخته نشد — بررسی کنید next.config.mjs مقدار ' +
        "output: 'standalone' را داشته باشد.",
    );
  }
}

// ---------------------------------------------------------------- postgres

function stagePostgres() {
  step('کپی باینری‌های PostgreSQL');

  const pkg = path.join(
    DESKTOP,
    'node_modules',
    '@embedded-postgres',
    'windows-x64',
    'native',
  );

  if (!fs.existsSync(pkg)) {
    throw new Error(
      'باینری‌های PostgreSQL پیدا نشد. ابتدا در پوشه desktop دستور ' +
        '«npm install» را اجرا کنید.',
    );
  }

  const out = path.join(STAGING, 'pgsql');

  for (const part of ['bin', 'lib', 'share']) {
    copyDir(path.join(pkg, part), path.join(out, part));
  }

  for (const exe of ['initdb.exe', 'pg_ctl.exe', 'postgres.exe']) {
    if (!fs.existsSync(path.join(out, 'bin', exe))) {
      throw new Error(`باینری ${exe} در بسته PostgreSQL یافت نشد.`);
    }
  }
}

// -------------------------------------------------------------------- main

function main() {
  step('پاک‌سازی staging');
  reset(STAGING);

  stageBackend();
  stageWeb();
  stagePostgres();

  console.log('\n[32m✔ staging کامل شد.[0m');
  console.log(`  مسیر: ${STAGING}`);
}

main();
