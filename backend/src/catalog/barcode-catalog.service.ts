import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../database/database.service';

export type CatalogEntry = {
  barcode: string;
  name: string;
  brand: string | null;
  unit: string | null;
  category: string | null;
  imageUrl: string | null;
  source: string;
  seenCount: number;
};

/**
 * فهرستِ مشترکِ بارکد — «اسکن کن، شناسایی شود».
 *
 * ⚠️ منابعِ جهانی کالای ایرانی را **ندارند**.  سنجیده شد.
 *
 *    Open Food Facts بارکدِ کوکاکولا را با نام و تصویر می‌دهد، ولی
 *    سه بارکدِ ایرانیِ `626…` را «product not found».
 *
 *    پس ترتیب این است: اول حافظهٔ خودمان، بعد جهانی.  و هر کالایی که
 *    کاربر ثبت می‌کند به حافظه برمی‌گردد — سامانه با هر ثبت باهوش‌تر
 *    می‌شود.
 *
 * ⚠️ آنچه به اشتراک می‌رود **دقیقاً** محدود است.
 *
 *    بارکد، نام، برند، واحد، دسته و تصویر — همان چیزی که روی خودِ
 *    بستهٔ کالا در قفسه نوشته شده و راز نیست.
 *
 *    قیمت، موجودی، تأمین‌کننده و بهای خرید هرگز نمی‌آیند: اسرارِ
 *    تجاریِ هر فروشگاه‌اند و لو رفتنشان یعنی رقیب حاشیهٔ سود را بداند.
 */
