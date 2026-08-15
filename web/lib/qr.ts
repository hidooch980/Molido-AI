import QRCode from 'qrcode';

/**
 * رسم QR روی canvas.
 *
 * از کتابخانهٔ `qrcode` استفاده می‌شود نه پیاده‌سازی دست‌نویس.  کدگذاری QR
 * — Reed-Solomon، ماسک‌گذاری، اطلاعات قالب — جایی است که یک اشتباه ریز،
 * کدی می‌سازد که *تقریباً* درست است و فقط روی بعضی اسکنرها خوانده می‌شود.
 * و این کد هویت مشتری را پای صندوق تعیین می‌کند؛ «احتمالاً درست» کافی
 * نیست.
 *
 * سطح تصحیح خطا M: صفحهٔ موبایل انگشت‌زده و کم‌نور است و L در آن شرایط
 * ناخوانا می‌شود؛ H کد را بی‌دلیل چگال‌تر می‌کند.
 */
export async function drawQr(canvas: HTMLCanvasElement, text: string) {
  await QRCode.toCanvas(canvas, text, {
    errorCorrectionLevel: 'M',
    // حاشیهٔ سفید اختیاری نیست: بدون آن اسکنر لبهٔ کد را پیدا نمی‌کند.
    margin: 3,
    width: canvas.width,
    color: { dark: '#000000', light: '#ffffff' },
  });
}
