import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { DatabaseService } from '../database/database.service';
import { runInTenant } from '../database/tenant-context';

/**
 * احراز هویت مشتری فروشگاه — جدا از کارکنان.
 *
 * پیش از این مشتری با هدر `x-customer-id` شناسایی می‌شد؛ یعنی هر کسی با
 * حدس یا دیدن یک شناسه می‌توانست سفارش‌های آن مشتری را ببیند و به نامش
 * سفارش ثبت کند.  حالا توکن امضاشده است.
 *
 * **`kind: 'customer'` در محتوای توکن حیاتی است.**  بدون آن، توکن کارمند و
 * مشتری با یک کلید امضا می‌شوند و از هم قابل تشخیص نیستند: مشتری
 * می‌توانست توکنش را به API کارکنان بدهد و — چون `companyId` دارد —
 * از RLS هم رد شود.
 */

/**
 * سنجشِ **زندهٔ** وضعیت مشتری.
 *
 * ⚠️ پیش از این، نگهبان به پایگاه داده نمی‌زد.
 *
 *    یعنی توکنِ امضاشده تا لحظهٔ انقضا معتبر بود، **هرچه هم که بعدش
 *    اتفاق می‌افتاد** — و عمرِ توکنِ مشتری **سی روز** است.
 *
 *    `login` وضعیت `isActive` را می‌سنجد، ولی نگهبان نه.  نتیجه‌اش این
 *    بود که فروشگاهی که مشتریِ متخلف را مسدود می‌کرد:
 *
 *      ورودِ تازه            → ۴۰۱  (درست)
 *      توکنِ موجودش روی سبد  → **۲۰۰**
 *
 *    یعنی مسدود کردن کاری نمی‌کرد و صاحب فروشگاه باور داشت که کرده.
 *    همان اشکالی که در `jwt.strategy.ts` برای کارکنان بسته شد، اینجا
 *    باز مانده بود — با پنجره‌ای چهار برابرِ بلندتر.
 *
 * ⚠️ `runInTenant` لازم است، و `runAsSystem` **کار نمی‌کند**.
 *
 *    نگهبان‌ها **پیش از** اینترسپتورها اجرا می‌شوند، پس زمینهٔ شرکت هنوز
 *    نوشته نشده و `app.company_id` تهی است.  سیاست RLS روی `Customer`
 *    چنین است:
 *
 *      "companyId" = NULLIF(current_setting('app.company_id', true), '')
 *
 *    رشتهٔ تهی به NULL بدل می‌شود و `"companyId" = NULL` همیشه NULL است
 *    — یعنی **هیچ ردیفی**.
 *
 *    نسخهٔ اول این تابع `runAsSystem` می‌گذاشت، به این گمان که «سیستمی»
 *    یعنی بی‌محدودیت.  ولی سیاست فقط برای نقشِ **صاحبِ جدول** باز است،
 *    نه برای `molido_app`.  نتیجه‌اش دقیقاً برعکسِ هدف بود: هر مشتریِ
 *    **فعال** ۴۰۱ می‌گرفت و مسدودشده هم — یعنی فروشگاه از کار می‌افتاد
 *    با پیامی که شبیه «توکن نامعتبر» بود.
 *
 *    `companyId` از توکنِ **امضاشده** می‌آید، پس جعل‌شدنی نیست؛ و
 *    `CustomerAuthGuard` پیش از این تابع آن را با `shopCompanyId`
 *    سنجیده.  همان کاری که `TenantInterceptor` برای کارکنان می‌کند.
 */
async function assertActive(
  db: DatabaseService,
  customerId: string,
  companyId: string,
): Promise<void> {
  const rows = await runInTenant({ companyId, userId: null }, () =>
    db.query<{ isActive: boolean }>(
      'SELECT "isActive" FROM "Customer" WHERE id = $1 AND "companyId" = $2',
      [customerId, companyId],
    ),
  );

  // حسابِ حذف‌شده: توکنش امضای معتبر دارد ولی پشتش کسی نیست.
  if (!rows[0]) throw new UnauthorizedException('حساب شما یافت نشد');
  if (!rows[0].isActive) {
    throw new UnauthorizedException('حساب شما غیرفعال شده است');
  }
}


export type CustomerToken = {
  sub: string;
  companyId: string;
  phone: string;
  kind: 'customer';
};

/** درخواستی که از این نگهبان گذشته، مشتریِ تأییدشده دارد. */
export type CustomerRequest = Request & {
  customer?: CustomerToken;
  shopCompanyId?: string;
};

@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('برای این کار باید وارد شوید');
    }

    let payload: CustomerToken;

    try {
      payload = this.jwt.verify<CustomerToken>(header.slice(7));
    } catch {
      throw new UnauthorizedException('نشست شما منقضی شده است');
    }

    // توکن کارمند `kind` ندارد؛ این بررسی جلوی استفادهٔ متقابل را می‌گیرد.
    if (payload?.kind !== 'customer') {
      throw new UnauthorizedException('این توکن برای فروشگاه معتبر نیست');
    }

    // مشتری باید به همان شرکتی تعلق داشته باشد که این فروشگاه سرو می‌کند.
    // بدون این، توکن معتبرِ یک فروشگاه روی فروشگاه دیگر کار می‌کرد.
    if (
      request.shopCompanyId &&
      payload.companyId !== request.shopCompanyId
    ) {
      throw new UnauthorizedException('این توکن برای این فروشگاه معتبر نیست');
    }

    await assertActive(this.db, payload.sub, payload.companyId);

    request.customer = payload;
    return true;
  }
}

/** مشتریِ تأییدشدهٔ درخواست جاری. */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CustomerToken => {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    return request.customer as CustomerToken;
  },
);

/**
 * نگهبان اختیاری — برای سبد خرید.
 *
 * مهمانِ بدون حساب هم باید بتواند کالا در سبد بگذارد، وگرنه نرخ تبدیل
 * فروشگاه به‌شدت افت می‌کند.  پس نبودِ توکن مانع نیست.
 *
 * ولی توکنِ **جعلی** هم نباید بی‌سروصدا نادیده گرفته شود: اگر کسی توکن
 * دستکاری‌شده بفرستد، درخواست رد می‌شود نه اینکه مهمان فرض شود — وگرنه
 * تلاش برای نفوذ هیچ‌وقت دیده نمی‌شد.
 */
@Injectable()
export class OptionalCustomerGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) return true;

    let payload: CustomerToken;

    try {
      payload = this.jwt.verify<CustomerToken>(header.slice(7));
    } catch {
      throw new UnauthorizedException('نشست شما منقضی شده است');
    }

    if (payload?.kind !== 'customer') {
      throw new UnauthorizedException('این توکن برای فروشگاه معتبر نیست');
    }

    // ⚠️ مشتریِ غیرفعال «مهمان» فرض نمی‌شود، رد می‌شود.
    //
    //    وگرنه سبدِ مهمانش ساخته می‌شد و در پرداخت با پیامی نامربوط
    //    شکست می‌خورد — و او نمی‌فهمید که حسابش مسدود است.
    await assertActive(this.db, payload.sub, payload.companyId);

    request.customer = payload;
    return true;
  }
}
