#!/usr/bin/env node
/**
 * عامل چاپ محلی — Molido
 *
 * روی همان دستگاه صندوق اجرا می‌شود و به مرورگر اجازه می‌دهد مستقیم روی
 * چاپگر حرارتی چاپ کند و کشوی پول را باز کند.
 *
 * چرا این و نه Electron یا Tauri:
 *   • نصب PWA همین حالا پنجرهٔ اپ دسکتاپ می‌دهد؛ آنچه کم بود دسترسی به
 *     سخت‌افزار بود، نه یک پنجرهٔ دیگر.
 *   • Electron حدود ۱۵۰ مگابایت به هر نصب اضافه می‌کند و باید جدا از وب
 *     به‌روزرسانی شود — یعنی دو نسخه که از هم عقب می‌افتند.
 *   • این فایل ~۲۰۰ خط است، فقط Node لازم دارد، و وب همان یک کدپایه
 *     می‌ماند.
 *
 * اجرا:
 *   node agent.js                    # چاپگر پیش‌فرض ویندوز
 *   MOLIDO_PRINTER="POS-80" node agent.js
 *
 * امنیت: فقط روی 127.0.0.1 گوش می‌دهد، پس از شبکه در دسترس نیست.  مبدأهای
 * مجاز هم محدودند تا هر صفحهٔ وبی نتواند از چاپگر شما استفاده کند.
 */

'use strict';

const http = require('node:http');
const { spawn } = require('node:child_process');
const { writeFile, unlink } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const process = require('node:process');

const PORT = Number(process.env.MOLIDO_AGENT_PORT || 17777);
const PRINTER = process.env.MOLIDO_PRINTER || '';

/**
 * مبدأهای مجاز.
 *
 * بدون این، هر سایتی که کاربر باز کند می‌تواند به عامل درخواست بفرستد و
 * کاغذ چاپگر را تمام کند یا کشوی پول را باز کند.  نشانی سرور Molido از
 * متغیر محیطی می‌آید تا در هر نصب فرق کند.
 */
const ALLOWED = new Set(
  [
    'http://localhost:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    ...(process.env.MOLIDO_WEB_ORIGIN || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ],
);

/** فرمان ESC/POS برای باز کردن کشوی پول — استاندارد اپسون. */
const KICK_DRAWER = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

function cors(res, origin) {
  if (origin && ALLOWED.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/**
 * ارسال بایت خام به چاپگر.
 *
 * در ویندوز از `copy /b` به نام اشتراکی چاپگر استفاده می‌شود؛ در لینوکس و
 * مک از `lp`.  هر دو بدون کتابخانهٔ اضافه کار می‌کنند.
 */
async function sendRaw(buffer) {
  const file = join(tmpdir(), `molido-${Date.now()}.prn`);
  await writeFile(file, buffer);

  try {
    await new Promise((resolve, reject) => {
      const isWindows = process.platform === 'win32';

      const child = isWindows
        ? spawn(
            'cmd',
            ['/c', 'copy', '/b', file, PRINTER ? `\\\\localhost\\${PRINTER}` : 'PRN'],
            { windowsHide: true },
          )
        : spawn('lp', PRINTER ? ['-d', PRINTER, '-o', 'raw', file] : ['-o', 'raw', file]);

      let stderr = '';
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', reject);
      child.on('close', (code) =>
        code === 0
          ? resolve(undefined)
          : reject(new Error(stderr.trim() || `کد خروج ${code}`)),
      );
    });
  } finally {
    // فایل موقت حتی در صورت خطا پاک می‌شود، وگرنه پوشهٔ موقت پر می‌شود.
    await unlink(file).catch(() => {});
  }
}

/**
 * تبدیل متن رسید به ESC/POS.
 *
 * چاپگرهای حرارتی فارسی معمولاً کدصفحهٔ عربی (CP864) را می‌فهمند؛ ولی
 * پشتیبانی‌شان یکدست نیست.  پس متن به‌صورت UTF-8 فرستاده می‌شود و
 * تنظیم کدصفحه به عهدهٔ خود چاپگر است — بیشتر مدل‌های امروزی این را
 * درست انجام می‌دهند.
 */
function buildReceipt(text, { cut = true, drawer = false } = {}) {
  const parts = [
    Buffer.from([0x1b, 0x40]), // بازنشانی چاپگر
    Buffer.from([0x1b, 0x74, 0x16]), // کدصفحه: عربی
    Buffer.from(text, 'utf8'),
    Buffer.from('\n\n\n', 'utf8'), // فاصله تا تیغهٔ برش
  ];

  if (cut) parts.push(Buffer.from([0x1d, 0x56, 0x42, 0x00])); // برش جزئی
  if (drawer) parts.push(KICK_DRAWER);

  return Buffer.concat(parts);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;

      // سقف یک مگابایت: رسید هرگز این‌قدر بزرگ نیست و بدون سقف، یک
      // درخواست بد می‌تواند حافظه را پر کند.
      if (size > 1_000_000) {
        reject(new Error('حجم درخواست بیش از حد است'));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('بدنهٔ درخواست JSON معتبر نیست'));
      }
    });

    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  cors(res, origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // وضعیت: صفحهٔ وب با همین بررسی می‌فهمد عامل نصب است یا نه، و اگر نه
  // به چاپ معمولی مرورگر برمی‌گردد.
  if (req.url === '/status') {
    json(res, 200, {
      ok: true,
      agent: 'molido-print-agent',
      version: 1,
      printer: PRINTER || 'default',
      platform: process.platform,
    });
    return;
  }

  if (origin && !ALLOWED.has(origin)) {
    json(res, 403, { ok: false, error: 'این مبدأ مجاز نیست' });
    return;
  }

  try {
    if (req.url === '/print' && req.method === 'POST') {
      const body = await readBody(req);

      if (!body.text) {
        json(res, 400, { ok: false, error: 'متن رسید لازم است' });
        return;
      }

      await sendRaw(
        buildReceipt(String(body.text), {
          cut: body.cut !== false,
          drawer: body.drawer === true,
        }),
      );

      json(res, 200, { ok: true });
      return;
    }

    if (req.url === '/drawer' && req.method === 'POST') {
      await sendRaw(KICK_DRAWER);
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { ok: false, error: 'مسیر یافت نشد' });
  } catch (error) {
    json(res, 500, { ok: false, error: String(error.message || error) });
  }
});

// فقط لوکال: عامل نباید از شبکه در دسترس باشد.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`عامل چاپ Molido روی http://127.0.0.1:${PORT}`);
  console.log(`چاپگر: ${PRINTER || 'پیش‌فرض سیستم'}`);
  console.log('برای توقف: Ctrl+C');
});
