import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

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
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
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
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
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

    request.customer = payload;
    return true;
  }
}
