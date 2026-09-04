import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

/**
 * کلیدهای API.
 *
 * ⚠️ چرا این ماژول `BaseCrudService` خالص **نبود** و نباید باشد؟
 *
 *    پیش از این دقیقاً همان بود: شش مسیر، سرویسِ سیزده‌خطی.  نتیجه
 *    دو ایرادِ ذاتی داشت که با آزمونِ واقعی روی سرورِ در حال اجرا
 *    دیده شد، نه با خواندنِ کد:
 *
 *    ۱. **کلاینت خودش `keyHash` را می‌فرستاد.**  یعنی هرکس می‌توانست
 *       رشتهٔ دلخواهی را به‌عنوان درهم‌سازیِ کلید ثبت کند.  کلیدی که
 *       سرور نساخته باشد، هیچ‌وقت قابل اعتماد نیست — کلِ فایدهٔ
 *       کلید API از بین می‌رود.
 *
 *    ۲. **`SELECT *` درهم‌سازی را برمی‌گرداند.**  فهرستِ کلیدها
 *       `keyHash` هر کلید را به کاربر می‌داد.
 *
 * ⚠️ متنِ خامِ کلید **فقط یک بار** برمی‌گردد — در پاسخِ ساخت.
 *
 *    بعد از آن هیچ‌جا قابل بازیابی نیست، چون فقط درهم‌سازی‌اش ذخیره
 *    می‌شود.  اگر کاربر گمش کند باید کلیدِ تازه بسازد.  این آزاردهنده
 *    است و عمدی: ذخیرهٔ متنِ خام یعنی هر نشتِ پایگاه‌داده همهٔ کلیدها
 *    را لو می‌دهد.
 *
 * ⚠️ هنوز هیچ نگهبانی این کلیدها را مصرف نمی‌کند.
 *
 *    در کلِ `backend/src` هیچ‌جا `ApiKey` برای احراز هویت خوانده
 *    نمی‌شود.  یعنی این ماژول امروز **نیمه‌ساخته** است، نه
 *    آسیب‌پذیریِ فعال.
 *
 *    `verify()` اینجا هست تا وقتی نگهبانی نوشته شود، یک پیاده‌سازیِ
 *    واحد داشته باشد — نه دو تعریفِ متفاوت از «کلید معتبر».  تا آن
 *    روز فقط آزمون‌ها صدایش می‌زنند، و همین صحتش را تضمین می‌کند.
 */
@Injectable()
export class ApiKeysService extends BaseCrudService {
  protected readonly table = 'ApiKey';
  protected readonly notFoundMessage = 'کلیدهای API یافت نشد';

  constructor(db: DatabaseService) {
    super(db);
  }

  /**
   * ستون‌هایی که کاربر اجازهٔ تعیینشان را دارد.
   *
   * ⚠️ `keyHash` و `prefix` عمداً نیستند: هر دو را سرور می‌سازد.
   *    `lastUsedAt` هم نیست — آن را مصرفِ کلید ثبت می‌کند، نه کاربر.
   */
  private static readonly EDITABLE = ['name', 'scopes', 'isActive', 'expiresAt'];

  /** پیشوندی که در فهرست دیده می‌شود تا کلیدها از هم تشخیص داده شوند. */
  private static readonly PREFIX = 'mk_';

  private static hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * حذفِ درهم‌سازی از هر سطری که به بیرون می‌رود.
   *
   * ⚠️ روی **همهٔ** مسیرهای خواندن اعمال می‌شود، نه فقط فهرست.  اگر
   *    فقط `findAll` پاک شود، `findOne` همان نشت را باز نگه می‌دارد.
   */
  private static strip<R extends Record<string, unknown>>(row: R): R {
    if (!row) return row;
    const { keyHash: _dropped, ...rest } = row as Record<string, unknown>;
    return rest as R;
  }

