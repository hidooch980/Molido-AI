import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP — رمزِ یک‌بارمصرفِ زمان‌محور (RFC 6238).
 *
 * ⚠️ عمداً **بدون وابستگیِ تازه** نوشته شد.
 *
 *    کتابخانه‌های آمادهٔ TOTP هر کدام چند هزار خط و چند وابستگیِ
 *    زنجیره‌ای می‌آورند.  خودِ الگوریتم سی خط است و روی `node:crypto`
 *    سوار می‌شود — که از قبل در پروژه هست و ممیزیِ امنیتی شده.
 *
 *    این پروژه عمداً کم‌وابسته است (وب فقط چهار وابستگی دارد).  افزودنِ
 *    یک درختِ وابستگی برای سی خط ریاضی، سطحِ حمله را بی‌دلیل بزرگ
 *    می‌کند — و رمزِ دومرحله‌ای دقیقاً جایی است که نباید کد ناشناخته
 *    اجرا شود.
 *
 * ⚠️ SHA-1 اینجا **درست** است، نه ضعف.
 *
 *    RFC 6238 و همهٔ برنامه‌های احرازکننده (Google Authenticator،
 *    Authy، ...) پیش‌فرض SHA-1 دارند.  ضعف‌های شناخته‌شدهٔ SHA-1
 *    برخوردمحورند و به HMAC ربطی ندارند.  عوض کردنش یعنی کاربر
 *    نمی‌تواند با برنامهٔ معمولی‌اش کد بگیرد.
 */

/** طولِ گام — سی ثانیه، پیش‌فرضِ همهٔ برنامه‌های احرازکننده. */
const STEP_SECONDS = 30;

/** شش رقم — همان چیزی که کاربر انتظار دارد تایپ کند. */
const DIGITS = 6;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * رازِ تازه به قالب base32.
 *
 * ⚠️ بیست بایت (۱۶۰ بیت) — توصیهٔ RFC 4226.
 *
 *    کوتاه‌ترش با برنامه‌های احرازکننده هم کار می‌کند، ولی حاشیهٔ
 *    امنیتی را بی‌دلیل کم می‌کند.  این راز تا وقتی کاربر MFA را خاموش
 *    نکند زنده است.
 */
export function generateSecret(): string {
  const buf = randomBytes(20);
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');

  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = '';
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    // نویسهٔ نامعتبر: رازِ خراب باید همان‌جا رد شود، نه اینکه کدی
    // تولید کند که هرگز با برنامهٔ کاربر جور درنمی‌آید.
    if (idx < 0) throw new Error('راز TOTP نامعتبر است');
    bits += idx.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** کدِ همان گام. */
function codeAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();

  // «برشِ پویا» — RFC 4226 §5.4
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * سنجشِ کدِ واردشده.
 *
 * ⚠️ پنجرهٔ ±۱ گام، نه بیشتر.
 *
 *    ساعتِ گوشیِ کاربر معمولاً چند ثانیه با سرور فرق دارد، و خودِ
 *    تایپ کردن هم چند ثانیه طول می‌کشد.  بدونِ ارفاق، کاربری که دقیقاً
 *    روی مرزِ سی‌ثانیه کد بزند شکست می‌خورد و فکر می‌کند برنامه‌اش خراب
 *    است.
 *
 *    ولی پنجرهٔ بزرگ‌تر یعنی هر کد دقایق طولانی‌تری زنده می‌ماند —
 *    یعنی کدی که مهاجم از روی شانهٔ کاربر دیده، فرصت بیشتری دارد.
 *    ±۱ یعنی حداکثر نود ثانیه، که تعادلِ پذیرفتهٔ استاندارد است.
 *
 * ⚠️ مقایسه **زمان‌ثابت** است.
 *
 *    مقایسهٔ معمولیِ رشته در اولین نویسهٔ متفاوت برمی‌گردد.  اختلافِ
 *    زمانش ناچیز است ولی روی شبکه و با هزاران تلاش قابل اندازه‌گیری —
 *    و کدِ شش‌رقمی آن‌قدر کوچک است که این نشت ارزشِ سوءاستفاده دارد.
 */
export function verifyCode(
  secret: string,
  entered: string,
  nowMs: number,
): boolean {
  const clean = (entered ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;

  const step = Math.floor(nowMs / 1000 / STEP_SECONDS);
  const candidate = Buffer.from(clean);

  for (const delta of [-1, 0, 1]) {
    const expected = Buffer.from(codeAt(secret, step + delta));
    if (expected.length === candidate.length && timingSafeEqual(expected, candidate)) {
      return true;
    }
  }
  return false;
}

/**
 * نشانیِ `otpauth://` برای QR.
 *
 * ⚠️ راز داخل این نشانی است.
 *
 *    یعنی این رشته دقیقاً به اندازهٔ خودِ راز حساس است و نباید در لاگ،
 *    گزارش خطا یا تاریخچهٔ مرورگر بنشیند.  فقط یک بار — هنگام
 *    راه‌اندازی — به کاربر داده می‌شود و دیگر هرگز قابل بازیابی نیست.
 */
export function otpauthUrl(secret: string, email: string, issuer = 'Molido'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * کدهای بازیابی.
 *
 * ⚠️ بدونِ اینها، گم شدنِ گوشی یعنی از دست رفتنِ حساب.
 *
 *    و برای مدیرِ یک فروشگاه، «حسابم را از دست دادم» یعنی کلِ
 *    کسب‌وکار خوابیده.  MFA بدون راهِ بازیابی، امنیت نیست — خطرِ
 *    عملیاتی است.
 */
export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    // ده نویسهٔ base32 ≈ ۵۰ بیت — حدس زدنش عملی نیست، و کوتاه است
    // که کاربر بتواند روی کاغذ بنویسد.
    const raw = randomBytes(7);
    let bits = '';
    for (const b of raw) bits += b.toString(2).padStart(8, '0');
    let code = '';
    for (let j = 0; j + 5 <= bits.length && code.length < 10; j += 5) {
      code += BASE32[parseInt(bits.slice(j, j + 5), 2)];
    }
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return codes;
}
