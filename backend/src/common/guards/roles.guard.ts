import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PERMISSION_KEY } from '../decorators/permission.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PermissionsService } from './permissions.service';

/**
 * نگهبان نقش — با امکان بازنویسی از رابط.
 *
 * ترتیب تصمیم عمدی است:
 *
 *   ۱. مسیری که `@Roles` ندارد، برای همه باز است (مثل قبل).
 *   ۲. مدیر ارشد همیشه اجازه دارد.
 *   ۳. اگر مسیر `@Permission` دارد و برای این نقش بازنویسی‌ای ثبت
 *      شده، همان حرفِ آخر است — چه اجازه بدهد چه بگیرد.
 *   ۴. وگرنه همان `@Roles` کد.
 *
 * ⚠️ گام ۴ یعنی **جدولِ خالی دقیقاً رفتار امروز را می‌دهد**.
 *
 *    این مهم‌ترین ویژگی این تغییر است: استقرارِ آن نباید هیچ‌چیز را
 *    عوض کند تا وقتی کسی عمداً چیزی را عوض کند.
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

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // مدیر ارشد هرگز محدود نمی‌شود — وگرنه یک پیکربندی غلط نصب را
    // قفل می‌کند و راهِ برگشتی جز دست بردن در دیتابیس نمی‌ماند.
    if (user.role === 'SUPER_ADMIN') return true;

    const permission = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (permission) {
      const override = await this.permissions.overrideFor(
        user.companyId,
        user.role,
        permission,
      );
      // `null` یعنی «بازنویسی‌ای نیست»، که با «ممنوع» فرق دارد.
      if (override !== null) return override;
    }

    return requiredRoles.includes(user.role);
  }
}
