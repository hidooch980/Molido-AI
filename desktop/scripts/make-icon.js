'use strict';

/**
 * تولید build/icon.ico بدون وابستگی گرافیکی.
 *
 * یک مربع گرد با گرادیان برند و حرف «M» رسم می‌کند و آن را به صورت
 * ICO حاوی PNG (پشتیبانی‌شده از ویندوز ویستا به بعد) ذخیره می‌کند.
 * اجرا: node scripts/make-icon.js
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const SIZE = 256;
const RADIUS = 56;

// ---------------------------------------------------------------- رسم

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/** فاصله تا مستطیل گردگوشه — برای لبه‌های نرم. */
function roundedRectDistance(x, y) {
  const half = SIZE / 2;
  const dx = Math.abs(x - half + 0.5) - (half - RADIUS);
  const dy = Math.abs(y - half + 0.5) - (half - RADIUS);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);

  return Math.sqrt(ox * ox + oy * oy) - RADIUS + Math.min(Math.max(dx, dy), 0);
}

/** آیا نقطه داخل حرف M است؟ M از سه ضلع مورب/عمودی ساخته می‌شود. */
function insideM(x, y) {
  const top = SIZE * 0.34;
  const bottom = SIZE * 0.68;
  const left = SIZE * 0.3;
  const right = SIZE * 0.7;
  const thickness = SIZE * 0.062;

  if (y < top || y > bottom) {
    return false;
  }

  // دو پایه عمودی
  if (Math.abs(x - left) <= thickness / 2) return true;
  if (Math.abs(x - right) <= thickness / 2) return true;

  // دو ضلع مورب که در وسط به هم می‌رسند
  const mid = (left + right) / 2;
  const apex = SIZE * 0.56;
  const t = (y - top) / (apex - top);

  if (y <= apex) {
    const leftEdge = left + (mid - left) * t;
    const rightEdge = right - (right - mid) * t;

    if (Math.abs(x - leftEdge) <= thickness / 2) return true;
    if (Math.abs(x - rightEdge) <= thickness / 2) return true;
  }

  return false;
}

function renderRGBA() {
  // هر ردیف با یک بایت فیلتر (۰) شروع می‌شود — فرمت خام PNG.
  const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
  let offset = 0;

  for (let y = 0; y < SIZE; y += 1) {
    raw[offset] = 0;
    offset += 1;

    for (let x = 0; x < SIZE; x += 1) {
      const t = (x / SIZE) * 0.45 + (y / SIZE) * 0.55;

      let r = lerp(99, 34, t);
      let g = lerp(102, 211, t);
      let b = lerp(241, 238, t);

      if (insideM(x, y)) {
        r = 255;
        g = 255;
        b = 255;
      }

      const dist = roundedRectDistance(x, y);
      const alpha = Math.round(255 * Math.min(Math.max(0.5 - dist, 0), 1));

      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      raw[offset + 3] = alpha;
      offset += 4;
    }
  }

  return raw;
}

// ---------------------------------------------------------------- PNG

function chunk(type, data) {
  const length = Buffer.alloc(4);

  length.writeUInt32BE(data.length);

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);

  crc.writeUInt32BE(crc32(body) >>> 0);

  return Buffer.concat([length, body, crc]);
}

let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = [];

    for (let n = 0; n < 256; n += 1) {
      let c = n;

      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }

      crcTable[n] = c;
    }
  }

  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return crc ^ 0xffffffff;
}

function buildPNG(raw) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);

  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // عمق بیت
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- ICO

function buildICO(png) {
  const header = Buffer.alloc(6);

  header.writeUInt16LE(0, 0); // رزرو
  header.writeUInt16LE(1, 2); // نوع: آیکون
  header.writeUInt16LE(1, 4); // تعداد تصویر

  const entry = Buffer.alloc(16);

  entry[0] = 0; // عرض ۲۵۶ با مقدار ۰ نمایش داده می‌شود
  entry[1] = 0; // ارتفاع ۲۵۶
  entry[2] = 0; // تعداد رنگ پالت
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // plane
  entry.writeUInt16LE(32, 6); // بیت بر پیکسل
  entry.writeUInt32BE(0, 8);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12);

  return Buffer.concat([header, entry, png]);
}

const out = path.join(__dirname, '..', 'build', 'icon.ico');

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buildICO(buildPNG(renderRGBA())));

console.log(`✔ آیکون ساخته شد: ${out}`);
