import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { runAsVendor, currentTenant } from '../database/tenant-context';

export type Subscription = {
  id: string;
  companyId: string;
  plan: string;
  status: string;
  startsOn: string;
  endsOn: string | null;
  maxUsers: number | null;
  maxBranches: number | null;
  product: string | null;
  note: string | null;
};

/**
 * سه نسخهٔ فروش.
 *
 * ⚠️ «آزمایشی» پلنِ جدا **نیست**: یکی از همین سه با `endsOn`.
 *
 *    پلنِ جدا برایش یعنی وقتی مشتری می‌خرد، پلنش باید عوض شود و هر
 *    جا که به نامِ پلن تکیه کرده بود باید بداند «TRIAL هم یعنی
 *    BASIC» — دو مفهوم که یکی زیرمجموعهٔ دیگری است.
 */
const PLANS = ['BASIC', 'PRO', 'ADVANCED'];
const STATUSES = ['ACTIVE', 'EXPIRED', 'SUSPENDED'];

/**
 * اشتراک — چه کسی پول داده، تا کِی، و تا چه حد.
 *
 * ⚠️ نبودِ اشتراک یعنی **بی‌پایان**، نه «منقضی».
 *
 *    شرکتی که ردیفِ اشتراک ندارد نباید قفل شود.  نصبِ اختصاصی که
 *    یک‌بار فروخته شده، نصبِ روی سرورِ خودِ مشتری، و پایگاه‌دادهٔ
 *    توسعه هیچ‌کدام اشتراک ندارند — و همه باید کار کنند.
 *
 *    فایل‌سیف در جهتِ **باز** است، عمداً.  اشتباه در این سامانه یعنی
 *    قطعِ سرویسِ مشتری‌ای که پول داده؛ آن بدتر از یک روز سرویسِ
 *    رایگان است.
 */
