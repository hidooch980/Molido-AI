import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [

    PassportModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');

        if (!secret) {
          throw new Error(
            'JWT_SECRET is required. Set it in your .env file (e.g. openssl rand -hex 32).',
          );
        }

        return {
          secret,
          signOptions: {
            // ⚠️ پیش‌فرض **دو ساعت**، نه هفت روز.
            //
            //    هفت روز یعنی توکنی که از دستگاهِ گم‌شده یا از
            //    `localStorage` با XSS برداشته شود، یک هفتهٔ کامل کار
            //    می‌کند.  ابطالِ نشست این را کوتاه می‌کند، ولی فقط وقتی
            //    کسی **بفهمد** و دکمه را بزند.
            //
            //    کوتاه کردنش تا امروز ممکن نبود: کلاینت هیچ‌وقت
            //    `/auth/refresh` را صدا نمی‌زد، پس عمرِ کوتاه یعنی بیرون
            //    انداختنِ کاربر هر دو ساعت.  حالا کلاینت روی ۴۰۱ خودش با
            //    کوکیِ `httpOnly` نوسازی می‌کند و کاربر متوجه نمی‌شود.
            //
            //    راهِ ساده‌ترش — گذاشتنِ توکنِ نوسازی در `localStorage` —
            //    وضع را بدتر می‌کرد: XSS به‌جای هفت روز، سی روز می‌گرفت.
            //
            //    خروجی ConfigService از نوع string عام است؛ jsonwebtoken
            //    نوعِ دقیق‌تری مثل "2h" می‌خواهد — کستِ صریح لازم است.
            expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ||
              '2h') as never,
          },
        };
      },
    }),
  ],

  controllers: [
    AuthController,
  ],

  providers: [
    AuthService,
    JwtStrategy,
  ],

  exports: [
    AuthService,
    JwtModule,
    PassportModule,
  ],
})
export class AuthModule {}
