import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

/** آنچه از درخواست برای ثبتِ تلاشِ ورود لازم است. */
type ReqMeta = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

/** حداقلی که برای نشاندن کوکی لازم است — بی‌وابستگی به نوعِ Express. */
type ResMeta = {
  setHeader: (name: string, value: string | string[]) => void;
  getHeader?: (name: string) => string | string[] | number | undefined;
};

/**
 * دو شکلِ ممکنِ پاسخِ ورود.
 *
 * ⚠️ پاسخِ چالشِ MFA عمداً `refreshToken` ندارد.
 *
 *    `withRefreshCookie` فقط وقتی کوکی می‌نشاند که توکنِ نوسازی در
 *    پاسخ باشد.  یعنی کاربری که هنوز مرحلهٔ دوم را نگذشته، هیچ کوکیِ
 *    سی‌روزه‌ای نمی‌گیرد — و این دقیقاً همان چیزی است که باید باشد:
 *    نیمهٔ اولِ ورود نباید هیچ چیزِ ماندگاری به دست بدهد.
 *
 *    نوعِ اتحادی این را در زمانِ کامپایل نگه می‌دارد؛ اگر روزی کسی
 *    چالش را با توکن برگرداند، همین‌جا خطا می‌گیرد.
 */
type AuthPayload = {
  accessToken?: string;
  refreshToken?: string;
  mfaRequired?: boolean;
  challenge?: string;
};

/**
 * توکنِ نوسازی را از بدنه به کوکیِ `httpOnly` منتقل می‌کند.
 *
 * ⚠️ بدنه **همچنان** آن را دارد، عمداً.
 *
 *    کلاینت‌های غیرمرورگری (اسکریپت، اپ موبایل، آزمون‌ها) کوکی
 *    ندارند و باید از بدنه بخوانند.  برداشتنش از بدنه یعنی شکستنِ
 *    همه‌شان بی‌آنکه چیزی به دست بیاید: مهاجمی که XSS دارد، پاسخِ
 *    **ورود** را نمی‌بیند — چون برای ورود رمز لازم است.
 *
 *    آنچه اهمیت دارد پاسخِ **نوسازی** است، که پایین‌تر جدا برخورد
 *    می‌شود.
 */
function withRefreshCookie<T extends AuthPayload>(
  req: ReqMeta,
  res: ResMeta,
  payload: T,
): T {
  if (payload?.refreshToken) setRefreshCookie(req, res, payload.refreshToken);
  return payload;
}

/**
 * نشانیِ واقعیِ کاربر پشت پروکسی.
 *
 * ⚠️ `x-forwarded-for` را **مهاجم هم می‌تواند بفرستد**.
 *
 *    پس فقط وقتی به آن تکیه می‌شود که پروکسیِ خودی جلو باشد (Caddy
 *    در استقرار).  اینجا فقط برای **ثبت** به کار می‌رود، نه برای
 *    تصمیمِ امنیتی — قفل بر پایهٔ ایمیل است نه IP.
 *
 *    اگر روزی قفل بر پایهٔ IP شد، این تابع کافی نیست.
 */
