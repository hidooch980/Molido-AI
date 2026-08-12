import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PoolClient } from 'pg';

import { DatabaseService } from '../database/database.service';

/**
 * CRM: سرنخ ← فرصت ← تعامل.
 *
 * پیش از این ماژول `crm` یک CRUD روی `LoyaltyAccount` بود — «باشگاه
 * مشتریان» را CRM نامیده بودند و هیچ قیف فروشی وجود نداشت.
 *
 * تصمیم اصلی: **CRM جزیره‌ای ساخته نمی‌شود.**  سرنخ به مشتری تبدیل می‌شود و
 * فرصتِ برنده به پیش‌فاکتور — پس همان زنجیرهٔ موجود (پیش‌فاکتور ← سفارش ←
 * ارسال ← فاکتور) ادامه پیدا می‌کند.  CRM‌ای که فقط یادداشت نگه دارد و به
 * فروش وصل نباشد، همان الگویی است که در این پروژه بارها تکرار شده.
 */

type Row = Record<string, unknown>;

@Injectable()
export class CrmService {
  constructor(private readonly db: DatabaseService) {}

  private async nextNo(
    tx: PoolClient,
    table: 'Lead' | 'Opportunity',
    column: string,
    prefix: string,
    companyId: string,
  ): Promise<string> {
    const { rows } = await tx.query<{ n: string | null }>(
      `SELECT MAX(NULLIF(regexp_replace("${column}", '\\D', '', 'g'), '')::bigint) AS n
         FROM "${table}" WHERE "companyId" = $1`,
      [companyId],
    );
    return `${prefix}-${String(Number(rows[0]?.n ?? 0) + 1).padStart(5, '0')}`;
  }

  // ------------------------------------------------------------- سرنخ

  async leads(companyId: string, status?: string) {
    const values: unknown[] = [companyId];
    let filter = '';

    if (status) {
      values.push(status);
      filter = ` AND l.status = $${values.length}`;
    }

    return this.db.query<Row>(
      `SELECT l.*,
              a.name AS "agentName",
              (SELECT COUNT(*) FROM "Interaction" i WHERE i."leadId" = l.id)
                AS "interactionCount",
              (SELECT MAX(i."occurredAt") FROM "Interaction" i WHERE i."leadId" = l.id)
                AS "lastContact"
         FROM "Lead" l
         LEFT JOIN "SalesAgent" a ON a.id = l."salesAgentId"
        WHERE l."companyId" = $1${filter}
        ORDER BY l.score DESC, l."createdAt" DESC
        LIMIT 300`,
      values,
    );
  }

  async lead(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      'SELECT * FROM "Lead" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('سرنخ یافت نشد');

    const [interactions, opportunities] = await Promise.all([
      this.db.query<Row>(
        `SELECT * FROM "Interaction" WHERE "leadId" = $1
          ORDER BY "occurredAt" DESC LIMIT 100`,
        [id],
      ),
      this.db.query<Row>(
        'SELECT * FROM "Opportunity" WHERE "leadId" = $1 ORDER BY "createdAt" DESC',
        [id],
      ),
    ]);

    return { ...rows[0], interactions, opportunities };
  }

  async createLead(companyId: string, dto: Record<string, unknown>) {
    if (!String(dto.name ?? '').trim()) {
      throw new BadRequestException('نام سرنخ لازم است');
    }

    return this.db.transaction(async (tx) => {
      const leadNo = await this.nextNo(tx, 'Lead', 'leadNo', 'LD', companyId);

      const { rows } = await tx.query<Row>(
        `INSERT INTO "Lead"
           (id, "companyId", "leadNo", name, company, phone, email, source,
            status, score, "assignedTo", "salesAgentId", note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'NEW',$9,$10,$11,$12) RETURNING *`,
        [
          randomUUID(),
          companyId,
          leadNo,
          String(dto.name).trim(),
          dto.company ?? null,
          dto.phone ?? null,
          dto.email ?? null,
          dto.source ?? 'OTHER',
          Number(dto.score ?? 0),
          dto.assignedTo ?? null,
          dto.salesAgentId ?? null,
          dto.note ?? null,
        ],
      );

      return rows[0];
    });
  }

