/**
 * راستی‌آزمایی QR با یک رمزگشای مستقل.
 *
 * تولیدکننده (`qrcode`) و رمزگشا (`jsqr`) دو کتابخانهٔ جدا هستند؛ اگر یکی
 * بودند، این فقط سازگاری کد با خودش را ثابت می‌کرد نه اینکه اسکنر واقعی
 * می‌خواندش.
 *
 * چرا مهم است: هویت مشتری پای صندوق به همین QR وابسته است.  توکنی که
 * خوانده نشود یعنی صندوق‌دار باید مشتری را دستی پیدا کند و کل قابلیت
 * بی‌فایده می‌شود.
 *
 * اجرا:  node scripts/verify-qr.mjs
 */

import jsQR from 'jsqr';
import QRCode from 'qrcode';

/** ماژول‌های QR را به تصویر RGBA تبدیل می‌کند، همان‌طور که روی canvas می‌نشیند. */
function render(text, scale = 4, quiet = 4) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const bits = qr.modules.data;

  const side = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!bits[y * size + x]) continue;

      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const px = (x + quiet) * scale + dx;
          const py = (y + quiet) * scale + dy;
          const index = (py * side + px) * 4;
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
        }
      }
    }
  }

  return { data, side };
}

let pass = 0;
let fail = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    pass += 1;
    console.log('  OK   ' + label);
  } else {
    fail += 1;
    console.log(`  FAIL ${label} (got=${actual} want=${expected})`);
  }
}

// شکل واقعی توکن: پیشوند + base64url
const token = 'MC1:8mPq2_ZvKrT4xL9nB6wYaHdE';
const main = render(token);
check('token round-trips', jsQR(main.data, main.side, main.side)?.data, token);

// اگر دو توکن یک تصویر می‌ساختند، هر مشتری می‌توانست جای دیگری شناسایی شود.
const a = render('MC1:aaaaaaaaaaaaaaaaaaaaaaaa');
const b = render('MC1:bbbbbbbbbbbbbbbbbbbbbbbb');
check(
  'different tokens differ',
  Buffer.from(a.data).equals(Buffer.from(b.data)),
  false,
);
check('token A decodes', jsQR(a.data, a.side, a.side)?.data, 'MC1:aaaaaaaaaaaaaaaaaaaaaaaa');
check('token B decodes', jsQR(b.data, b.side, b.side)?.data, 'MC1:bbbbbbbbbbbbbbbbbbbbbbbb');

// حاشیهٔ سفید باید واقعاً کشیده شود.
//
// `jsqr` بدون حاشیه هم می‌خواند چون سخت‌گیری دوربین واقعی را ندارد؛ پس
// به‌جای آزمودن «خوانده نمی‌شود»، خودِ وجود حاشیه بررسی می‌شود — همان
// چیزی که استاندارد برای اسکنر فیزیکی لازم می‌داند.
const corner = (img) => {
  const i = 0;
  return img.data[i] === 255 && img.data[i + 1] === 255 && img.data[i + 2] === 255;
};
check('quiet zone is white', corner(main), true);

const noQuiet = render(token, 4, 0);
check('without margin the corner is not white', corner(noQuiet), false);

// مقیاس کوچک: روی صفحهٔ موبایل کم‌تراکم، QR نباید بشکند.
const small = render(token, 2, 4);
check('small scale still reads', jsQR(small.data, small.side, small.side)?.data, token);

console.log(`\n   PASS: ${pass}   FAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
