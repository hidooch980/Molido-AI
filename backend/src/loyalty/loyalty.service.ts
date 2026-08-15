import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { SmsService } from '../sms/sms.service';

/**
 * باشگاه مشتریان.
 *
 * سه کار: مشتری‌ها را بر اساس رفتار خریدشان دسته می‌کند، برای هر کدام کد
 * تخفیف **شخصی** صادر و ارسال می‌کند، و در فروشگاه با QR شناسایی‌شان
 * می‌کند تا خرید حضوری هم به حسابشان بخورد.
 */

type Row = Record<string, unknown>;

/**
 * بخش‌های مشتری.
 *
 * مرزها بر اساس رفتار است نه عدد دلخواه: «وفادار» یعنی چند بار خرید کرده
 * و اخیراً هم آمده؛ «در خطر» یعنی قبلاً مشتری خوبی بوده و مدتی است نیامده
 * — و دقیقاً همین گروه است که یک کد تخفیف برمی‌گرداندش.
 */
export const SEGMENTS = {
  ALL: 'ALL',
  LOYAL: 'LOYAL',
  AT_RISK: 'AT_RISK',
  NEW: 'NEW',
  INACTIVE: 'INACTIVE',
} as const;

export type Segment = (typeof SEGMENTS)[keyof typeof SEGMENTS];

const LOYAL_MIN_ORDERS = 3;
const RECENT_DAYS = 60;
const AT_RISK_DAYS = 120;

@Injectable()
export class LoyaltyService {
  constructor(
    private readonly db: DatabaseService,
    private readonly sms: SmsService,
  ) {}

  /**
   * پروفایل خرید هر مشتری.
   *
   * پایهٔ همهٔ بخش‌بندی‌هاست، پس یک‌جا تعریف می‌شود: تعریف دوگانه یعنی
   * شمارشِ پیش‌نمایش با آنچه واقعاً ارسال می‌شود فرق می‌کند.
   */
  private profileSql(alias = 'c') {
    return `
      SELECT ${alias}.id,
             ${alias}."firstName", ${alias}."lastName", ${alias}.phone,
             COUNT(s.id)                          AS "orderCount",
             COALESCE(SUM(s.total), 0)            AS "totalSpent",
             MAX(s."createdAt")                   AS "lastOrderAt",
             ${alias}."createdAt"                 AS "joinedAt"
        FROM "Customer" ${alias}
        LEFT JOIN "Sale" s
               ON s."customerId" = ${alias}.id AND s.status <> 'CANCELLED'
       WHERE ${alias}."companyId" = $1
       GROUP BY ${alias}.id`;
  }

  /** شرط SQL هر بخش، روی خروجی `profileSql`. */
  private segmentFilter(segment: Segment): string {
    switch (segment) {
      case SEGMENTS.LOYAL:
        return `p."orderCount" >= ${LOYAL_MIN_ORDERS}
                AND p."lastOrderAt" >= now() - interval '${RECENT_DAYS} days'`;

      case SEGMENTS.AT_RISK:
        // قبلاً خوب بوده، حالا نیامده — همان گروهی که کد تخفیف
        // برمی‌گرداندش.  بدون سقف زمانیِ بالا، «رفته برای همیشه»ها هم
        // داخلش می‌افتند و هزینهٔ پیامک هدر می‌رود.
        return `p."orderCount" >= ${LOYAL_MIN_ORDERS}
                AND p."lastOrderAt" < now() - interval '${RECENT_DAYS} days'
                AND p."lastOrderAt" >= now() - interval '${AT_RISK_DAYS} days'`;

      case SEGMENTS.NEW:
        return `p."orderCount" BETWEEN 1 AND ${LOYAL_MIN_ORDERS - 1}`;

      case SEGMENTS.INACTIVE:
        // ثبت‌نام کرده ولی هرگز نخریده — کد تخفیف اینجا بیشترین اثر را
        // دارد چون فقط یک هل کوچک لازم است.
        return `p."orderCount" = 0`;

      case SEGMENTS.ALL:
      default:
        return 'TRUE';
    }
  }

