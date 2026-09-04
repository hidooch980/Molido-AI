import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { runInTenant } from './tenant-context';

/**
 * زمینهٔ شرکتِ درخواست را برقرار می‌کند تا `DatabaseService` بتواند آن را
 * روی اتصال بنشاند و سیاست‌های RLS بخوانندش.
 *
 * چرا Interceptor و نه Middleware: توکن را `JwtAuthGuard` باز می‌کند و
 * Guardها **پس از** Middleware ولی **پیش از** Interceptor اجرا می‌شوند؛ پس
 * تنها اینجاست که هم `req.user` موجود است و هم هنوز به handler نرسیده‌ایم.
 *
 * چرا Observable دستی: اگر فقط `runInTenant(ctx, () => next.handle())`
 * نوشته شود، Nest همان Observable را بیرون از دامنهٔ ALS مشترک می‌کند و
 * handler خارج از زمینه اجرا می‌شود.  اشتراک باید *داخل* دامنه انجام شود.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: { companyId?: string | null; userId?: string | null };
      shopCompanyId?: string | null;
    }>();

    // `shopCompanyId` را فقط `ShopTenantMiddleware` می‌گذارد و مقدارش از
    // پیکربندی سرور می‌آید، نه از درخواست.  بدون آن، صفحه‌های عمومی
    // فروشگاه اینترنتی — که کاربر لاگین ندارند — به‌خاطر رفتار fail-closed
    // هیچ کالایی نمی‌دیدند.
    const tenant = {
      companyId: request?.user?.companyId ?? request?.shopCompanyId ?? null,
      userId: request?.user?.userId ?? null,
    };

    return new Observable((subscriber) => {
      let teardown: { unsubscribe(): void } | undefined;

      runInTenant(tenant, () => {
        teardown = next.handle().subscribe(subscriber);
      });

      return () => teardown?.unsubscribe();
    });
  }
}
