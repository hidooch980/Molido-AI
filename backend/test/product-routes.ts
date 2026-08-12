/**
 * اثبات جداسازی محصول‌ها
 *
 *   npm run build && npm run test:products
 *
 * هر محصول را واقعاً بالا می‌آورد و مسیرهای ثبت‌شدهٔ HTTP را می‌شمارد.  ادعای
 * «رستوران عوارض شهرداری را نمی‌بیند» فقط وقتی معنا دارد که با برنامهٔ واقعاً
 * راه‌اندازی‌شده سنجیده شود، نه با خواندن فهرست ماژول‌ها.
 *
 * هر محصول در فرآیند جداگانه بالا می‌آید: ماژول‌ها در زمان import بر اساس
 * `MOLIDO_PRODUCT` ساخته می‌شوند و کش ماژول را نمی‌توان قابل‌اعتماد پاک کرد.
 * فرزند (`dump-routes.cjs`) از `dist` می‌خواند، چون تزریق وابستگی Nest به
 * متادیتای دکوراتور نیاز دارد که فقط کامپایلر TypeScript تولید می‌کند.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';

let passed = 0;
let failed = 0;

function step(label: string, detail = '') {
  passed += 1;
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label: string, detail: string) {
  failed += 1;
  console.log(`  ❌ ${label} — ${detail}`);
}

function routesOf(product: string): string[] {
  const child = join(__dirname, 'dump-routes.cjs');

  const output = execFileSync(process.execPath, [child], {
    env: {
      ...process.env,
      MOLIDO_PRODUCT: product,
      // بوت به این‌ها نیاز دارد؛ تست چیزی را منتشر نمی‌کند پس مقدار ساختگی کافی است
      JWT_SECRET: process.env.JWT_SECRET ?? 'test-only-secret',
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'test-only-refresh',
    },
    encoding: 'utf8',
    // stderr به والد می‌رسد تا شکست بوت پنهان نماند
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const line = output.split('\n').find((row) => row.startsWith('ROUTES:'));
  if (!line) throw new Error(`محصول «${product}» مسیری برنگرداند`);

  return JSON.parse(line.slice('ROUTES:'.length)) as string[];
}

function has(paths: string[], fragment: string): boolean {
  return paths.some((path) => path.includes(fragment));
}

function check(product: string, cases: Array<[string, boolean]>): void {
  for (const [label, ok] of cases) {
    if (ok) step(`${product}: ${label}`);
    else fail(`${product}: ${label}`, 'برقرار نیست');
  }
}

async function main(): Promise<void> {
  console.log('\n  📦 جداسازی محصول‌ها\n');

  const store = routesOf('store');
  const resto = routesOf('resto');
  const suite = routesOf('suite');

  step(
    'هر سه محصول بالا آمدند',
    `فروشگاه ${store.length} • رستوران ${resto.length} • کامل ${suite.length} مسیر`,
  );

  check('فروشگاه', [
    ['صندوق فروشگاهی دارد', has(store, '/retail/')],
    ['کالابرگ دارد', has(store, '/ration/')],
    ['فروش دارد', has(store, '/sales')],
    ['دفتر کل دارد', has(store, '/ledger/')],
    ['رستوران ندارد', !has(store, '/restaurant')],
    ['عوارض شهرداری ندارد', !has(store, '/municipal-fees')],
    ['آتش‌نشانی ندارد', !has(store, '/fire-department')],
  ]);

  check('رستوران', [
    ['رستوران دارد', has(resto, '/restaurant')],
    ['کالا و انبار دارد (برای رسپی)', has(resto, '/products')],
    ['دفتر کل دارد', has(resto, '/ledger/')],
    ['صندوق فروشگاهی ندارد', !has(resto, '/retail/')],
    ['کالابرگ ندارد', !has(resto, '/ration/')],
    ['عوارض شهرداری ندارد', !has(resto, '/municipal-fees')],
    ['دفتر فنی ندارد', !has(resto, '/technical-office')],
  ]);

  check('نسخهٔ کامل', [
    ['رستوران دارد', has(suite, '/restaurant')],
    ['صندوق فروشگاهی دارد', has(suite, '/retail/')],
    ['شهرداری دارد', has(suite, '/municipal-fees')],
  ]);

  if (suite.length > store.length && suite.length > resto.length) {
    step('نسخهٔ کامل از هر دو محصول دیگر بزرگ‌تر است');
  } else {
    fail('اندازهٔ نسخهٔ کامل', `${suite.length} در برابر ${store.length} و ${resto.length}`);
  }

  if (has(store, '/auth/') && has(resto, '/auth/') && has(suite, '/auth/')) {
    step('احراز هویت در هر سه محصول هست');
  } else {
    fail('احراز هویت', 'در همهٔ محصول‌ها نیست');
  }
}

main()
  .then(() => {
    console.log(`\n  ${'─'.repeat(44)}`);
    if (failed === 0) {
      console.log(`  ✅ همهٔ ${passed} بررسی جداسازی موفق بود\n`);
    } else {
      console.log(`  موفق: ${passed}   ناموفق: ${failed}\n`);
      process.exit(1);
    }
  })
  .catch((error: unknown) => {
    console.error(`\n  ❌ تست متوقف شد: ${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  });