  /** شمارش هر بخش — برای انتخاب هدف پیش از ارسال. */
  async segments(companyId: string) {
    const [row] = await this.db.query<Record<string, string>>(
      `WITH p AS (${this.profileSql()})
       SELECT
         COUNT(*)                                    AS "ALL",
         COUNT(*) FILTER (WHERE ${this.segmentFilter(SEGMENTS.LOYAL)})    AS "LOYAL",
         COUNT(*) FILTER (WHERE ${this.segmentFilter(SEGMENTS.AT_RISK)})  AS "AT_RISK",
         COUNT(*) FILTER (WHERE ${this.segmentFilter(SEGMENTS.NEW)})      AS "NEW",
         COUNT(*) FILTER (WHERE ${this.segmentFilter(SEGMENTS.INACTIVE)}) AS "INACTIVE",
         COUNT(*) FILTER (WHERE p.phone IS NULL OR p.phone = '')          AS "noPhone"
        FROM p`,
      [companyId],
    );

    return {
      ALL: Number(row?.ALL ?? 0),
      LOYAL: Number(row?.LOYAL ?? 0),
      AT_RISK: Number(row?.AT_RISK ?? 0),
      NEW: Number(row?.NEW ?? 0),
      INACTIVE: Number(row?.INACTIVE ?? 0),
      // بدون شماره، پیامکی در کار نیست؛ کاربر باید پیش از ارسال بداند.
      noPhone: Number(row?.noPhone ?? 0),
    };
  }

  /** مشتری‌های یک بخش. */
  async audience(companyId: string, segment: Segment, limit = 500) {
    return this.db.query<Row & { id: string; phone: string | null }>(
      `WITH p AS (${this.profileSql()})
       SELECT p.*,
              NULLIF(TRIM(CONCAT_WS(' ', p."firstName", p."lastName")), '') AS name
         FROM p
        WHERE ${this.segmentFilter(segment)}
        ORDER BY p."totalSpent" DESC
        LIMIT ${Math.min(Number(limit) || 500, 2000)}`,
      [companyId],
    );
  }

  // ------------------------------------------------------------ کارزار

  async campaigns(companyId: string) {
    return this.db.query<Row>(
      `SELECT c.*, r.name AS "ruleName", r.kind, r.value,
              (SELECT COUNT(*) FROM "DiscountCode" d
                WHERE d."campaignId" = c.id) AS "codeCount",
              (SELECT COUNT(*) FROM "DiscountCode" d
                WHERE d."campaignId" = c.id AND d."redeemedAt" IS NOT NULL)
                AS "redeemedCount"
         FROM "DiscountCampaign" c
         JOIN "DiscountRule" r ON r.id = c."ruleId"
        WHERE c."companyId" = $1
        ORDER BY c."createdAt" DESC
        LIMIT 100`,
      [companyId],
    );
  }

  /**
   * ساخت کارزار: برای هر مشتری یک کد شخصی صادر و پیامک می‌شود.
   *
   * ارسال **پس از** ثبت کدها انجام می‌شود، نه هم‌زمان: اگر وسط ارسال
   * چیزی بشکند، کدها ساخته شده‌اند و می‌توان ادامه داد؛ عکسش یعنی مشتری
   * پیامکِ کدی را گرفته که در دیتابیس وجود ندارد.
   */
  async createCampaign(
    companyId: string,
    userId: string,
    dto: {
      ruleId: string;
      name: string;
      segment: Segment;
      messageTemplate: string;
      expiresAt?: string;
      maxUses?: number;
    },
  ) {
    if (!String(dto.name ?? '').trim()) {
      throw new BadRequestException('نام کارزار لازم است');
    }

    const template = String(dto.messageTemplate ?? '').trim();
    if (!template.includes('{code}')) {
      // بدون {code} پیامک بی‌فایده است و هزینه‌اش هم رفته.
      throw new BadRequestException('متن پیام باید شامل {code} باشد');
    }

    const [rule] = await this.db.query<{ id: string; requiresCode: boolean }>(
      'SELECT id, "requiresCode" FROM "DiscountRule" WHERE id = $1 AND "companyId" = $2',
      [dto.ruleId, companyId],
    );
    if (!rule) throw new NotFoundException('قاعدهٔ تخفیف یافت نشد');

    // قاعدهٔ کارزار باید قفل باشد، وگرنه تخفیف بدون کد هم به همه می‌خورد
    // و کدهای صادرشده بی‌معنا می‌شوند.
    await this.db.query(
      'UPDATE "DiscountRule" SET "requiresCode" = true WHERE id = $1',
      [dto.ruleId],
    );

    const targets = (await this.audience(companyId, dto.segment)).filter(
      (item) => String(item.phone ?? '').trim(),
    );

    if (!targets.length) {
      throw new BadRequestException(
        'هیچ مشتری با شمارهٔ تلفن در این بخش نیست',
      );
    }

    const campaignId = randomUUID();

    await this.db.query(
      `INSERT INTO "DiscountCampaign"
         (id, "companyId", "ruleId", name, segment, "messageTemplate",
          "expiresAt", "createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        campaignId,
        companyId,
        dto.ruleId,
        String(dto.name).trim(),
        dto.segment,
        template,
        dto.expiresAt || null,
        userId,
      ],
    );

    const issued: Array<{ id: string; code: string; phone: string; name: string }> = [];

    for (const target of targets) {
      const code = await this.uniqueCode(companyId);
      const id = randomUUID();

      await this.db.query(
        `INSERT INTO "DiscountCode"
           (id, "companyId", "ruleId", "campaignId", "customerId", code,
            "maxUses", "expiresAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          companyId,
          dto.ruleId,
          campaignId,
          target.id,
          code,
          Number(dto.maxUses ?? 1),
          dto.expiresAt || null,
        ],
      );

      issued.push({
        id,
        code,
        phone: String(target.phone),
        name: String(target.name ?? ''),
      });
    }

