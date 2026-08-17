import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

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
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
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
  refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refresh(body?.refreshToken);
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
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.userId, dto);
  }
}
