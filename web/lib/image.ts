/**
 * کوچک کردنِ عکس در مرورگر، پیش از آپلود.
 *
 * ⚠️ چرا لازم است؟
 *
 *    عکسِ خامِ گوشیِ امروزی سه تا هشت مگابایت است.  انبار معمولاً
 *    آنتنِ ضعیف دارد و آپلودِ چنین فایلی یا دقایق طول می‌کشد یا
 *    نیمه‌کاره می‌ماند — و انباردار نمی‌فهمد چرا.
 *
 *    سقفِ سرور هم ده مگابایت است (`uploads.controller.ts`)، پس عکسِ
 *    دو دوربینِ پشتِ سرِ هم می‌تواند اصلاً رد شود.
 *
 * ⚠️ خروجی همیشه JPEG است، حتی اگر ورودی PNG باشد.
 *
 *    عکسِ کالا عکسِ طبیعی است، نه نمودار؛ PNG برایش چند برابر بزرگ‌تر
 *    می‌شود بی‌آنکه چیزی به کیفیتِ دیده‌شده اضافه کند.
 *
 * ⚠️ اگر چیزی خطا داد، فایلِ اصلی برگردانده می‌شود.
 *
 *    نتوانستنِ فشرده‌سازی نباید ثبتِ فاکتور را بشکند: آپلودِ کند بهتر
 *    از آپلودِ انجام‌نشده است.
 */
export async function shrinkImage(
  file: File,
  maxPx = 1600,
  quality = 0.82,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (typeof createImageBitmap !== 'function') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));

    // از قبل کوچک است — دوباره رمزگذاری فقط کیفیت را می‌خورد.
    if (scale === 1 && file.size < 1_000_000) {
      bitmap.close();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) return file;

    // اگر فشرده‌سازی بزرگ‌ترش کرد (ورودیِ از قبل بهینه)، اصل را نگه دار.
    if (blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
