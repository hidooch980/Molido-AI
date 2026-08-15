import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';

/**
 * شناسایی مشتری در صندوق با QR.
 *
 * مشتری در اپلیکیشن یک QR می‌بیند، صندوق‌دار با همان اسکنر بارکد
 * می‌خواندش، و فاکتور به حساب او می‌خورد: سطح قیمتش اعمال می‌شود، کد
 * شخصی‌اش قابل استفاده می‌شود، و خرید حضوری در سابقه‌اش می‌نشیند.
 *
 * تصمیم امنیتی اصلی: توکن **کوتاه‌عمر و یک‌بارمصرف** است.
 *
 * QR روی صفحهٔ موبایل با یک عکس قابل تکثیر است.  اگر توکن ثابت بود —
 * مثلاً شناسهٔ مشتری — هر کسی که یک بار آن را می‌دید می‌توانست خریدش را
 * به حساب دیگری بزند یا از تخفیف شخصی او استفاده کند.
 */

const TTL_SECONDS = 120;

/** پیشوند تا صندوق بفهمد این QR شناسایی است نه بارکد کالا. */
const PREFIX = 'MC1:';

@Injectable()
export class CheckinService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * ساخت توکن تازه برای مشتری.
   *
   * توکن‌های قبلیِ همان مشتری باطل می‌شوند: اگر چند توکن هم‌زمان معتبر
   * بمانند، عکسی که دیروز از صفحه گرفته شده هنوز کار می‌کند.
   */
  async issue(companyId: string, customerId: string) {
    await this.db.query(
      `UPDATE "CustomerCheckin" SET "expiresAt" = now()
        WHERE "customerId" = $1 AND "usedAt" IS NULL AND "expiresAt" > now()`,
      [customerId],
    );

    const token = PREFIX + randomBytes(18).toString('base64url');
    const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

    await this.db.query(
      `INSERT INTO "CustomerCheckin" (id, "companyId", "customerId", token, "expiresAt")
       VALUES ($1,$2,$3,$4,$5)`,
      [randomUUID(), companyId, customerId, token, expiresAt],
    );

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      // اپلیکیشن باید بداند کِی خودش را تازه کند، بی‌آنکه عدد را حدس بزند.
      ttlSeconds: TTL_SECONDS,
    };
  }

  /** آیا این رشته اصلاً توکن شناسایی است. */
  static looksLikeToken(value: string): boolean {
    return typeof value === 'string' && value.startsWith(PREFIX);
  }

  /**
   * خواندن توکن در صندوق.
   *
   * توکن اینجا **مصرف نمی‌شود**: صندوق‌دار ممکن است مشتری را بشناسد و بعد
   * فروش را لغو کند.  مصرف در لحظهٔ ثبت فاکتور انجام می‌شود.
   */
  async resolve(companyId: string, token: string) {
    const [row] = await this.db.query<{
      id: string;
      customerId: string;
      usedAt: Date | null;
      expiresAt: Date;
      name: string | null;
      phone: string | null;
      priceLevelId: string | null;
    }>(
      `SELECT k.id, k."customerId", k."usedAt", k."expiresAt",
              NULLIF(TRIM(CONCAT_WS(' ', c."firstName", c."lastName")), '') AS name,
              c.phone, c."priceLevelId"
         FROM "CustomerCheckin" k
         JOIN "Customer" c ON c.id = k."customerId"
        WHERE k."companyId" = $1 AND k.token = $2`,
      [companyId, String(token ?? '').trim()],
    );

    if (!row) throw new NotFoundException('کد شناسایی نامعتبر است');
    if (row.usedAt) throw new BadRequestException('این کد قبلاً استفاده شده است');

    if (new Date(row.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException(
        'کد شناسایی منقضی شده؛ از مشتری بخواهید صفحه را تازه کند',
      );
    }

    const codes = await this.db.query<{ code: string; ruleName: string }>(
      `SELECT d.code, r.name AS "ruleName"
         FROM "DiscountCode" d
         JOIN "DiscountRule" r ON r.id = d."ruleId"
        WHERE d."customerId" = $1
          AND d."usedCount" < d."maxUses"
          AND (d."expiresAt" IS NULL OR d."expiresAt" > now())
          AND r."isActive" = true`,
      [row.customerId],
    );

    return {
      checkinId: row.id,
      customerId: row.customerId,
      name: row.name,
      phone: row.phone,
      priceLevelId: row.priceLevelId,
      // کدهای فعال همین‌جا برمی‌گردند تا صندوق‌دار مجبور نباشد از مشتری
      // بپرسد «کد تخفیفی داری؟» — و مشتری‌ای که یادش رفته، از دستش ندهد.
      availableCodes: codes,
    };
  }

  /** مصرف توکن هنگام ثبت فاکتور. */
  async consume(companyId: string, checkinId: string, saleId: string) {
    await this.db.query(
      `UPDATE "CustomerCheckin"
          SET "usedAt" = now(), "saleId" = $1
        WHERE id = $2 AND "companyId" = $3 AND "usedAt" IS NULL`,
      [saleId, checkinId, companyId],
    );
  }
}
