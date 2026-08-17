import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../../database/database.service';

type Key = string;

/**
 * اختیارات نقش‌ها — بازنویسی‌شدنی از رابط.
 *
 * تا امروز نقش‌ها در کد ثابت بودند: `@Roles('ADMIN','MANAGER')` روی
 * ۲۹۱ مسیر.  فروشگاهی که می‌خواست صندوق‌دارش گزارش فروش ببیند، باید
 * کد را عوض می‌کرد.
 *
 * ⚠️ **نبودِ ردیف یعنی همان چیزی که کد گفته.**
 *
 *    نه «همه‌چیز ممنوع» (که اولین استقرار همه را بیرون می‌انداخت) و نه
 *    «همه‌چیز مجاز» (که همان لحظه در را باز می‌کرد).  جدولِ خالی باید
 *    دقیقاً رفتار امروز را بدهد، وگرنه این تغییر یک ارتقاء نیست، یک
 *    حادثه است.
 */
@Injectable()
export class PermissionsService {
  private readonly logger = new Logger('Permissions');

  /**
   * حافظهٔ کوتاه‌مدت.
   *
   * نگهبان روی **هر** درخواست صدا زده می‌شود؛ پرس‌وجوی پایگاه داده به
   * ازای هر فراخوانی، صندوق را کند می‌کند.  پنج ثانیه به‌قدری کوتاه
   * است که تغییرِ اختیارات تقریباً فوری دیده شود، و به‌قدری بلند که
   * بار را بردارد.
   */
  private cache = new Map<string, { at: number; map: Map<Key, boolean> }>();
  private static readonly TTL_MS = 5_000;

  constructor(private readonly db: DatabaseService) {}

  /** حافظه را برای یک شرکت دور می‌ریزد — پس از هر ویرایش. */
  invalidate(companyId: string): void {
    this.cache.delete(companyId);
  }

  /**
   * آیا این نقش این اختیار را دارد؟
   *
   * برمی‌گرداند `null` وقتی بازنویسی‌ای وجود ندارد — یعنی «کد تصمیم
   * بگیرد».  `null` عمداً از `false` جداست: «نظری نداریم» با «ممنوع»
   * یکی نیست.
   */
  async overrideFor(
    companyId: string | undefined,
    role: string,
    permission: string,
  ): Promise<boolean | null> {
    // مدیر ارشد هرگز محدود نمی‌شود.  اگر این نبود، یک پیکربندی غلط
    // می‌توانست نصب را قفل کند و راهِ برگشتی جز دست بردن در دیتابیس
    // نماند.
    if (role === 'SUPER_ADMIN') return true;
    if (!companyId) return null;

    const map = await this.load(companyId);
    const hit = map.get(`${role}:${permission}`);
    return hit === undefined ? null : hit;
  }

  /** همهٔ بازنویسی‌های یک شرکت — برای رابط. */
  async listFor(companyId: string) {
    const rows = await this.db.query<{
      role: string;
      permission: string;
      allowed: boolean;
      updatedAt: string;
    }>(
      `SELECT role, permission, allowed, "updatedAt"
         FROM "RolePermission" WHERE "companyId" = $1
        ORDER BY role, permission`,
      [companyId],
    );
    return rows;
  }

  /**
   * دادن یا گرفتن یک اختیار.
   *
   * حافظهٔ همان شرکت فوراً دور ریخته می‌شود: مدیری که تنظیمی را عوض
   * می‌کند و بلافاصله می‌آزماید، نباید پنج ثانیه رفتار قدیمی ببیند و
   * فکر کند کار نکرد.
   */
  async set(
    companyId: string,
    role: string,
    permission: string,
    allowed: boolean,
    updatedBy: string,
  ) {
    const rows = await this.db.query<{ role: string; permission: string; allowed: boolean }>(
      `INSERT INTO "RolePermission" (id, "companyId", role, permission, allowed, "updatedBy")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)
       ON CONFLICT ("companyId", role, permission) DO UPDATE
         SET allowed = EXCLUDED.allowed,
             "updatedBy" = EXCLUDED."updatedBy",
             "updatedAt" = now()
       RETURNING role, permission, allowed`,
      [companyId, role, permission, allowed, updatedBy],
    );

    this.invalidate(companyId);
    return rows[0];
  }

  /**
   * برگرداندن به پیش‌فرضِ کد.
   *
   * ⚠️ ردیف **حذف** می‌شود، نه اینکه `false` بگیرد.
   *
   *    نبودِ ردیف یعنی «هرچه `@Roles` گفته»، که با «ممنوع» فرق دارد.
   *    اگر به‌جای حذف `false` می‌گذاشتیم، «بازگرداندن به پیش‌فرض» در
   *    عمل اختیار را می‌گرفت.
   */
  async reset(companyId: string, role: string, permission: string) {
    await this.db.execute(
      `DELETE FROM "RolePermission"
        WHERE "companyId" = $1 AND role = $2 AND permission = $3`,
      [companyId, role, permission],
    );
    this.invalidate(companyId);
    return { role, permission, reset: true };
  }

  private async load(companyId: string): Promise<Map<Key, boolean>> {
    const cached = this.cache.get(companyId);
    if (cached && Date.now() - cached.at < PermissionsService.TTL_MS) {
      return cached.map;
    }

    try {
      const rows = await this.db.query<{
        role: string;
        permission: string;
        allowed: boolean;
      }>(
        `SELECT role, permission, allowed FROM "RolePermission" WHERE "companyId" = $1`,
        [companyId],
      );

      const map = new Map<Key, boolean>();
      for (const r of rows) map.set(`${r.role}:${r.permission}`, r.allowed);
      this.cache.set(companyId, { at: Date.now(), map });
      return map;
    } catch (error) {
      // ⚠️ خطای پایگاه داده **نباید** در را باز کند.
      //
      //    نقشهٔ خالی یعنی «بازنویسی‌ای نیست»، و نبودِ بازنویسی یعنی
      //    همان `@Roles` کد — که سخت‌گیرانه‌ترین حالتِ امن است.  اگر
      //    اینجا `true` برمی‌گرداندیم، یک قطعیِ گذرای دیتابیس همهٔ
      //    مسیرها را باز می‌کرد.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`خواندن اختیارات شکست خورد؛ به @Roles کد برگشتیم: ${message}`);
      return new Map();
    }
  }
}
