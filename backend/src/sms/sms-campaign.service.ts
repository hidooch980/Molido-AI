import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { SmsService } from './sms.service';
import {
  normalizePhone,
  prepareRecipients,
  segmentCount,
  totalSegments,
  type Recipient,
} from './sms-rules';

type Row = Record<string, unknown>;

/**
 * ارسال گروهی پیامک با تاریخچه، انصراف، و برآورد هزینه.
 *
 * `SmsService` فقط «یک پیام را بفرست» را می‌داند.  آنچه یک فروشگاه
 * واقعی لازم دارد این‌هاست:
 *
 *   • **پیش‌نمایش پیش از ارسال.**  دکمه‌ای که مستقیم به هزار مشتری
 *     پیام می‌دهد بدون اینکه بگوید چند نفر و چند قبض، دیر یا زود یک
 *     اشتباه گران می‌سازد.
 *   • **انصراف.**  مشتری که گفته «نفرست» نباید پیام بگیرد.
 *   • **تاریخچه.**  «چه فرستادیم و به که» باید قابل جواب دادن باشد.
 *   • **جلوگیری از ارسال دوباره.**  کلیک دوم روی «ارسال» نباید همان
 *     کارزار را دوباره بفرستد.
 */
@Injectable()
export class SmsCampaignService {
  constructor(
    private readonly db: DatabaseService,
    private readonly sms: SmsService,
  ) {}

  // ---------------------------------------------------------- قالب

  async templates(companyId: string) {
    return this.db.query<Row>(
      `SELECT * FROM "SmsTemplate" WHERE "companyId" = $1 ORDER BY name`,
      [companyId],
    );
  }

  async saveTemplate(companyId: string, dto: { id?: string; name: string; body: string }) {
    const name = dto.name?.trim();
    const body = dto.body?.trim();
    if (!name) throw new BadRequestException('نام قالب را وارد کنید');
    if (!body) throw new BadRequestException('متن قالب را وارد کنید');

    const rows = await this.db.query<Row>(
      `INSERT INTO "SmsTemplate" (id, "companyId", name, body)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("companyId", name) DO UPDATE
         SET body = EXCLUDED.body, "updatedAt" = now()
       RETURNING *`,
      [dto.id ?? randomUUID(), companyId, name, body],
    );
    return rows[0];
  }

  async removeTemplate(companyId: string, id: string) {
    await this.db.query('DELETE FROM "SmsTemplate" WHERE id = $1 AND "companyId" = $2', [
      id,
      companyId,
    ]);
    return { deleted: true };
  }

  // ---------------------------------------------------------- انصراف

  /**
   * انصراف یا بازگشت مشتری.
   *
   * شماره نرمال می‌شود چون مشتری ممکن است با شکل دیگری (‎+98…) بنویسد
   * و آن‌وقت انصرافش روی رکورد دیگری بنشیند — یعنی عملاً بی‌اثر بماند.
   */
  async setOptOut(companyId: string, phone: string, optOut: boolean) {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new BadRequestException('شمارهٔ موبایل معتبر نیست');

    const rows = await this.db.query<Row>(
      `UPDATE "Customer"
          SET "smsOptOut" = $3,
              "smsOptOutAt" = CASE WHEN $3 THEN now() ELSE NULL END
        WHERE "companyId" = $1 AND phone = $2
        RETURNING id, phone, "smsOptOut"`,
      [companyId, normalized, optOut],
    );

    if (!rows[0]) throw new NotFoundException('مشتری با این شماره پیدا نشد');
    return rows[0];
  }

  async optedOut(companyId: string) {
    return this.db.query<Row>(
      `SELECT id, "firstName", "lastName", phone, "smsOptOutAt"
         FROM "Customer"
        WHERE "companyId" = $1 AND "smsOptOut" = true
        ORDER BY "smsOptOutAt" DESC NULLS LAST`,
      [companyId],
    );
  }

  // ---------------------------------------------------------- ارسال

