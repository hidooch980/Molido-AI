'use strict';

/**
 * لاگ ساده روی فایل — برای عیب‌یابی نصب‌های کاربر نهایی.
 * محل فایل: %APPDATA%/Molido AI/molido.log
 */

const fs = require('node:fs');
const path = require('node:path');
const { paths } = require('./paths');

let stream = null;

function open() {
  if (stream) {
    return stream;
  }

  fs.mkdirSync(path.dirname(paths.logFile), { recursive: true });

  // در هر اجرا لاگ را از نو می‌سازیم تا فایل بی‌نهایت رشد نکند.
  stream = fs.createWriteStream(paths.logFile, { flags: 'w' });

  return stream;
}

function write(level, message) {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;

  try {
    open().write(`${line}\n`);
  } catch {
    // اگر نوشتن لاگ شکست خورد نباید اجرای برنامه متوقف شود.
  }

  if (level === 'ERROR') {
    console.error(line);
  } else {
    console.log(line);
  }
}

module.exports = {
  info: (message) => write('INFO', message),
  warn: (message) => write('WARN', message),
  error: (message) => write('ERROR', message),
  /** خروجی خام یک زیرفرایند را با پیشوند در لاگ ثبت می‌کند. */
  pipe: (prefix, chunk) => {
    const text = String(chunk).trimEnd();

    if (text) {
      write('PROC', `${prefix}: ${text}`);
    }
  },
  file: paths.logFile,
};
