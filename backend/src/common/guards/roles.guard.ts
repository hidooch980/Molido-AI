import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PERMISSION_KEY } from '../decorators/permission.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { defaultRolesFor } from '../../roles/permission-catalog';
import { PermissionsService } from './permissions.service';

/**
 * نگهبان نقش — با امکان بازنویسی از رابط.
 *
 * ترتیب تصمیم عمدی است:
 *
 *   ۱. مسیری که **نه** `@Roles` دارد و **نه** `@Permission`، باز است.
 *   ۲. مدیر ارشد همیشه اجازه دارد.
 *   ۳. اگر مسیر `@Permission` دارد و برای این نقش بازنویسی‌ای ثبت
 *      شده، همان حرفِ آخر است — چه اجازه بدهد چه بگیرد.
 *   ۴. اگر `@Roles` نیست، `defaultRoles` فهرست اختیارات اعمال می‌شود.
 *   ۵. وگرنه همان `@Roles` کد.
 *
 * ⚠️ گام ۳ یعنی **جدولِ خالی دقیقاً رفتار پیش‌فرض را می‌دهد**.
 *
 *    استقرارِ بازنویسی‌ها نباید هیچ‌چیز را عوض کند تا وقتی کسی عمداً
 *    چیزی را عوض کند.
 *
 * ⚠️ گام ۱ قبلاً فقط `@Roles` را می‌دید — و همان یک حفره بود.
 *
 *    مسیری با `@Permission` تنها، برای هر کاربرِ واردشده باز می‌ماند.
 *    در آزمون زنده ثابت شد و اینجا رفع شده؛ شرحش پایین‌تر است.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // ⚠️ `@Permission` بدون `@Roles` قبلاً **هیچ محافظتی نداشت**.
    //
    //    نسخهٔ اول همین‌جا `return true` می‌کرد وقتی `@Roles` نبود — و
    //    این پیش از خواندنِ `@Permission` بود.  یعنی مسیری که فقط
    //    `@Permission('sales:report')` داشت، برای **هر کاربرِ
    //    واردشده** باز بود.
    //
    //    در آزمون زنده ثابت شد: کاربرِ نقشِ EMPLOYEE به
    //    `/reports/sales` رسید — با اینکه فهرست اختیارات می‌گوید این
    //    کار مالِ SUPER_ADMIN/ADMIN/MANAGER/ACCOUNTANT است.
    //
    //    و بدترین بخشش این بود که مدیر در جدولِ اختیارات می‌دید
    //    «کارمند: ممنوع» و باور می‌کرد اعمال شده.  رابطی که دروغ
    //    بگوید، از رابطی که چیزی نگوید بدتر است.
    //
    //    حالا `@Permission` پیش از این بررسی خوانده می‌شود، و اگر
    //    باشد `defaultRoles` فهرست جای `@Roles` نبود را می‌گیرد.
    if ((!requiredRoles || requiredRoles.length === 0) && !permission) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // مدیر ارشد هرگز محدود نمی‌شود — وگرنه یک پیکربندی غلط نصب را
    // قفل می‌کند و راهِ برگشتی جز دست بردن در دیتابیس نمی‌ماند.
    if (user.role === 'SUPER_ADMIN') return true;

    if (permission) {
      const override = await this.permissions.overrideFor(
        user.companyId,
        user.role,
        permission,
      );
      // `null` یعنی «بازنویسی‌ای نیست»، که با «ممنوع» فرق دارد.
      if (override !== null) return override;
    }

    // ⚠️ وقتی `@Roles` نیست، `defaultRoles` فهرست حرفِ آخر است.
    //
    //    این همان چیزی است که در رابطِ اختیارات به مدیر نشان داده
    //    می‌شود — پس باید همان هم اعمال شود.  وگرنه فهرست تزئین است.
    if (!requiredRoles || requiredRoles.length === 0) {
      const fallback = permission ? defaultRolesFor(permission) : null;
      // کلیدی که در فهرست نیست: بسته می‌ماند.  کلیدِ ناشناخته یعنی
      // یا غلط املایی است یا از فهرست حذف شده — هیچ‌کدام دلیلِ باز
      // گذاشتنِ در نیست.
      return fallback ? fallback.includes(user.role) : false;
    }

    return requiredRoles.includes(user.role);
  }
}
