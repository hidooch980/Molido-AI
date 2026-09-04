import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

import { SubscriptionService } from './subscription.service';

/**
 * گیتِ قابلیت بر اساس نسخهٔ فروش.
 *
 * ---------- چرا لازم است ----------
 *
 * ⚠️ پیش از این، سه نسخهٔ پایه/حرفه‌ای/پیشرفته فقط سقفِ کاربر و شعبه را
 *    محدود می‌کردند.  مشتریِ «پایه» کالابرگ، فروشگاه اینترنتی، CRM و
 *    خزانه را هم می‌گرفت — یعنی سه نسخه روی کاغذ بود و در عمل یکی.
 *
 * ---------- چرا اینترسپتور، نه نگهبان ----------
 *
 * ⚠️ نسخهٔ اول این را `CanActivate` نوشت و **کار نکرد** — بی‌آنکه خطایی
 *    بدهد.
 *
 *    در NestJS ترتیب چنین است:
 *      نگهبانِ سراسری → نگهبانِ کنترلر → اینترسپتور → هندلر
 *
 *    `JwtAuthGuard` روی کنترلرهاست، پس در لحظهٔ اجرای نگهبانِ **سراسری**
 *    هنوز `request.user` وجود ندارد.  کدِ من آن حالت را «شرکت معلوم
 *    نیست، بگذار رد شود» می‌گرفت — و نتیجه‌اش این بود که گیت هرگز
 *    چیزی را نبست.
 *
 *    سراسری کردنِ `JwtAuthGuard` هم راه نبود: `@Public()` در این پروژه
 *    وجود ندارد و مسیرهای عمومی (ورود، کاتالوگِ فروشگاه، منوی QR)
 *    می‌شکستند.
 *
 *    اینترسپتور **پس از** همهٔ نگهبان‌ها اجرا می‌شود، پس `request.user`
 *    قطعاً هست.  و پرتاب کردنِ استثنا از اینترسپتور همان ۴۰۲ را
 *    می‌دهد.
 *
 * ---------- ۴۰۲ نه ۴۰۳ ----------
 *
 * ⚠️ «دسترسی نداری» و «نخریده‌ای» دو چیزِ متفاوت‌اند.
 *
 *    اگر هر دو ۴۰۳ بدهند، رابط نمی‌داند پیامِ «از مدیر بخواه» نشان دهد
 *    یا «ارتقا بده» — و کاربر دنبالِ نقشِ گم‌شده می‌گردد در حالی که
 *    مشکل قرارداد است.
 */

export const FEATURE_KEY = 'molido:feature';

/** قابلیتی که این کنترلر یا مسیر به آن نیاز دارد. */
export const Feature = (feature: string) => SetMetadata(FEATURE_KEY, feature);

@Injectable()
export class EditionInterceptor implements NestInterceptor {
  /** هر شکاف فقط یک بار لاگ می‌شود؛ وگرنه هر بازدید یک خط می‌سازد. */
  private static readonly warned = new Set<string>();

  constructor(
    private readonly reflector: Reflector,
    private readonly subscription: SubscriptionService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const feature = this.reflector.getAllAndOverride<string | undefined>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );
    // مسیرِ بی‌برچسب هسته است و همیشه باز.
    if (!feature) return next.handle();

    const request = context.switchToHttp().getRequest();
    const companyId = request?.user?.companyId;

    // ⚠️ مسیرِ برچسب‌دارِ **عمومی** (بدونِ کاربر) باز می‌ماند — و این
    //    یک **شکافِ شناخته‌شده** است، نه تصمیمِ کامل.
    //
    //    `ShopPublicController` (`/shop`) و `SelfOrderController`
    //    (`/menu/:token`) برچسب دارند ولی هرگز بسته نمی‌شوند، چون
    //    بازدیدکننده توکن ندارد و شرکت از درخواست درنمی‌آید.
    //
    //    یعنی مشتری‌ای که نسخه‌اش پایین آمده، ویترین و منوی QRش
    //    همچنان سرویس می‌دهد؛ فقط نمی‌تواند تنظیمشان کند.
    //
    //    بستنش شدنی است — شرکت را می‌شود از `:token` یا از
    //    زیردامنه درآورد — ولی انجام نشده.  تا آن روز، این‌جا **لاگ**
    //    می‌زند تا شکاف دیده شود.
    //
    //    یک برچسبِ همیشه‌بی‌اثر، بدتر از نبودِ برچسب است: کد را
    //    محافظت‌شده نشان می‌دهد در حالی که نیست.
    if (!companyId) {
      if (!EditionInterceptor.warned.has(feature)) {
        EditionInterceptor.warned.add(feature);
        // eslint-disable-next-line no-console
        console.warn(
          `[گیت نسخه] مسیرِ عمومیِ «${feature}» گیت نمی‌شود — بدونِ کاربر، شرکت معلوم نیست`,
        );
      }
      return next.handle();
    }

    if (await this.subscription.hasFeature(companyId, feature)) {
      return next.handle();
    }

    const plan = await this.subscription.planFor(companyId);
    throw new HttpException(
      {
        message: `این قابلیت در نسخهٔ «${plan.title}» نیست`,
        error: 'Payment Required',
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        feature,
        currentPlan: plan.plan,
        lang: 'fa',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