  private static onlyEditable(dto: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    for (const field of ApiKeysService.EDITABLE) {
      if (dto[field] !== undefined) clean[field] = dto[field];
    }
    return clean;
  }

  async findAll(companyId: string, query: Record<string, unknown> = {}) {
    const rows = await super.findAll(companyId, query);
    return rows.map((row) => ApiKeysService.strip(row));
  }

  async findOne(companyId: string, id: string) {
    return ApiKeysService.strip(await super.findOne(companyId, id));
  }

  /**
   * ساختِ کلید.  پاسخ میدانِ `key` دارد — تنها باری که دیده می‌شود.
   */
  async create(companyId: string, dto: Record<string, unknown>) {
    const name = typeof dto.name === 'string' ? dto.name.trim() : '';
    if (!name) throw new BadRequestException('نام کلید لازم است');

    // ۳۲ بایتِ تصادفی ⇒ ۴۳ نویسهٔ base64url.  از `randomBytes` می‌آید،
    // نه `Math.random` که قابل پیش‌بینی است.
    const secret = randomBytes(32).toString('base64url');
    const raw = `${ApiKeysService.PREFIX}${secret}`;

    const created = await super.create(companyId, {
      ...ApiKeysService.onlyEditable(dto),
      name,
      keyHash: ApiKeysService.hash(raw),
      // هشت نویسهٔ نخست برای تشخیصِ بصری در فهرست.  خودِ کلید نیست و
      // با آن نمی‌شود احراز هویت کرد.
      prefix: raw.slice(0, 11),
      isActive: dto.isActive === undefined ? true : dto.isActive,
    });

    return { ...ApiKeysService.strip(created), key: raw };
  }

  /**
   * ⚠️ به‌روزرسانی هرگز درهم‌سازی را عوض نمی‌کند.
   *
   *    اگر می‌شد، همان ایرادِ نخست از راهِ `PATCH` برمی‌گشت.  برای
   *    کلیدِ تازه باید کلیدِ تازه ساخت.
   */
  async update(companyId: string, id: string, dto: Record<string, unknown>) {
    const clean = ApiKeysService.onlyEditable(dto);
    if (!Object.keys(clean).length) return this.findOne(companyId, id);
    return ApiKeysService.strip(await super.update(companyId, id, clean));
  }

  async remove(companyId: string, id: string) {
    return ApiKeysService.strip(await super.remove(companyId, id));
  }

  /**
   * راستی‌آزماییِ کلیدِ خام.
   *
   * ⚠️ مقایسه با `timingSafeEqual` انجام می‌شود، نه `===`.
   *    مقایسهٔ رشتهٔ معمولی در نخستین نویسهٔ متفاوت بازمی‌گردد و
   *    اختلافِ زمانش، کلید را نویسه‌به‌نویسه لو می‌دهد.
   *
   * ⚠️ کلیدِ غیرفعال یا منقضی معتبر نیست، حتی اگر درهم‌سازی بخورد.
   */
  async verify(raw: string): Promise<Record<string, unknown> | null> {
    if (typeof raw !== 'string' || !raw.startsWith(ApiKeysService.PREFIX)) return null;

    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM "ApiKey" WHERE "keyHash" = $1 LIMIT 1`,
      [ApiKeysService.hash(raw)],
    );
    const row = rows[0];
    if (!row) return null;

    // درهم‌سازی از پیش برابر است (چون شرطِ SQL بود)؛ این مقایسه برای
    // آن است که مسیرِ موفق و ناموفق زمانِ یکسانی داشته باشند.
    const a = Buffer.from(ApiKeysService.hash(raw));
    const b = Buffer.from(String(row.keyHash));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    if (row.isActive === false) return null;
    if (row.expiresAt && new Date(String(row.expiresAt)).getTime() < Date.now()) return null;

    await this.db.execute('UPDATE "ApiKey" SET "lastUsedAt" = now() WHERE id = $1', [row.id]);
    return ApiKeysService.strip(row);
  }
}
