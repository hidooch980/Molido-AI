import { FEATURE_KEY } from './edition.interceptor';

/**
 * برچسب‌گذاریِ خودکارِ کنترلرها با قابلیتِ فروش.
 *
 * ---------- چرا خودکار و نه دستی ----------
 *
 * ⚠️ برچسب زدنِ دستیِ ده‌ها کنترلر یعنی روزی یکی جا می‌ماند — و آن روز
 *    قابلیتی که مشتری نخریده باز می‌ماند، بی‌آنکه چیزی قرمز شود.
 *
 *    خطای «برچسب فراموش شد» بی‌صداست: همه‌چیز کار می‌کند، فقط رایگان.
 *
 * ⚠️ منبعِ حقیقت از قبل وجود دارد: `FEATURE_MODULES` در `app.module.ts`
 *    می‌گوید کدام ماژول به کدام قابلیت تعلق دارد.  همان نگاشت اینجا
 *    خوانده می‌شود و روی کنترلرهایش برچسب می‌نشیند.
 *
 *    پس افزودنِ ماژولِ تازه به یک قابلیت، خودبه‌خود گیتش را هم می‌گذارد.
 *    دو فهرستِ موازی وجود ندارد که از هم دور بیفتند.
 *
 * ---------- قابلیت‌های هسته برچسب نمی‌گیرند ----------
 *
 * `catalogue` و `sales` در همهٔ نسخه‌ها هستند و بدونشان نرم‌افزار کار
 * نمی‌کند.  برچسب زدنشان یعنی یک اشتباه در دادهٔ `PlanDefault` کلِ
 * سامانه را می‌خواباند.
 */

/** قابلیت‌هایی که در همهٔ نسخه‌ها هستند و گیت نمی‌شوند. */
const ALWAYS_INCLUDED = new Set(['catalogue', 'sales']);

/**
 * روی هر کنترلرِ ماژول‌های یک قابلیت، فراداده می‌نشاند.
 *
 * ⚠️ فراداده روی **کلاسِ کنترلر** می‌نشیند نه روی ماژول، چون
 *    `Reflector.getAllAndOverride` در زمانِ درخواست کلاس و متد را
 *    می‌بیند، نه ماژولِ دربرگیرنده.
 */
export function tagFeatureModules(
  featureModules: Record<string, unknown[]>,
): { tagged: number; skipped: string[] } {
  let tagged = 0;
  const skipped: string[] = [];

  for (const [feature, modules] of Object.entries(featureModules)) {
    if (ALWAYS_INCLUDED.has(feature)) {
      skipped.push(feature);
      continue;
    }

    for (const mod of modules) {
      const controllers: unknown[] =
        Reflect.getMetadata('controllers', mod as object) ?? [];
      for (const controller of controllers) {
        // ⚠️ برچسبِ موجود بازنویسی نمی‌شود.
        //    اگر کنترلری عمداً `@Feature(...)`ِ دقیق‌تری گرفته، همان
        //    می‌ماند — مثلاً کنترلری که در دو ماژول ثبت شده.
        if (Reflect.getMetadata(FEATURE_KEY, controller as object)) continue;
        Reflect.defineMetadata(FEATURE_KEY, feature, controller as object);
        tagged += 1;
      }
    }
  }

  // ⚠️ شمارِ برچسب‌ها در راه‌اندازی چاپ می‌شود.
  //
  //    اگر روزی نگاشت عوض شود و برچسبی ننشیند، این عدد افت می‌کند و
  //    دیده می‌شود.  بدونش، «صفر کنترلر برچسب خورد» دقیقاً شبیهِ
  //    «همه‌چیز درست است» به نظر می‌رسد.
  // eslint-disable-next-line no-console
  console.log(`🔒 گیتِ نسخه: ${tagged} کنترلر برچسب خورد`);

  return { tagged, skipped };
}
