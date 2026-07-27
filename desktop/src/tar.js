'use strict';

/**
 * بسته‌بندی و بازگشایی tar بدون وابستگی بیرونی.
 *
 * بسته embedded-postgres فقط initdb/pg_ctl/postgres را دارد و pg_dump
 * در آن نیست، بنابراین پشتیبان‌گیری به صورت «کپی سرد» از پوشه داده
 * انجام می‌شود. برای اینکه ۷۰ مگابایت و ۲۰۰۰ فایل به یک فایل فشرده
 * تبدیل شود، از قالب استاندارد ustar استفاده می‌کنیم.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const BLOCK = 512;

function octal(value, length) {
  // فیلدهای عددی tar به صورت اکتال با صفر پیشوند و پایان‌یافته به NUL
  return value.toString(8).padStart(length - 1, '0') + '\0';
}

/** هدر ۵۱۲ بایتی یک عضو آرشیو را می‌سازد. */
function header(name, size, mode, mtime, typeflag) {
  const buf = Buffer.alloc(BLOCK);

  // مسیرهای بلندتر از ۱۰۰ بایت به name/prefix تقسیم می‌شوند.
  let filename = name;
  let prefix = '';

  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf('/', name.length - 100);

    if (cut === -1) {
      throw new Error(`مسیر برای قالب tar بیش از حد بلند است: ${name}`);
    }

    prefix = name.slice(0, cut);
    filename = name.slice(cut + 1);

    if (Buffer.byteLength(filename) > 100 || Buffer.byteLength(prefix) > 155) {
      throw new Error(`مسیر برای قالب tar بیش از حد بلند است: ${name}`);
    }
  }

  buf.write(filename, 0, 100, 'utf8');
  buf.write(octal(mode & 0o7777, 8), 100, 8, 'ascii');
  buf.write(octal(0, 8), 108, 8, 'ascii'); // uid
  buf.write(octal(0, 8), 116, 8, 'ascii'); // gid
  buf.write(octal(size, 12), 124, 12, 'ascii');
  buf.write(octal(Math.floor(mtime / 1000), 12), 136, 12, 'ascii');
  buf.write('        ', 148, 8, 'ascii'); // checksum موقتاً فاصله
  buf.write(typeflag, 156, 1, 'ascii');
  buf.write('ustar\0', 257, 6, 'ascii');
  buf.write('00', 263, 2, 'ascii');
  buf.write(prefix, 345, 155, 'utf8');

  let sum = 0;

  for (const byte of buf) sum += byte;

  buf.write(octal(sum, 8), 148, 8, 'ascii');

  return buf;
}

function padding(size) {
  const rem = size % BLOCK;

  return rem === 0 ? 0 : BLOCK - rem;
}

/**
 * پوشه `sourceDir` را به صورت tar.gz در `outFile` می‌نویسد.
 * برمی‌گرداند: تعداد فایل و حجم نهایی.
 */
function packDirectory(sourceDir, outFile, options = {}) {
  const skip = options.skip ?? (() => false);
  const chunks = [];
  const now = Date.now();

  // مجوزهای POSIX روی ویندوز بی‌اثرند (PostgreSQL آنجا از ACL استفاده
  // می‌کند)، بنابراین به جای stat گرفتن از ۲۰۰۰ فایل — که تنها گلوگاه
  // سرعت بود — مقدار ثابت و امن می‌نویسیم.
  const FILE_MODE = 0o600;
  const DIR_MODE = 0o700;

  let fileCount = 0;

  function walk(dir, rel) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;

      if (skip(relPath, entry)) continue;

      // پیوندهای نمادین دنبال نمی‌شوند تا حلقه ایجاد نشود.
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        chunks.push(header(`${relPath}/`, 0, DIR_MODE, now, '5'));
        walk(full, relPath);
      } else if (entry.isFile()) {
        const data = fs.readFileSync(full);

        chunks.push(header(relPath, data.length, FILE_MODE, now, '0'));
        chunks.push(data);

        const pad = padding(data.length);

        if (pad > 0) chunks.push(Buffer.alloc(pad));

        fileCount += 1;
      }
    }
  }

  walk(sourceDir, '');

  // دو بلوک صفر، نشانه پایان آرشیو
  chunks.push(Buffer.alloc(BLOCK * 2));

  const gz = zlib.gzipSync(Buffer.concat(chunks), { level: 6 });

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, gz);

  return { fileCount, bytes: gz.length };
}

/** آرشیو tar.gz را در `targetDir` باز می‌کند. */
function unpackArchive(archiveFile, targetDir) {
  const buf = zlib.gunzipSync(fs.readFileSync(archiveFile));

  let offset = 0;
  let fileCount = 0;

  while (offset + BLOCK <= buf.length) {
    const head = buf.subarray(offset, offset + BLOCK);

    // بلوک تماماً صفر یعنی پایان آرشیو
    if (head.every((b) => b === 0)) break;

    const nameField = head.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = head.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const sizeField = head.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
    const typeflag = head.subarray(156, 157).toString('ascii');

    const size = parseInt(sizeField, 8) || 0;
    const name = prefix ? `${prefix}/${nameField}` : nameField;

    offset += BLOCK;

    // جلوگیری از خروج از پوشه مقصد (path traversal)
    const dest = path.join(targetDir, name);
    const resolved = path.resolve(dest);

    if (!resolved.startsWith(path.resolve(targetDir))) {
      throw new Error(`مسیر نامعتبر در آرشیو: ${name}`);
    }

    if (typeflag === '5') {
      fs.mkdirSync(resolved, { recursive: true });
    } else if (typeflag === '0' || typeflag === '\0') {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, buf.subarray(offset, offset + size));
      fileCount += 1;
    }

    offset += size + padding(size);
  }

  return { fileCount };
}

module.exports = { packDirectory, unpackArchive };