  async updateLead(companyId: string, id: string, dto: Record<string, unknown>) {
    const allowed = [
      'name',
      'company',
      'phone',
      'email',
      'source',
      'status',
      'score',
      'assignedTo',
      'salesAgentId',
      'note',
    ];

    const sets: string[] = [];
    const values: unknown[] = [id, companyId];

    for (const key of allowed) {
      if (dto[key] === undefined) continue;
      values.push(dto[key]);
      sets.push(`"${key}" = $${values.length}`);
    }

    if (!sets.length) return this.lead(companyId, id);

    const rows = await this.db.query<Row>(
      `UPDATE "Lead" SET ${sets.join(', ')}, "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      values,
    );

    if (!rows[0]) throw new NotFoundException('سرنخ یافت نشد');
    return rows[0];
  }

  /**
   * سرنخ ← مشتری.
   *
   * سرنخ حذف نمی‌شود؛ وضعیتش `CONVERTED` می‌شود و به مشتری تازه پیوند
   * می‌خورد — تا تاریخچهٔ تعامل‌های پیش از تبدیل هم قابل ردیابی بماند.
   */
  async convertLead(companyId: string, leadId: string) {
    return this.db.transaction(async (tx) => {
      const leads = await tx.query<{
        id: string;
        name: string;
        phone: string | null;
        email: string | null;
        status: string;
        customerId: string | null;
        salesAgentId: string | null;
      }>(
        'SELECT * FROM "Lead" WHERE id = $1 AND "companyId" = $2 FOR UPDATE',
        [leadId, companyId],
      );

      const lead = leads.rows[0];
      if (!lead) throw new NotFoundException('سرنخ یافت نشد');
      if (lead.status === 'CONVERTED') {
        throw new BadRequestException('این سرنخ قبلاً به مشتری تبدیل شده است');
      }
      if (lead.status === 'LOST') {
        throw new BadRequestException('سرنخ ازدست‌رفته قابل تبدیل نیست');
      }

      // نام سرنخ یک رشته است ولی مشتری نام و نام خانوادگی جدا دارد؛ اولین
      // واژه نام و بقیه نام خانوادگی در نظر گرفته می‌شود.
      const parts = lead.name.trim().split(/\s+/);
      const firstName = parts[0] ?? lead.name;
      const lastName = parts.slice(1).join(' ') || '—';

      const customerId = randomUUID();

      await tx.query(
        `INSERT INTO "Customer"
           (id, "companyId", "firstName", "lastName", phone, email,
            "isActive", "salesAgentId")
         VALUES ($1,$2,$3,$4,$5,$6,true,$7)`,
        [
          customerId,
          companyId,
          firstName,
          lastName,
          lead.phone,
          lead.email,
          lead.salesAgentId,
        ],
      );

      await tx.query(
        `UPDATE "Lead" SET status = 'CONVERTED', "customerId" = $1,
                "updatedAt" = now()
          WHERE id = $2`,
        [customerId, leadId],
      );

      // تعامل‌های سرنخ به مشتری هم وصل می‌شوند تا تاریخچه گم نشود.
      await tx.query(
        'UPDATE "Interaction" SET "customerId" = $1 WHERE "leadId" = $2',
        [customerId, leadId],
      );

      return { leadId, customerId, firstName, lastName };
    });
  }

  // ------------------------------------------------------------ فرصت

  async opportunities(companyId: string, stage?: string) {
    const values: unknown[] = [companyId];
    let filter = '';

    if (stage) {
      values.push(stage);
      filter = ` AND o.stage = $${values.length}`;
    }

    return this.db.query<Row>(
      `SELECT o.*,
              l."leadNo",
              TRIM(COALESCE(c."firstName",'') || ' ' || COALESCE(c."lastName",''))
                AS "customerName",
              a.name AS "agentName",
              -- ارزش وزنی: مبلغ × احتمال.  جمعش، پیش‌بینی واقع‌بینانهٔ قیف است.
              ROUND(o.amount * o.probability / 100.0, 2) AS "weightedAmount"
         FROM "Opportunity" o
         LEFT JOIN "Lead" l ON l.id = o."leadId"
         LEFT JOIN "Customer" c ON c.id = o."customerId"
         LEFT JOIN "SalesAgent" a ON a.id = o."salesAgentId"
        WHERE o."companyId" = $1${filter}
        ORDER BY o."expectedCloseDate" NULLS LAST, o.amount DESC
        LIMIT 300`,
      values,
    );
  }

  async createOpportunity(companyId: string, dto: Record<string, unknown>) {
    if (!String(dto.title ?? '').trim()) {
      throw new BadRequestException('عنوان فرصت لازم است');
    }

    return this.db.transaction(async (tx) => {
      const oppNo = await this.nextNo(
        tx, 'Opportunity', 'oppNo', 'OP', companyId,
      );

      const { rows } = await tx.query<Row>(
        `INSERT INTO "Opportunity"
           (id, "companyId", "oppNo", title, "leadId", "customerId",
            "salesAgentId", "assignedTo", amount, probability, stage,
            "expectedCloseDate", note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PROSPECT',$11,$12)
         RETURNING *`,
        [
          randomUUID(),
          companyId,
          oppNo,
          String(dto.title).trim(),
          dto.leadId ?? null,
          dto.customerId ?? null,
          dto.salesAgentId ?? null,
          dto.assignedTo ?? null,
          Number(dto.amount ?? 0),
          Number(dto.probability ?? 50),
          dto.expectedCloseDate ?? null,
          dto.note ?? null,
        ],
      );

      return rows[0];
    });
  }

  /**
   * جابه‌جایی فرصت در قیف.
   *
   * `WON` و `LOST` پایان کارند و زمان بسته‌شدن ثبت می‌شود.  باخت بدون دلیل
   * پذیرفته نمی‌شود — قید دیتابیس هم همین را می‌گوید — چون تنها ارزش واقعی
   * ثبت باخت، گزارش «چرا می‌بازیم» است.
   */
  async moveStage(
    companyId: string,
    id: string,
    dto: { stage: string; lostReason?: string; probability?: number },
  ) {
    const stage = dto.stage;

    if (stage === 'LOST' && !String(dto.lostReason ?? '').trim()) {
      throw new BadRequestException('دلیل باخت لازم است');
    }

    // احتمال با مرحله همگام می‌شود مگر صریحاً داده شود: فرصتِ برنده ۱۰۰٪
    // است و بازنده صفر؛ رها کردن عدد قبلی، پیش‌بینی قیف را خراب می‌کند.
    const probability =
      dto.probability ??
      (stage === 'WON' ? 100 : stage === 'LOST' ? 0 : undefined);

    const sets = ['stage = $3', '"updatedAt" = now()'];
    const values: unknown[] = [id, companyId, stage];

    if (probability !== undefined) {
      values.push(probability);
      sets.push(`probability = $${values.length}`);
    }

    if (stage === 'LOST') {
      values.push(String(dto.lostReason).trim());
      sets.push(`"lostReason" = $${values.length}`);
    }

    if (stage === 'WON' || stage === 'LOST') {
      sets.push('"closedAt" = now()');
    }

    const rows = await this.db.query<Row>(
      `UPDATE "Opportunity" SET ${sets.join(', ')}
        WHERE id = $1 AND "companyId" = $2
          AND stage NOT IN ('WON','LOST')
        RETURNING *`,
      values,
    );

    if (rows[0]) return rows[0];

    const existing = await this.db.query<{ stage: string }>(
      'SELECT stage FROM "Opportunity" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );

    if (!existing[0]) throw new NotFoundException('فرصت یافت نشد');
    throw new BadRequestException(
      `فرصت در وضعیت «${existing[0].stage}» بسته شده و قابل تغییر نیست`,
    );
  }

  // -------------------------------------------------------- تعامل

  async interactions(companyId: string, dueOnly = false) {
    const filter = dueOnly
      ? ' AND i."followUpDone" = false AND i."followUpAt" <= now()'
      : '';

    return this.db.query<Row>(
      `SELECT i.*, l."leadNo", l.name AS "leadName", o."oppNo", o.title AS "oppTitle"
         FROM "Interaction" i
         LEFT JOIN "Lead" l ON l.id = i."leadId"
         LEFT JOIN "Opportunity" o ON o.id = i."opportunityId"
        WHERE i."companyId" = $1${filter}
        ORDER BY COALESCE(i."followUpAt", i."occurredAt") DESC
        LIMIT 300`,
      [companyId],
    );
  }

  async createInteraction(
    companyId: string,
    userId: string,
    dto: Record<string, unknown>,
  ) {
    if (!String(dto.subject ?? '').trim()) {
      throw new BadRequestException('موضوع تعامل لازم است');
    }
    if (!dto.leadId && !dto.opportunityId && !dto.customerId) {
      throw new BadRequestException(
        'تعامل باید به سرنخ، فرصت یا مشتری وصل باشد',
      );
    }

    const rows = await this.db.query<Row>(
      `INSERT INTO "Interaction"
         (id, "companyId", type, subject, body, "leadId", "opportunityId",
          "customerId", "userId", "occurredAt", "followUpAt", outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz, now()),$11,$12)
       RETURNING *`,
      [
        randomUUID(),
        companyId,
        dto.type ?? 'CALL',
        String(dto.subject).trim(),
        dto.body ?? null,
        dto.leadId ?? null,
        dto.opportunityId ?? null,
        dto.customerId ?? null,
        userId,
        dto.occurredAt ?? null,
        dto.followUpAt ?? null,
        dto.outcome ?? null,
      ],
    );

    return rows[0];
  }

  async completeFollowUp(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      `UPDATE "Interaction" SET "followUpDone" = true
        WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      [id, companyId],
    );

    if (!rows[0]) throw new NotFoundException('تعامل یافت نشد');
    return rows[0];
  }

