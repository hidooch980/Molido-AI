import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { I18nHttpExceptionFilter } from './i18n/http-exception.filter';
import { join } from 'node:path';
import process from 'node:process';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // امنیت هدرهای HTTP
  app.use(helmet());

  app.useGlobalFilters(new I18nHttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;

  // CORS امن: اگر CORS_ORIGIN ست نشده باشد فقط داشبورد لوکال مجاز است.
  // هرگز همه‌ی دامنه‌ها همراه با credentials مجاز نمی‌شوند.
  const corsOrigin = configService.get<string>('CORS_ORIGIN');
  app.enableCors({
    origin: corsOrigin
      ? corsOrigin.split(',').map((o) => o.trim())
      : 'http://localhost:3001',
    credentials: true,
  });

  // سرو فایل‌های آپلودشده
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
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