  private async recipientsOf(
    companyId: string,
    input: { phones?: string[]; segment?: string; customerIds?: string[] },
  ): Promise<Recipient[]> {
    if (input.phones?.length) {
      // شماره‌های دستی: اگر مشتریِ ثبت‌شده باشند، انصرافشان هم خوانده
      // می‌شود.  بدون این، فهرست دستی راهِ دور زدنِ انصراف می‌شد.
      const normalized = input.phones
        .map((p) => normalizePhone(p))
        .filter((p): p is string => Boolean(p));

      const known = normalized.length
        ? await this.db.query<{ id: string; phone: string; smsOptOut: boolean; name: string }>(
            `SELECT id, phone, "smsOptOut",
                    NULLIF(TRIM(CONCAT_WS(' ', "firstName", "lastName")), '') AS name
               FROM "Customer"
              WHERE "companyId" = $1 AND phone = ANY($2::text[])`,
            [companyId, normalized],
          )
        : [];

      const byPhone = new Map(known.map((k) => [k.phone, k]));

      return input.phones.map((phone) => {
        const key = normalizePhone(phone);
        const match = key ? byPhone.get(key) : undefined;
        return {
          phone,
          customerId: match?.id ?? null,
          smsOptOut: match?.smsOptOut ?? false,
          name: match?.name ?? null,
        };
      });
    }

    if (input.customerIds?.length) {
      return this.db.query<Recipient>(
        `SELECT id AS "customerId", phone, "smsOptOut",
                NULLIF(TRIM(CONCAT_WS(' ', "firstName", "lastName")), '') AS name
           FROM "Customer"
          WHERE "companyId" = $1 AND id = ANY($2::text[])`,
        [companyId, input.customerIds],
      );
    }

    // همهٔ مشتریانِ دارای شماره.  بخش‌بندی دقیق‌تر کار ماژول وفاداری
    // است؛ اینجا فقط شناسه‌هایش را می‌گیریم.
    return this.db.query<Recipient>(
      `SELECT id AS "customerId", phone, "smsOptOut",
              NULLIF(TRIM(CONCAT_WS(' ', "firstName", "lastName")), '') AS name
         FROM "Customer"
        WHERE "companyId" = $1 AND phone IS NOT NULL AND phone <> ''`,
      [companyId],
    );
  }

  /**
   * پیش‌نمایش: چند نفر، چند قبض، چه کسانی حذف شدند و چرا.
   *
   * هیچ پیامی فرستاده نمی‌شود.  این همان چیزی است که کاربر باید پیش از
   * زدن «ارسال» ببیند.
   */
  async preview(
    companyId: string,
    dto: { body: string; phones?: string[]; customerIds?: string[]; vars?: Record<string, string> },
  ) {
    const body = dto.body?.trim();
    if (!body) throw new BadRequestException('متن پیام را وارد کنید');

    const recipients = await this.recipientsOf(companyId, dto);
    const { send, skipped } = prepareRecipients(recipients, body, dto.vars ?? {});

    return {
      total: recipients.length,
      willSend: send.length,
      segments: totalSegments(send),
      segmentsPerMessage: segmentCount(send[0]?.body ?? body),
      sample: send.slice(0, 3).map((s) => ({ phone: s.phone, body: s.body })),
      skipped: {
        optedOut: skipped.filter((s) => s.reason === 'OPTED_OUT').length,
        invalidPhone: skipped.filter((s) => s.reason === 'INVALID_PHONE').length,
        duplicate: skipped.filter((s) => s.reason === 'DUPLICATE').length,
        detail: skipped.slice(0, 20),
      },
    };
  }