    let sent = 0;
    let failed = 0;

    for (const item of issued) {
      const message = template
        .replace(/\{code\}/g, item.code)
        .replace(/\{name\}/g, item.name || 'مشتری گرامی');

      const result = await this.sms.send(item.phone, message);

      // ارسال شبیه‌سازی‌شده (بدون کلید پیامک) شکست نیست: در توسعه و نصب
      // بدون پنل پیامکی، کد ساخته شده و در کنسول دیده می‌شود.
      const ok = result.sent === true || result.simulated === true;

      await this.db.query(
        `UPDATE "DiscountCode"
            SET "sentAt" = CASE WHEN $1 THEN now() ELSE NULL END,
                "sendError" = $2,
                "updatedAt" = now()
          WHERE id = $3`,
        [ok, ok ? null : String(result.error ?? 'ارسال ناموفق'), item.id],
      );

      if (ok) sent += 1;
      else failed += 1;
    }

    await this.db.query(
      `UPDATE "DiscountCampaign"
          SET "sentCount" = $1, "failedCount" = $2, "updatedAt" = now()
        WHERE id = $3`,
      [sent, failed, campaignId],
    );

    return { id: campaignId, issued: issued.length, sent, failed };
  }

  async campaignCodes(companyId: string, campaignId: string) {
    return this.db.query<Row>(
      `SELECT d.id, d.code, d."sentAt", d."sendError", d."redeemedAt",
              d."usedCount", d."maxUses",
              NULLIF(TRIM(CONCAT_WS(' ', c."firstName", c."lastName")), '')
                AS "customerName",
              c.phone
         FROM "DiscountCode" d
         LEFT JOIN "Customer" c ON c.id = d."customerId"
        WHERE d."companyId" = $1 AND d."campaignId" = $2
        ORDER BY d."createdAt"`,
      [companyId, campaignId],
    );
  }

  /** کدهای فعال یک مشتری — اپلیکیشن مشتری این را نشان می‌دهد. */
  async customerCodes(companyId: string, customerId: string) {
    return this.db.query<Row>(
      `SELECT d.code, d."expiresAt", d."usedCount", d."maxUses",
              r.name AS "ruleName", r.kind, r.value, r."minAmount"
         FROM "DiscountCode" d
         JOIN "DiscountRule" r ON r.id = d."ruleId"
        WHERE d."companyId" = $1
          AND d."customerId" = $2
          AND d."usedCount" < d."maxUses"
          AND (d."expiresAt" IS NULL OR d."expiresAt" > now())
          AND r."isActive" = true
        ORDER BY d."createdAt" DESC`,
      [companyId, customerId],
    );
  }

  /**
   * کد بدون حروف مبهم.
   *
   * مشتری کد را از روی پیامک می‌خواند و به صندوق‌دار می‌گوید؛ O و 0، و
   * I و 1 و L، همان‌جا اشتباه خوانده می‌شوند.
   */
  private async uniqueCode(companyId: string): Promise<string> {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const bytes = randomBytes(8);
      let code = '';
      for (let index = 0; index < 8; index += 1) {
        code += alphabet[bytes[index] % alphabet.length];
      }

      const rows = await this.db.query<{ id: string }>(
        'SELECT id FROM "DiscountCode" WHERE "companyId" = $1 AND upper(code) = $2',
        [companyId, code],
      );

      if (!rows[0]) return code;
    }

    throw new BadRequestException('ساخت کد یکتا ممکن نشد');
  }
}