  // -------------------------------------------------------- گزارش

  /** قیف فروش: تعداد و مبلغ در هر مرحله. */
  async funnel(companyId: string) {
    return this.db.query<Row>(
      `SELECT stage,
              COUNT(*) AS count,
              COALESCE(SUM(amount),0) AS amount,
              COALESCE(SUM(amount * probability / 100.0),0) AS "weightedAmount"
         FROM "Opportunity"
        WHERE "companyId" = $1
        GROUP BY stage`,
      [companyId],
    );
  }

  async stats(companyId: string) {
    const rows = await this.db.query<Row>(
      `SELECT
         (SELECT COUNT(*) FROM "Lead"
           WHERE "companyId" = $1 AND status IN ('NEW','CONTACTED','QUALIFIED'))
             AS "openLeads",
         (SELECT COUNT(*) FROM "Opportunity"
           WHERE "companyId" = $1 AND stage NOT IN ('WON','LOST'))
             AS "openOpportunities",
         (SELECT COALESCE(SUM(amount * probability / 100.0),0) FROM "Opportunity"
           WHERE "companyId" = $1 AND stage NOT IN ('WON','LOST'))
             AS "pipelineValue",
         (SELECT COUNT(*) FROM "Interaction"
           WHERE "companyId" = $1 AND "followUpDone" = false
             AND "followUpAt" <= now())
             AS "dueFollowUps",
         -- نرخ تبدیل: چند درصد فرصت‌های بسته‌شده برنده شده‌اند
         (SELECT CASE WHEN COUNT(*) = 0 THEN 0
                      ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE stage = 'WON') / COUNT(*))
                 END
            FROM "Opportunity"
           WHERE "companyId" = $1 AND stage IN ('WON','LOST'))
             AS "winRate"`,
      [companyId],
    );

    return rows[0];
  }
}
