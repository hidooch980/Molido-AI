import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { ErrorRecorderFilter } from './operations/error-recorder.filter';
import { OperationsService } from './operations/operations.service';
import { join } from 'node:path';
import process from 'node:process';

import { buildCorsCheck } from './common/cors';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // امنیت هدرهای HTTP
  app.use(helmet());

  // پشت reverse proxy، نشانی واقعی کاربر در `X-Forwarded-For` است.
  //
  // بدون این، Express نشانیِ خودِ proxy را می‌بیند و محدودیت نرخ برای
  // **همهٔ** کاربران یک سطل مشترک می‌شود: یک نفر با چند تلاش ورود، صندوق
  // بقیه را هم قفل می‌کند.  هیچ خطایی هم نمی‌دهد — فقط ۴۲۹های بی‌دلیل.
  //
  // عمداً پیش‌فرض خاموش است: روی شبکهٔ محلی proxy‌ای در کار نیست و
  // اعتماد به این هدر یعنی هر کسی می‌تواند نشانی‌اش را جعل کند و از
  // محدودیت نرخ فرار کند.  مقدار عدد است (تعداد proxy‌های مورد اعتماد)،
  // پس `TRUST_PROXY=1` یعنی «فقط proxy بلافصل».
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    const hops = Number(trustProxy);
    app.set('trust proxy', Number.isFinite(hops) && hops > 0 ? hops : trustProxy);
  }

  // فیلتر خطا از کانتینر ساخته می‌شود تا `OperationsService` را بگیرد.
  //
  // `@Catch()` بدون آرگومان یعنی **همهٔ** استثناها، نه فقط `HttpException` —
  // خطاهای ۵۰۰ که مهم‌ترین‌اند، پیش از این اصلاً از فیلتر رد نمی‌شدند و
  // پاسخ خام Nest به کاربر می‌رسید.
  app.useGlobalFilters(new ErrorRecorderFilter(app.get(OperationsService)));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;

  app.enableCors({
    origin: buildCorsCheck(configService.get<string>('CORS_ORIGIN')),
    credentials: true,
  });

  /**
   * سرو فایل‌های آپلودشده.
   *
   * ⚠️ لایهٔ **دوم** دفاع.  لایهٔ اول فهرست سفیدِ پسوندهاست در
   *    `uploads.controller.ts`.
   *
   *    چرا دو لایه؟  چون یک بار همین‌جا حفره بود و ثابت شد که
   *    خطرناک است: فایل `.js` و `.html` آپلود شد، در مرورگر باز شد،
   *    و اسکریپت در دامنهٔ برنامه **اجرا شد** — یعنی
   *    `localStorage.molido_token` در دسترسش بود.
   *
   *    `helmet` سیاست CSP دارد ولی `script-src 'self'` است، و
   *    `/uploads/` هم «self» حساب می‌شود.  پس CSP سراسری اینجا
   *    محافظت نمی‌کرد.
   *
   *    اگر روزی فهرست سفید سوراخ شود — پسوند تازه، اشتباه در
   *    نگهداری، یا نوعی که مرورگرها بعداً اجرایی کنند — این سربرگ‌ها
   *    همچنان جلویش را می‌گیرند.
   */
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    setHeaders: (res: { setHeader: (k: string, v: string) => void }) => {
      // هیچ‌چیز اجرا نشود: نه اسکریپت، نه قاب، نه شیء.
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; sandbox; frame-ancestors 'none'",
      );
      // مرورگر نوع را حدس نزند — فایلی که `.txt` است ولی HTML به نظر
      // می‌رسد، نباید HTML رندر شود.
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // در قاب گذاشته نشود (clickjacking روی محتوای کاربر).
      res.setHeader('X-Frame-Options', 'DENY');
    },
  });

  // مستندات Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Molido AI API')
    .setDescription(
      'مستندات API سامانه مدیریت هوشمند — فروشگاه، دفتر فنی، آتش‌نشانی، سامانه ۱۳۷ و عوارض شهرداری',
    )
    .setVersion('2.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(port);

  console.log(`🚀 Molido AI Backend is running on port ${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api-docs`);
}

bootstrap();
