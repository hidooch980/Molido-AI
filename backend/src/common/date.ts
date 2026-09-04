import { BadRequestException } from '@nestjs/common';

/**
 * تاریخِ آمده از کاربر را با خطای درست می‌خواند.
 *
 * ⚠️ `new Date(x)` روی ورودیِ خراب `Invalid Date` می‌دهد — و آن، خطا
 *    پرتاب نمی‌کند.
 *
 *    خطا وقتی درمی‌آید که آن مقدار به درایور پایگاه داده برسد و
 *    `toISOString()` روی `Invalid Date` بترکد.  نتیجه‌اش **۵۰۰** است:
 *
 *        /accounting/summary?from=garbage   =>  ۵۰۰
 *        /accounting/summary?from=۱۴۰۴      =>  ۵۰۰
 *
 *    اولی فقط لاگ را کثیف می‌کند.  دومی مسئلهٔ واقعی است: کاربر
 *    ایرانی رقم فارسی تایپ می‌کند، و «خطای سرور» به او می‌گوید سامانه
 *    خراب است — نه اینکه ورودی‌اش را عوض کند.
 *
 * پس دو کار: رقم فارسی/عربی به لاتین، و در نهایتِ ناتوانی، ۴۰۰ با
 * پیامی که می‌گوید کدام میدان و چه مقداری.
 */

const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

/** رقم فارسی و عربی به لاتین. */
export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = FA.indexOf(d);
    return String(i >= 0 ? i : AR.indexOf(d));
  });
}

/**
 * تاریخ را می‌خواند یا ۴۰۰ می‌دهد.
 *
 * `field` در پیام می‌آید تا کاربر بداند کدام کادر را درست کند — با سه
 * کادرِ تاریخ در یک فرم، «تاریخ نامعتبر» به‌تنهایی کمکی نمی‌کند.
 */
export function parseDate(value: string, field = 'تاریخ'): Date {
  const cleaned = normalizeDigits(String(value).trim());
  const date = new Date(cleaned);
  if (Number.isNaN(date.getTime())) {
    // خودِ مقدار در پیام می‌آید ولی بریده — ورودیِ بلندِ مهاجم نباید
    // در لاگ و پاسخ تکرار شود.
    const shown = cleaned.slice(0, 40);
    throw new BadRequestException(`«${field}» تاریخ معتبری نیست: ${shown}`);
  }
  return date;
}

/**
 * مثل `parseDate` ولی مقدارِ نداده را `undefined` می‌دهد.
 *
 * برای پارامترهای اختیاریِ گزارش‌ها (`?from=&to=`) که نبودشان یعنی
 * «بی‌محدودیت»، نه «تاریخِ خراب».
 */
export function parseDateOptional(
  value: string | undefined | null,
  field = 'تاریخ',
): Date | undefined {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined;
  }
  return parseDate(String(value), field);
}
