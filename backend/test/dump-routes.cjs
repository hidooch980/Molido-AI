/**
 * مسیرهای HTTP یک محصول را چاپ می‌کند.
 *
 *   MOLIDO_PRODUCT=store node test/dump-routes.cjs
 *
 * عمداً JavaScript ساده است و از `dist` می‌خواند: تزریق وابستگی Nest به
 * متادیتای دکوراتور تکیه دارد که فقط کامپایلر TypeScript تولید می‌کند.  اجرای
 * این بررسی روی همان چیزی که واقعاً منتشر می‌شود، درست‌تر هم هست.
 *
 * توسط `test/product-routes.ts` صدا زده می‌شود.
 */
const { NestFactory } = require('@nestjs/core');

async function main() {
  const { AppModule } = require('../dist/app.module.js');

  // logger فقط خطا را نشان می‌دهد: اگر بوت شکست بخورد باید دیده شود، ولی
  // انبوه پیام‌های راه‌اندازی خروجی را نامفهوم می‌کند.
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  await app.init();

  const server = app.getHttpAdapter().getInstance();
  const stack = server._router?.stack ?? server.router?.stack ?? [];

  const paths = [
    ...new Set(
      stack.map((layer) => layer.route?.path).filter((path) => typeof path === 'string'),
    ),
  ];

  await app.close();
  process.stdout.write(`ROUTES:${JSON.stringify(paths)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