@Injectable()
export class SubscriptionService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * نسخه‌ها و سقف‌های پیش‌فرضشان — از **پایگاه‌داده**، نه از کد.
   *
   * ⚠️ قیمت و سقف با بازار عوض می‌شوند.  اگر در کد بودند، هر تغییرِ
   *    بازاریابی یک استقرار می‌خواست — و آن یعنی عملاً تغییر نمی‌کند.
   */
  async plans() {
    return this.db.query<{
      plan: string;
      title: string;
      maxUsers: number | null;
      maxBranches: number | null;
      note: string | null;
    }>('SELECT * FROM "PlanDefault" ORDER BY "maxUsers" NULLS LAST');
  }

  /** اشتراکِ یک شرکت، یا `null` اگر ندارد. */
  async forCompany(companyId: string): Promise<Subscription | null> {
    const rows = await this.db.query<Subscription>(
      'SELECT * FROM "Subscription" WHERE "companyId" = $1',
      [companyId],
    );
    return rows[0] ?? null;
  }

  /**
   * وضعیتِ **مؤثر** — با در نظر گرفتنِ تاریخ.
   *
   * ⚠️ `status` در پایگاه‌داده ممکن است `ACTIVE` مانده باشد در حالی
   *    که `endsOn` گذشته.  تکیه بر ستون به‌تنهایی یعنی اشتراکِ
   *    منقضی‌شده تا وقتی کسی دستی به‌روزش نکند فعال بماند.
   *
   *    تاریخ منبعِ حقیقت است، نه ستون.
   */
  effective(sub: Subscription | null): {
    active: boolean;
    reason: string | null;
    daysLeft: number | null;
  } {
    if (!sub) return { active: true, reason: null, daysLeft: null };

    if (sub.status === 'SUSPENDED') {
      return { active: false, reason: 'اشتراک تعلیق شده است', daysLeft: null };
    }

    if (!sub.endsOn) {
      return { active: sub.status === 'ACTIVE', reason: null, daysLeft: null };
    }

    // ⚠️ `endsOn` از پستگرس **شیءِ Date** برمی‌گردد، نه رشته.
    //
    //    نسخهٔ اول `String(sub.endsOn).slice(0, 10)` نوشت و به
    //    `"Mon Sep 01"` رسید — که در مقایسهٔ متنی همیشه کوچک‌تر از
    //    `"2026-09-02"` است.  نتیجه: `daysLeft = -9132` و اشتراکِ
    //    منقضی «فعال» گزارش می‌شد.
    //
    //    و بدترین بخشش: خطایی نمی‌داد.  فقط عددی می‌داد که هیچ‌کس
    //    نگاهش نمی‌کرد تا روزی که مشتری بدونِ پرداخت کار کند.
    //
    //    `toISOString()` هر دو حالت (Date و رشته) را درست می‌کند.
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(sub.endsOn).toISOString().slice(0, 10);

    if (end < today) {
      return { active: false, reason: `اشتراک در ${end} تمام شد`, daysLeft: 0 };
    }

    const days = Math.round(
      (Date.parse(end) - Date.parse(today)) / (24 * 60 * 60 * 1000),
    );
    return { active: sub.status === 'ACTIVE', reason: null, daysLeft: days };
  }

  /**
   * سنجشِ سقفِ کاربر پیش از ساختنِ کاربرِ تازه.
   *
   * ⚠️ سقفِ `NULL` یعنی بی‌حد، نه صفر.  یکی گرفتنشان یعنی شرکتی که
   *    پلنش محدودیت ندارد، هیچ کاربری نتواند بسازد.
   */
  async assertUserQuota(companyId: string): Promise<void> {
    const sub = await this.forCompany(companyId);
    if (!sub || sub.maxUsers === null) return;

    const rows = await this.db.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM "User" WHERE "companyId" = $1',
      [companyId],
    );
    const current = Number(rows[0]?.count ?? 0);

    if (current >= sub.maxUsers) {
      throw new ForbiddenException(
        `سقفِ کاربرانِ پلنِ ${sub.plan} تکمیل است (${sub.maxUsers} کاربر). برای افزایش با پشتیبانی تماس بگیرید.`,
      );
    }
  }

  /**
   * سنجشِ فعال بودنِ اشتراک.
   *
   * ⚠️ فقط برای عملیاتِ **نوشتنی** صدا زده می‌شود.
   *
   *    مشتری‌ای که اشتراکش تمام شده باید بتواند داده‌اش را ببیند و
   *    بیرون بکشد.  بستنِ خواندن یعنی گروگان گرفتنِ داده — که هم
   *    غیراخلاقی است و هم تماسِ پشتیبانی می‌سازد به‌جای تمدید.
   */
  async assertActive(companyId: string): Promise<void> {
    const state = this.effective(await this.forCompany(companyId));
    if (state.active) return;

    throw new ForbiddenException(
      `${state.reason ?? 'اشتراک فعال نیست'} — امکانِ ثبتِ اطلاعات تازه نیست، ولی داده‌های شما در دسترس است.`,
    );
  }

  // ═══════════════ فروشنده ═══════════════

  /**
   * فهرستِ همهٔ مشتریان — فقط برای فروشنده.
   *
   * ⚠️ این پرس‌وجو **عمداً** روی همهٔ شرکت‌ها است و RLS ندارد.
   *    محافظتش در کنترلر است: `@Roles('SUPER_ADMIN')`.
   */
  async listAll() {
    // ⚠️ پرچمِ فروشنده **اینجا** گذاشته می‌شود، نه در کنترلر.
    //
    //    سیاستِ `vendor_read_all` بدونِ آن هیچ سطری نمی‌دهد.  گذاشتنش
    //    در کنترلر یعنی هر مسیرِ تازه‌ای که فراموش کند، فهرستِ خالی
    //    بگیرد — و «خالی» شبیه «مشتری ندارید» است، نه شبیه اشکال.
    //
    //    `companyId` حفظ می‌شود: فروشنده هم یک شرکت دارد و نوشتنش
    //    باید به همان محدود بماند.
    return runAsVendor(currentTenant()?.companyId ?? null, () =>
      this.listAllInner(),
    );
  }

  private async listAllInner() {
    const rows = await this.db.query<
      Subscription & { companyName: string; userCount: string }
    >(
      `SELECT s.*, c.name AS "companyName",
              (SELECT count(*)::text FROM "User" u WHERE u."companyId" = c.id) AS "userCount"
         FROM "Company" c
         LEFT JOIN "Subscription" s ON s."companyId" = c.id
        ORDER BY c."createdAt" DESC`,
    );

    return rows.map((row) => {
      const state = this.effective(row.id ? row : null);
      return {
        companyId: row.companyId ?? null,
        companyName: row.companyName,
        plan: row.plan ?? null,
        status: row.status ?? null,
        endsOn: row.endsOn ?? null,
        maxUsers: row.maxUsers ?? null,
        userCount: Number(row.userCount ?? 0),
        active: state.active,
        daysLeft: state.daysLeft,
        reason: state.reason,
      };
    });
  }

  /** ساخت یا به‌روزرسانیِ اشتراکِ یک شرکت — فقط فروشنده. */
  async upsert(
    companyId: string,
    data: {
      plan?: string;
      status?: string;
      endsOn?: string | null;
      maxUsers?: number | null;
      maxBranches?: number | null;
      product?: string | null;
      note?: string | null;
    },
  ) {
    const company = await this.db.query<{ id: string }>(
      'SELECT id FROM "Company" WHERE id = $1',
      [companyId],
    );
    if (!company[0]) throw new NotFoundException('شرکت یافت نشد');

    if (data.plan && !PLANS.includes(data.plan)) {
      throw new BadRequestException(`پلن نامعتبر است. مجاز: ${PLANS.join('، ')}`);
    }
    if (data.status && !STATUSES.includes(data.status)) {
      throw new BadRequestException(
        `وضعیت نامعتبر است. مجاز: ${STATUSES.join('، ')}`,
      );
    }

    // ⚠️ سقفِ صفر یا منفی رد می‌شود.
    //
    //    قیدِ پایگاه‌داده هم دارد، ولی خطای پستگرس به کاربر پیامِ خام
    //    می‌دهد.  اینجا پیامِ فارسی می‌گیرد.
    for (const [key, label] of [
      ['maxUsers', 'سقفِ کاربر'],
      ['maxBranches', 'سقفِ شعبه'],
    ] as const) {
      const value = data[key];
      if (value !== undefined && value !== null && value <= 0) {
        throw new BadRequestException(
          `${label} باید بزرگ‌تر از صفر باشد؛ برای «بی‌حد» خالی بگذارید`,
        );
      }
    }

    // ⚠️ اگر پلن داده شده ولی سقف نه، سقفِ **پیش‌فرضِ همان نسخه**
    //    گرفته می‌شود.
    //
    //    وگرنه فروشنده که «پایه» می‌فروشد، شرکتی با سقفِ بی‌حد
    //    می‌سازد — و تفاوتِ نسخه‌ها فقط روی کاغذ می‌ماند.
    if (data.plan && data.maxUsers === undefined && data.maxBranches === undefined) {
      const preset = (await this.plans()).find((p) => p.plan === data.plan);
      if (preset) {
        data = {
          ...data,
          maxUsers: preset.maxUsers,
          maxBranches: preset.maxBranches,
        };
      }
    }

    const existing = await this.forCompany(companyId);

    if (!existing) {
      const rows = await this.db.query<Subscription>(
        `INSERT INTO "Subscription"
           (id, "companyId", plan, status, "endsOn", "maxUsers", "maxBranches", product, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          randomUUID(),
          companyId,
          data.plan ?? 'TRIAL',
          data.status ?? 'ACTIVE',
          data.endsOn ?? null,
          data.maxUsers ?? null,
          data.maxBranches ?? null,
          data.product ?? null,
          data.note ?? null,
        ],
      );
      return rows[0];
    }

    const rows = await this.db.query<Subscription>(
      `UPDATE "Subscription" SET
         plan          = COALESCE($2, plan),
         status        = COALESCE($3, status),
         "endsOn"      = $4,
         "maxUsers"    = $5,
         "maxBranches" = $6,
         product       = COALESCE($7, product),
         note          = COALESCE($8, note),
         "updatedAt"   = now()
       WHERE "companyId" = $1 RETURNING *`,
      [
        companyId,
        data.plan ?? null,
        data.status ?? null,
        data.endsOn === undefined ? existing.endsOn : data.endsOn,
        data.maxUsers === undefined ? existing.maxUsers : data.maxUsers,
        data.maxBranches === undefined ? existing.maxBranches : data.maxBranches,
        data.product ?? null,
        data.note ?? null,
      ],
    );
    return rows[0];
  }
}