  /**
   * ارسال واقعی.
   *
   * هر پیام **پیش از** ارسال ثبت می‌شود، نه بعدش: اگر برنامه وسط کار
   * بمیرد، رکوردهای `QUEUED` می‌مانند و معلوم است تا کجا رفته — وگرنه
   * هیچ‌کس نمی‌داند چه فرستاده شده و اجرای دوباره همه را دو بار
   * می‌فرستد.
   */
  async send(
    companyId: string,
    dto: {
      body: string;
      phones?: string[];
      customerIds?: string[];
      vars?: Record<string, string>;
      kind?: string;
      campaignId?: string;
      /** کلید یکتاسازی؛ ارسال دوباره با همین کلید تکرار نمی‌شود. */
      dedupeKey?: string;
      /** سقف ایمنی: بیش از این تعداد بدون تأیید صریح فرستاده نمی‌شود. */
      maxRecipients?: number;
    },
  ) {
    const body = dto.body?.trim();
    if (!body) throw new BadRequestException('متن پیام را وارد کنید');

    const recipients = await this.recipientsOf(companyId, dto);
    const { send, skipped } = prepareRecipients(recipients, body, dto.vars ?? {});

    if (!send.length) {
      return { queued: 0, sent: 0, failed: 0, skipped: skipped.length, results: [] };
    }

    // سقف ایمنی.  اشتباه در انتخاب مخاطب، تفاوتش با یک ارسال درست فقط
    // یک کلیک است — و پیامکِ فرستاده‌شده برنمی‌گردد.
    const cap = Number(dto.maxRecipients ?? 0);
    if (cap > 0 && send.length > cap) {
      throw new BadRequestException(
        `تعداد گیرندگان (${send.length}) از سقف تعیین‌شده (${cap}) بیشتر است`,
      );
    }

    const results: Array<{ phone: string; status: string; error?: string }> = [];
    let sent = 0;
    let failed = 0;

    for (const [index, item] of send.entries()) {
      const id = randomUUID();
      // کلید یکتا در سطح گیرنده، نه کل ارسال: اگر ارسال نیمه‌کاره
      // بماند، اجرای دوباره فقط باقی‌مانده را می‌فرستد.
      const dedupe = dto.dedupeKey ? `${dto.dedupeKey}:${item.phone}` : null;

      const inserted = await this.db.query<{ id: string }>(
        `INSERT INTO "SmsMessage"
           (id, "companyId", phone, "customerId", body, status, kind, "campaignId", "dedupeKey")
         VALUES ($1, $2, $3, $4, $5, 'QUEUED', $6, $7, $8)
         ON CONFLICT ("companyId", "dedupeKey") WHERE "dedupeKey" IS NOT NULL
           DO NOTHING
         RETURNING id`,
        [
          id,
          companyId,
          item.phone,
          item.customerId,
          item.body,
          dto.kind ?? 'MANUAL',
          dto.campaignId ?? null,
          dedupe,
        ],
      );

      if (!inserted[0]) {
        results.push({ phone: item.phone, status: 'DUPLICATE' });
        continue;
      }

      const outcome = await this.sms.send(item.phone, item.body);
      const ok = Boolean((outcome as { sent?: boolean }).sent);
      // حالت شبیه‌سازی شکست نیست؛ نباید در گزارش خطا بیاید.
      const simulated = Boolean((outcome as { simulated?: boolean }).simulated);

      await this.db.query(
        `UPDATE "SmsMessage"
            SET status = $2, error = $3, "sentAt" = CASE WHEN $2 = 'SENT' THEN now() ELSE NULL END
          WHERE id = $1`,
        [
          id,
          ok || simulated ? 'SENT' : 'FAILED',
          ok || simulated ? null : String((outcome as { error?: string }).error ?? 'ارسال ناموفق'),
        ],
      );

      if (ok || simulated) sent += 1;
      else failed += 1;

      results.push({
        phone: item.phone,
        status: ok || simulated ? 'SENT' : 'FAILED',
        ...(index < 0 ? {} : {}),
      });
    }

    // آنچه عمداً نفرستادیم هم ثبت می‌شود: بعداً که مشتری می‌گوید
    // «چرا پیام نگرفتم»، پاسخ باید در همان تاریخچه باشد.
    for (const item of skipped) {
      await this.db.query(
        `INSERT INTO "SmsMessage"
           (id, "companyId", phone, "customerId", body, status, "skipReason", kind, "campaignId")
         VALUES ($1, $2, $3, $4, $5, 'SKIPPED', $6, $7, $8)`,
        [
          randomUUID(),
          companyId,
          item.phone,
          item.customerId,
          body,
          item.reason,
          dto.kind ?? 'MANUAL',
          dto.campaignId ?? null,
        ],
      );
    }

    return { queued: send.length, sent, failed, skipped: skipped.length, results };
  }

  // ---------------------------------------------------------- تاریخچه

  async history(companyId: string, filter: { status?: string; phone?: string; limit?: number }) {
    const where = ['"companyId" = $1'];
    const params: unknown[] = [companyId];

    if (filter.status) {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }
    if (filter.phone) {
      const normalized = normalizePhone(filter.phone) ?? filter.phone;
      params.push(normalized);
      where.push(`phone = $${params.length}`);
    }

    const limit = Math.min(Number(filter.limit) || 200, 1000);

    return this.db.query<Row>(
      `SELECT * FROM "SmsMessage"
        WHERE ${where.join(' AND ')}
        ORDER BY "createdAt" DESC
        LIMIT ${limit}`,
      params,
    );
  }

  async stats(companyId: string) {
    const rows = await this.db.query<Row>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'SENT')    AS sent,
         COUNT(*) FILTER (WHERE status = 'FAILED')  AS failed,
         COUNT(*) FILTER (WHERE status = 'SKIPPED') AS skipped,
         COUNT(*) FILTER (WHERE status = 'QUEUED')  AS queued,
         COUNT(*) FILTER (WHERE status = 'SENT'
                          AND "createdAt" > now() - INTERVAL '30 days') AS "sent30d",
         (SELECT COUNT(*) FROM "Customer"
           WHERE "companyId" = $1 AND "smsOptOut" = true) AS "optedOut"
       FROM "SmsMessage" WHERE "companyId" = $1`,
      [companyId],
    );
    return rows[0];
  }
}
