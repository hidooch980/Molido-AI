/**
 * راه‌اندازِ `npm run seed`.
 *
 * ⚠️ چرا یک فایلِ واسط، و نه مستقیم `tsx src/database/seed.ts`؟
 *
 *    `tsx` وابستگیِ **توسعه** است و در ایمیجِ تولید نصب نمی‌شود.  پس
 *    `docker compose exec backend npm run seed` — همان دستوری که در
 *    راهنمای نصب آمده — با `sh: tsx: not found` می‌افتاد.
 *
 *    در ایمیج، نسخهٔ ترجمه‌شده در `dist/database/seed.js` هست و کار
 *    می‌کند؛ فقط کسی نمی‌داند باید آن را صدا بزند.
 *
 * ⚠️ چرا Node و نه `sh -c`؟
 *
 *    نخستین تلاشم `sh -c '...'` بود.  روی لینوکس کار کرد و روی ویندوز
 *    نه: npm اسکریپت‌ها را با `cmd.exe` اجرا می‌کند و `exec` را
 *    نمی‌شناسد.  یعنی رفعِ تولید، توسعه را می‌شکست.
 *
 *    Node روی هر دو سکو یکسان است.
 *
 * ⚠️ ترتیب: `tsx` مقدم است.
 *
 *    در توسعه، `dist` ممکن است از ساختِ قبلی مانده و **کهنه** باشد.
 *    اجرای آن یعنی داده‌ای که می‌کارید با کدی که ویرایش کرده‌اید یکی
 *    نیست — خطایی که هیچ پیامی ندارد.  پس تا وقتی `tsx` هست، از
 *    منبع اجرا می‌شود.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// مسیرِ باینریِ محلی؛ روی ویندوز پسوندِ `.cmd` دارد.
const tsxBin = join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
);

const useSource = existsSync(tsxBin);
const compiled = join(root, 'dist', 'database', 'seed.js');

if (!useSource && !existsSync(compiled)) {
  console.error('✗ نه tsx هست و نه dist/database/seed.js — ابتدا `npm run build`.');
  process.exit(1);
}

const [cmd, args] = useSource
  ? [tsxBin, [join('src', 'database', 'seed.ts')]]
  : [process.execPath, [compiled]];

// ⚠️ `shell: true` فقط روی ویندوز: آنجا `.cmd` بدونِ پوسته اجرا
//    نمی‌شود.  روی لینوکس روشن کردنش یعنی مسیرِ حاوی فاصله می‌شکند.
const result = spawnSync(cmd, args, {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