function clientIp(req: ReqMeta): string | undefined {
  const fwd = req.headers?.['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : fwd;
  return (first?.split(',')[0]?.trim() || req.ip) ?? undefined;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * ⚠️ این مسیر **بی‌احراز هویت** است و شرکتِ تازه می‌سازد.
   *
   *    با `companyName`، کاربر ADMIN شرکتِ تازهٔ خودش می‌شود.  برای
   *    سامانهٔ چندمستأجریِ خودثبت‌نام درست است؛ برای نصبِ تک‌شرکتی
   *    یعنی هر کسی روی اینترنت می‌تواند حساب و شرکت بسازد.
   *
   *    آزموده شد که **جداسازی سالم است**: حسابِ تازه صفر کالا، صفر
   *    مشتری و صفر فروشِ شرکتِ اصلی را می‌بیند و فقط خودش را.  پس
   *    نشتِ داده نیست.
   *
   *    ولی بی‌سقف بودنش دو مسئله داشت: ساختِ بی‌پایانِ شرکت و کاربر
   *    (که پایگاه داده را باد می‌کند)، و فهمیدنِ اینکه کدام ایمیل از
   *    قبل ثبت شده.
   *
   *    اگر خودثبت‌نام برای این نصب لازم نیست، بستنش تصمیمِ صاحبِ
   *    سامانه است — نه چیزی که اینجا بی‌خبر عوض شود.
   */
  @Post('register')
  @Throttle({ long: { ttl: 60000, limit: 5 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * سقف سخت روی ورود: ۱۰ تلاش در دقیقه از هر نشانی.
   *
   * سقف عمومی برای کار روزمرهٔ صندوق بالا برده شده، ولی همان سقف روی
   * ورود یعنی هزار حدس رمز در دقیقه — روی پنلی که در شبکهٔ محلی باز
   * است، این تنها دری است که باید تنگ بماند.
   */
  @Post('login')
  @Throttle({ long: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: ReqMeta,
    @Res({ passthrough: true }) res: ResMeta,
  ) {
    const ua = req.headers?.['user-agent'];
    return withRefreshCookie(
      req,
      res,
      await this.authService.login(dto, {
        ip: clientIp(req),
        userAgent: Array.isArray(ua) ? ua[0] : ua,
      }),
    );
  }

  /**
   * سقف روی نوسازی توکن.
   *
   * توکنِ نوسازی بلند است و حدس زدنش عملی نیست، ولی سقفِ ۱۲۰۰ در
   * دقیقه یعنی می‌شود با توکنِ دزدیده‌شده بی‌پایان توکنِ تازه گرفت و
   * دسترسی را زنده نگه داشت.  سقف، پنجرهٔ سوءاستفاده را تنگ می‌کند.
   */
  @Post('refresh')
  @Throttle({ long: { ttl: 60000, limit: 20 } })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: { refreshToken?: string },
    @Req() req: ReqMeta,
    @Res({ passthrough: true }) res: ResMeta,
  ) {
    // ⚠️ کوکی **اولویت** دارد بر بدنه.
    //
    //    اگر مرورگر کوکی دارد، همان معتبر است.  بدنه فقط برای
    //    کلاینت‌هایی است که کوکی ندارند.
    const fromCookie = readRefreshCookie(req);
    const token = fromCookie ?? body?.refreshToken;

    let result: AuthPayload;
    try {
      result = await this.authService.refresh(token as string);
    } catch (error) {
      // ⚠️ کوکیِ باطل باید **برداشته** شود، نه رها.
      //
      //    وگرنه مرورگر تا سی روز هر بار همان کوکیِ مرده را می‌فرستد و
      //    کاربر در حلقهٔ «نوسازی ← ۴۰۱ ← نوسازی» گیر می‌کند.
      if (fromCookie) clearRefreshCookie(res);
      throw error;
    }

    setRefreshCookie(req, res, result.refreshToken as string);

    // ⚠️ اگر درخواست از **کوکی** آمده، توکنِ نوسازیِ تازه از بدنه
    //    برداشته می‌شود.
    //
    //    این همان چیزی است که کوکی را معنادار می‌کند.  بدونش، اسکریپتی
    //    که در صفحه اجرا شود می‌توانست `/auth/refresh` را با
    //    `credentials:'include'` صدا بزند و توکنِ سی‌روزه را از بدنه
    //    بخواند — یعنی `httpOnly` دور زده می‌شد و همهٔ این کار بی‌فایده
    //    بود.
    //
    //    کلاینتی که خودش توکن را در بدنه فرستاده، از قبل داردش؛ پس
    //    برایش چیزی کم نمی‌شود.
    if (fromCookie) delete result.refreshToken;

    return result;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.authService.me(user.userId);
  }

  /**
   * ⚠️ سقف اینجا مهم‌تر از آن است که به نظر می‌رسد.
   *
   *    این مسیر پشت نگهبان است، پس ظاهراً مهاجمِ بی‌توکن کاری نمی‌تواند
   *    بکند.  ولی با توکنِ دزدیده‌شده، «رمز فعلی» را می‌توان حدس زد —
   *    و ۱۲۰۰ حدس در دقیقه یعنی تسخیرِ کاملِ حساب، چون رمزِ تازه را
   *    خودش می‌گذارد.
   */
  @Post('change-password')
  @Throttle({ long: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: ReqMeta,
    @Res({ passthrough: true }) res: ResMeta,
  ) {
    // ⚠️ تغییر رمز توکنِ تازه برمی‌گرداند (وگرنه کاربر بلافاصله بیرون
    //    می‌افتد)، پس کوکی هم باید تازه شود — وگرنه کوکیِ قدیمی که با
    //    `passwordChangedAt` مرده، تا سی روز هر نوسازی را می‌شکند.
    return withRefreshCookie(
      req,
      res,
      await this.authService.changePassword(user.userId, dto),
    );
  }

  /**
   * خروج از همهٔ دستگاه‌ها.
   *
   * ⚠️ رمز نمی‌خواهد، عمداً.
   *
   *    کاربر از قبل وارد شده و توکنِ معتبر دارد؛ خواستنِ رمزِ دوباره
   *    فقط اصطکاک است.  و کسی که گوشی‌اش را جا گذاشته، شاید همان
   *    لحظه رمزش را به خاطر نیاورد — و دقیقاً همان لحظه‌ای است که
   *    بیشترین نیاز را به این دکمه دارد.
   *
   *    این توکنِ خودِ درخواست‌کننده را هم می‌کشد.  درست است: «همهٔ
   *    دستگاه‌ها» یعنی همه.
   */
  @Post('revoke-sessions')
  @Throttle({ long: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  revokeSessions(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: ResMeta,
  ) {
    // ⚠️ کوکی هم باید برود.
    //
    //    سرور توکنِ نوسازی را با `sessionsRevokedAt` باطل می‌کند، پس
    //    ماندنِ کوکی خطرِ امنیتی نیست — ولی کاربر را در حلقهٔ
    //    «نوسازیِ ناموفق» می‌اندازد.  «خروج» یعنی خروج.
    clearRefreshCookie(res);
    return this.authService.revokeAllSessions(user.userId);
  }

  // ══════════════════════════════════════════════ رمز دومرحله‌ای

  /** وضعیت فعلی — برای نمایش در تنظیمات. */
  @Get('mfa/status')
  @UseGuards(JwtAuthGuard)
  mfaStatus(@CurrentUser() user: AuthUser) {
    return this.authService.mfaStatus(user.userId);
  }

  /**
   * مرحلهٔ یک: ساختِ راز و QR.
   *
   * ⚠️ سقفِ سخت، چون پاسخ **راز** را برمی‌گرداند.
   *
   *    هر فراخوانی رازِ تازه‌ای می‌سازد و قبلی را دور می‌اندازد.  بدون
   *    سقف، کسی با توکنِ دزدیده‌شده می‌توانست بی‌پایان راز عوض کند و
   *    راه‌اندازیِ کاربرِ واقعی را برای همیشه بشکند.
   */
  @Post('mfa/setup')
  @Throttle({ long: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  mfaSetup(@CurrentUser() user: AuthUser) {
    return this.authService.mfaSetup(user.userId);
  }

  /** مرحلهٔ دو: تأییدِ اولین کد و گرفتنِ کدهای بازیابی. */
  @Post('mfa/confirm')
  @Throttle({ long: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  mfaConfirm(@CurrentUser() user: AuthUser, @Body() body: { code?: string }) {
    return this.authService.mfaConfirm(user.userId, String(body?.code ?? ''));
  }

  /**
   * مرحلهٔ دومِ ورود: چالش + کد ← توکنِ واقعی.
   *
   * ⚠️ این مسیر **بی‌احراز هویت** است، عمداً.
   *
   *    کاربر هنوز توکنِ دسترسی ندارد — اگر داشت، مرحلهٔ دوم بی‌معنی
   *    بود.  چیزی که هویتش را ثابت می‌کند، خودِ توکنِ چالش است.
   *
   * ⚠️ سقفِ ۱۰ در دقیقه حیاتی است.
   *
   *    کدِ شش‌رقمی یک میلیون حالت دارد.  بدون سقف، مهاجمی که رمز را
   *    می‌داند (پس چالش می‌گیرد) می‌تواند در چند ساعت کد را حدس بزند —
   *    و آن‌وقت MFA فقط تأخیر بوده، نه محافظت.
   *
   *    عمرِ پنج‌دقیقه‌ای چالش هم همین را تنگ‌تر می‌کند: مهاجم باید هر
   *    پنج دقیقه دوباره رمز بزند، که خودش در `LoginAttempt` ثبت
   *    می‌شود و به قفلِ حساب می‌رسد.
   */
  @Post('mfa/verify')
  @Throttle({ long: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  async mfaVerify(
    @Body() body: { challenge?: string; code?: string },
    @Req() req: ReqMeta,
    @Res({ passthrough: true }) res: ResMeta,
  ) {
    return withRefreshCookie(
      req,
      res,
      await this.authService.mfaVerify(
        String(body?.challenge ?? ''),
        String(body?.code ?? ''),
      ),
    );
  }

  /** خاموش کردن — رمز **و** کد، هر دو لازم است. */
  @Post('mfa/disable')
  @Throttle({ long: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  mfaDisable(
    @CurrentUser() user: AuthUser,
    @Body() body: { password?: string; code?: string },
  ) {
    return this.authService.mfaDisable(
      user.userId,
      String(body?.password ?? ''),
      String(body?.code ?? ''),
    );
  }

  /**
   * تاریخچهٔ تلاش‌های ورود — برای بررسیِ مدیر.
   *
   * ⚠️ فقط مدیر، و فقط با ایمیلِ صریح.
   *
   *    فهرستِ کاملِ تلاش‌ها یعنی فهرستِ کاملِ ایمیل‌هایی که کسی رویشان
   *    تلاش کرده — از جمله ایمیل‌هایی که در این سامانه حساب ندارند.
   *    دادنش به هر کسی، همان افشای اطلاعاتی است که با پیامِ یکسانِ
   *    ورود جلویش را گرفته‌ایم.
   */
  @Get('login-history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  loginHistory(@Query('email') email: string, @Query('limit') limit?: string) {
    return this.authService.loginHistory(String(email ?? ''), Number(limit) || 50);
  }
}
