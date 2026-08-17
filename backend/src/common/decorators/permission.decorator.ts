import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'permission';

/**
 * کلیدِ اختیارِ یک مسیر — برای بازنویسی از رابط.
 *
 * کنار `@Roles` می‌نشیند، نه به‌جایش:
 *
 *     @Roles('ADMIN', 'MANAGER')
 *     @Permission('sales:cancel')
 *
 * `@Roles` پیش‌فرض است و `@Permission` نامی می‌دهد که مدیر بتواند
 * همان پیش‌فرض را عوض کند.  مسیری که `@Permission` ندارد، قابل
 * بازنویسی نیست و همیشه همان `@Roles` را می‌بیند — که برای مسیرهای
 * حساس (تغییر خودِ اختیارات، پشتیبان‌گیری) عمدی است.
 *
 * ⚠️ کلید «حوزه:کار» است نه فقط «حوزه».
 *
 *    «فروش» به‌تنهایی معنی ندارد: دیدنِ فهرست فروش با لغو کردنِ فاکتور
 *    یکی نیست، و مدیری که می‌خواهد صندوق‌دار گزارش ببیند نمی‌خواهد او
 *    بتواند فاکتور را لغو کند.
 */
export const Permission = (key: string) => SetMetadata(PERMISSION_KEY, key);