@Injectable()
export class BarcodeCatalogService {
  private readonly logger = new Logger(BarcodeCatalogService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  /** ریختِ بارکد را می‌سنجد — ۸ تا ۱۴ رقم. */
  private clean(barcode: unknown): string {
    const value = String(barcode ?? '').replace(/\D/g, '');
    return /^\d{8,14}$/.test(value) ? value : '';
  }

  /**
   * جست‌وجو: اول حافظهٔ مشترک، بعد اینترنت.
   *
   * ⚠️ هرگز پرتاب نمی‌کند.  «پیدا نشد» حالتِ عادیِ این تابع است، نه
   *    خطا — کاربر می‌تواند خودش کالا را ثبت کند.
   */
  async lookup(barcode: unknown): Promise<CatalogEntry | null> {
    const code = this.clean(barcode);
    if (!code) return null;

    const rows = await this.db.query<CatalogEntry>(
      'SELECT * FROM "BarcodeCatalog" WHERE barcode = $1',
      [code],
    );
    if (rows[0]) return rows[0];

    // ⚠️ منبعِ بیرونی فقط وقتی حافظه خالی است.
    //
    //    هر تماس چند صد میلی‌ثانیه است و روی اتصالِ ایرانی گاهی ده
    //    ثانیه — سنجیده شد.  حافظه‌ای که اول خوانده شود، بیشترِ
    //    اسکن‌ها را بی‌تماس جواب می‌دهد.
    const remote = await this.fetchRemote(code);
    if (!remote) return null;

    await this.remember(remote).catch(() => undefined);
    return remote;
  }

  /**
   * ثبتِ کالا در حافظهٔ مشترک.
   *
   * ⚠️ `seenCount` نشانهٔ درستی است.
   *
   *    بارکدی که ده فروشگاه با همان نام ثبت کرده‌اند، از بارکدی که
   *    یکی ثبت کرده مطمئن‌تر است.  بدونِ این عدد، غلطِ تایپیِ اولین
   *    نفر برای همیشه می‌ماند.
   *
   * ⚠️ نامِ موجود **بازنویسی نمی‌شود**.
   *
   *    وسوسه این بود که آخرین ثبت جایگزین شود.  ولی آن‌وقت یک
   *    فروشگاه که کالا را «شیر» می‌نامد، نامِ دقیقِ «شیر پرچرب کاله
   *    ۱ لیتری» را که دیگری ثبت کرده پاک می‌کند.  فقط میدان‌های
   *    **تهی** پر می‌شوند.
   */
  async remember(entry: {
    barcode: unknown;
    name?: unknown;
    brand?: unknown;
    unit?: unknown;
    category?: unknown;
    imageUrl?: unknown;
    source?: string;
  }): Promise<void> {
    const code = this.clean(entry.barcode);
    const name = String(entry.name ?? '').trim().slice(0, 200);
    if (!code || !name) return;

    await this.db.execute(
      `INSERT INTO "BarcodeCatalog"
         (barcode, name, brand, unit, category, "imageUrl", source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (barcode) DO UPDATE SET
         brand      = COALESCE("BarcodeCatalog".brand,      EXCLUDED.brand),
         unit       = COALESCE("BarcodeCatalog".unit,       EXCLUDED.unit),
         category   = COALESCE("BarcodeCatalog".category,   EXCLUDED.category),
         "imageUrl" = COALESCE("BarcodeCatalog"."imageUrl", EXCLUDED."imageUrl"),
         "seenCount" = "BarcodeCatalog"."seenCount" + 1,
         "updatedAt" = now()`,
      [
        code,
        name,
        str(entry.brand),
        str(entry.unit),
        str(entry.category),
        str(entry.imageUrl),
        entry.source ?? 'LOCAL',
      ],
    );
  }

  /**
   * پرس‌وجو از منبعِ بیرونی.
   *
   * ⚠️ مهلت **الزامی** است.
   *
   *    سنجیده شد: همین سرویس برای بارکدِ ناموجود ۱۰ ثانیه طول کشید.
   *    بدونِ مهلت، صندوق‌دار پشتِ باجه منتظر می‌ماند و صف می‌بندد —
   *    برای قابلیتی که فقط «کمکی» است.
   */
  private async fetchRemote(code: string): Promise<CatalogEntry | null> {
    // ⚠️ منبعِ بیرونی **پیش‌فرض خاموش** است، و این تصمیمِ آگاهانه‌ای
    //    است نه احتیاطِ بی‌دلیل.
    //
    //    سنجیده شد: Open Food Facts سه بارکدِ ایرانیِ `626…` را
    //    «product not found» داد و برای بارکدِ ناموجود ۱۰ ثانیه طول
    //    کشید.  یعنی برای فروشگاهِ ایرانی، روشن بودنش صندوق‌دار را
    //    ده ثانیه پشتِ باجه نگه می‌دارد تا «پیدا نشد» بشنود.
    //
    //    منابعِ ایرانی (ایران‌کد، IRC) هم سنجیده شدند: صفحهٔ وب
    //    می‌دهند ولی API عمومی ندارند.  اسکرپینگشان شکننده است و
    //    ریسکِ حقوقی دارد.
    //
    //    پس حافظهٔ مشترکِ خودمان تنها منبعِ پیش‌فرض است.  برای کالای
    //    **وارداتی** می‌شود روشنش کرد:  CATALOG_REMOTE=true
    if (this.config.get<string>('CATALOG_REMOTE') !== 'true') return null;

    const timeoutMs = Number(this.config.get<string>('CATALOG_TIMEOUT_MS') ?? '4000') || 4000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const base =
        this.config.get<string>('CATALOG_OFF_URL')?.trim() ||
        'https://world.openfoodfacts.org/api/v2/product';

      const response = await fetch(
        `${base}/${encodeURIComponent(code)}.json?fields=product_name,brands,quantity,categories,image_url`,
        { signal: controller.signal, headers: { 'User-Agent': 'Molido/1.0' } },
      );
      if (!response.ok) return null;

      const body = (await response.json()) as {
        status?: number;
        product?: Record<string, unknown>;
      };
      if (body.status !== 1 || !body.product) return null;

      const name = String(body.product.product_name ?? '').trim();
      if (!name) return null;

      const imageUrl = await this.saveImage(code, String(body.product.image_url ?? ''));

      return {
        barcode: code,
        name: name.slice(0, 200),
        brand: str(body.product.brands),
        unit: str(body.product.quantity),
        category: str(body.product.categories)?.split(',')[0]?.trim() ?? null,
        imageUrl,
        source: 'OFF',
        seenCount: 1,
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      this.logger.warn(
        `فهرست بارکد: ${aborted ? `مهلت ${timeoutMs}ms تمام شد` : String(error)}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * تصویر **دانلود و ذخیره** می‌شود، نه اینکه نشانی‌اش نگه داشته شود.
   *
   * ⚠️ نشانیِ بیرونی روزی می‌میرد و آن‌وقت کاتالوگِ کاملِ فروشگاه
   *    بی‌تصویر می‌شود — بی‌آنکه چیزی خطا بدهد.  و در ایران، سرویسِ
   *    بیرونی می‌تواند فردا فیلتر شود.
   *
   * ⚠️ شکستِ دانلود، کلِ جست‌وجو را نمی‌شکند.
   *
   *    نامِ کالا بدونِ تصویر هنوز ارزش دارد؛ تصویرِ بدونِ نام هیچ.
   */
  private async saveImage(code: string, url: string): Promise<string | null> {
    if (!/^https?:\/\//i.test(url)) return null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) return null;

      const type = response.headers.get('content-type') ?? '';
      // ⚠️ فقط تصویر.  بدونِ این، پاسخِ HTML یک صفحهٔ خطا به‌عنوان
      //    «تصویر» ذخیره می‌شد و در کاتالوگ به شکلِ آیکونِ شکسته
      //    ظاهر می‌شد.
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
      if (!type.startsWith('image/')) return null;

      const buffer = Buffer.from(await response.arrayBuffer());

      // ⚠️ سقفِ اندازه: منبعِ بیرونی کنترلِ ما نیست.
      if (buffer.length === 0 || buffer.length > 2 * 1024 * 1024) return null;

      const dir = join(process.cwd(), 'uploads', 'catalog');
      await mkdir(dir, { recursive: true });

      // نامِ فایل از بارکد و چکیدهٔ محتوا — پس دانلودِ دوباره فایلِ
      // تکراری نمی‌سازد.
      const digest = createHash('sha1').update(buffer).digest('hex').slice(0, 8);
      const file = `${code}-${digest}.${ext}`;
      await writeFile(join(dir, file), buffer);

      return `/uploads/catalog/${file}`;
    } catch {
      return null;
    }
  }
}

function str(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, 200) : null;
}
