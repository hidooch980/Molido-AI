import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { PostingService } from '../accounting/posting.service';
import { agentCommissionEntry } from '../accounting/posting-rules';

/**
 * ویزیتور / بازاریاب و کمیسیون فروش.
 *
 * `SalesAgent` نرخ کمیسیون و هدف ماهانه داشت ولی هیچ فاکتوری به ویزیتور
 * وصل نمی‌شد — نرخ ثبت می‌شد و هرگز روی چیزی اعمال نمی‌گشت.
 *
 * سه تصمیم:
 *
 * ۱. **کمیسیون روی فروش خالص** است، نه فروش ناخالص: مرجوعی کم می‌شود.
 *    وگرنه ویزیتور می‌تواند بفروشد، کمیسیون بگیرد، و بعد مرجوع کند.
 *
 * ۲. **نرخ در لحظهٔ محاسبه تثبیت می‌شود.**  اگر نرخ ویزیتور بعداً عوض شود،
 *    کمیسیون‌های گذشته نباید تغییر کنند — سند تاریخی باید معتبر بماند.
 *
 * ۳. **یک کمیسیون به ازای هر ویزیتور در هر دوره** با نمایهٔ یکتا، پس
 *    محاسبهٔ دوبارهٔ پایان ماه دو برابر پرداخت نمی‌سازد.
 */

type Row = Record<string, unknown>;

@Injectable()
export class SalesAgentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly posting: PostingService,
  ) {}

  async findAll(companyId: string) {
    return this.db.query<Row>(
      `SELECT a.*,
              (SELECT COUNT(*) FROM "Customer" c WHERE c."salesAgentId" = a.id)
                AS "customerCount",
              (SELECT COALESCE(SUM(s.total),0) FROM "Sale" s
                WHERE s."salesAgentId" = a.id
                  AND s.status NOT IN ('CANCELLED','DRAFT')
                  AND s."createdAt" >= date_trunc('month', now()))
                AS "monthSales"
         FROM "SalesAgent" a
        WHERE a."companyId" = $1
        ORDER BY a."agentNo"`,
      [companyId],
    );
  }

  async findOne(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      'SELECT * FROM "SalesAgent" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('ویزیتور یافت نشد');

    const commissions = await this.db.query<Row>(
      `SELECT * FROM "AgentCommission"
        WHERE "agentId" = $1 ORDER BY period DESC LIMIT 24`,
      [id],
    );

    return { ...rows[0], commissions };
  }

  async create(companyId: string, dto: Record<string, unknown>) {
    const agentNo =
      (dto.agentNo as string) ?? (await this.nextAgentNo(companyId));

    const rate = Number(dto.commissionRate ?? 0);
    if (rate < 0 || rate > 100) {
      throw new BadRequestException('نرخ کمیسیون باید بین ۰ تا ۱۰۰ درصد باشد');
    }

    const rows = await this.db.query<Row>(
      `INSERT INTO "SalesAgent"
         (id, "companyId", "agentNo", name, phone, territory, "commissionRate",
          "monthlyTarget", "nationalCode", "userId", "isActive")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) RETURNING *`,
      [
        randomUUID(),
        companyId,
        agentNo,
        dto.name,
        dto.phone ?? null,
        dto.territory ?? null,
        rate,
        dto.monthlyTarget ?? 0,
        dto.nationalCode ?? null,
        dto.userId ?? null,
      ],
    );

    return rows[0];
  }

  async update(companyId: string, id: string, dto: Record<string, unknown>) {
    const allowed = [
      'name',
      'phone',
      'territory',
      'commissionRate',
      'monthlyTarget',
      'nationalCode',
      'isActive',
    ];

    const sets: string[] = [];
    const values: unknown[] = [id, companyId];

    for (const key of allowed) {
      if (dto[key] === undefined) continue;
      values.push(dto[key]);
      sets.push(`"${key}" = $${values.length}`);
    }

    if (!sets.length) return this.findOne(companyId, id);

    const rows = await this.db.query<Row>(
      `UPDATE "SalesAgent" SET ${sets.join(', ')}, "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      values,
    );

    if (!rows[0]) throw new NotFoundException('ویزیتور یافت نشد');
    return rows[0];
  }

  private async nextAgentNo(companyId: string) {
    const rows = await this.db.query<{ n: string | null }>(
      `SELECT MAX(NULLIF(regexp_replace("agentNo", '\\D', '', 'g'), '')::bigint) AS n
         FROM "SalesAgent" WHERE "companyId" = $1`,
      [companyId],
    );
    return `AG-${String(Number(rows[0]?.n ?? 0) + 1).padStart(5, '0')}`;
  }

  // ---------------------------------------------------------- کمیسیون

  /**
   * محاسبهٔ کمیسیون یک دوره برای همهٔ ویزیتورهای فعال.
   *
   * تکرار برای همان دوره بی‌اثر است، مگر آنکه کمیسیون هنوز در وضعیت
   * `CALCULATED` باشد — در آن حالت بازمحاسبه می‌شود.  کمیسیونِ تأییدشده یا
   * پرداخت‌شده هرگز بازنویسی نمی‌شود.
   */
  async calculate(companyId: string, userId: string, period?: string) {
    const base = period ? new Date(period) : new Date();
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);

    const periodDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    return this.db.transaction(async (tx) => {
      const agents = await tx.query<{
        id: string;
        agentNo: string;
        name: string;
        commissionRate: string;
      }>(
        `SELECT id, "agentNo", name, "commissionRate" FROM "SalesAgent"
          WHERE "companyId" = $1 AND "isActive" = true`,
        [companyId],
      );

      const results: Array<Record<string, unknown>> = [];
      let totalCommission = 0;

      for (const agent of agents.rows) {
        const sales = await tx.query<{
          total: string;
          invoices: string;
        }>(
          `SELECT COALESCE(SUM(total),0) AS total, COUNT(*) AS invoices
             FROM "Sale"
            WHERE "companyId" = $1 AND "salesAgentId" = $2
              AND status NOT IN ('CANCELLED','DRAFT')
              AND "createdAt" >= $3::date AND "createdAt" < $4::date`,
          [companyId, agent.id, periodDate, endDate],
        );

        // مرجوعی همان دوره کم می‌شود، وگرنه می‌شود فروخت، کمیسیون گرفت و
        // بعد مرجوع کرد.
        const returns = await tx.query<{ total: string }>(
          `SELECT COALESCE(SUM(r."totalAmount"),0) AS total
             FROM "ProductReturn" r
             JOIN "Sale" s ON s.id = r."saleId"
            WHERE r."companyId" = $1 AND s."salesAgentId" = $2
              AND r.type = 'SALE' AND r.status = 'APPLIED'
              AND r."createdAt" >= $3::date AND r."createdAt" < $4::date`,
          [companyId, agent.id, periodDate, endDate],
        );

        const salesTotal = Number(sales.rows[0]?.total ?? 0);
        const returnTotal = Number(returns.rows[0]?.total ?? 0);
        const netSales = salesTotal - returnTotal;
        const rate = Number(agent.commissionRate ?? 0);
        const amount = Math.max(Math.round((netSales * rate) / 100), 0);

        if (netSales <= 0 && amount <= 0) continue;

        const saved = await tx.query<Row>(
          `INSERT INTO "AgentCommission"
             (id, "companyId", "agentId", period, "salesTotal", "returnTotal",
              "netSales", rate, amount, "invoiceCount", status)
           VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,'CALCULATED')
           ON CONFLICT ("agentId", period) DO UPDATE
             SET "salesTotal" = EXCLUDED."salesTotal",
                 "returnTotal" = EXCLUDED."returnTotal",
                 "netSales" = EXCLUDED."netSales",
                 rate = EXCLUDED.rate,
                 amount = EXCLUDED.amount,
                 "invoiceCount" = EXCLUDED."invoiceCount",
                 "updatedAt" = now()
             -- کمیسیون تأییدشده یا پرداخت‌شده بازنویسی نمی‌شود
             WHERE "AgentCommission".status = 'CALCULATED'
           RETURNING *`,
          [
            randomUUID(),
            companyId,
            agent.id,
            periodDate,
            salesTotal,
            returnTotal,
            netSales,
            rate,
            amount,
            Number(sales.rows[0]?.invoices ?? 0),
          ],
        );

        if (!saved.rows[0]) continue;

        totalCommission += amount;
        results.push({
          agentNo: agent.agentNo,
          name: agent.name,
          netSales,
          rate,
          amount,
        });
      }

      // یک سند برای کل دوره: هزینهٔ کمیسیون بدهکار، کمیسیون پرداختنی
      // بستانکار.  پرداخت واقعی بعداً از خزانه انجام می‌شود.
      //
      // محاسبهٔ دوباره در همان دوره — که پس از ثبت فروش‌های تازه لازم است —
      // نباید سند دوم بزند.  سند قبلی معکوس می‌شود و سند تازه با مبلغ
      // به‌روز صادر می‌گردد؛ همان الگویی که در لغو فاکتور و مرجوعی هم هست.
      // سند اصلی حذف نمی‌شود تا رد حسابرسی بماند.
      if (totalCommission > 0) {
        await this.posting.reverseBySourceIn(
          tx,
          companyId,
          'AgentCommission',
          periodDate,
        );

        await this.posting.postAuto(tx, companyId, {
          sourceType: 'AgentCommission',
          sourceId: periodDate,
          description: `کمیسیون فروش دورهٔ ${periodDate.slice(0, 7)}`,
          userId,
          entryDate: new Date(endDate),
          lines: agentCommissionEntry(totalCommission),
        });
      }

      return {
        period: periodDate,
        count: results.length,
        total: totalCommission,
        agents: results,
      };
    });
  }

  async markPaid(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      `UPDATE "AgentCommission"
          SET status = 'PAID', "paidAt" = now(), "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2 AND status IN ('CALCULATED','APPROVED')
        RETURNING *`,
      [id, companyId],
    );

    if (!rows[0]) {
      throw new BadRequestException('کمیسیون یافت نشد یا قبلاً پرداخت شده است');
    }
    return rows[0];
  }

  async commissions(companyId: string, period?: string) {
    const values: unknown[] = [companyId];
    let filter = '';

    if (period) {
      values.push(period);
      filter = ` AND c.period = $${values.length}::date`;
    }

    return this.db.query<Row>(
      `SELECT c.*, a.name AS "agentName", a."agentNo"
         FROM "AgentCommission" c
         JOIN "SalesAgent" a ON a.id = c."agentId"
        WHERE c."companyId" = $1${filter}
        ORDER BY c.period DESC, a."agentNo"
        LIMIT 200`,
      values,
    );
  }

  async stats(companyId: string) {
    const rows = await this.db.query<Row>(
      `SELECT
         (SELECT COUNT(*) FROM "SalesAgent"
           WHERE "companyId" = $1 AND "isActive" = true) AS "activeAgents",
         (SELECT COALESCE(SUM(total),0) FROM "Sale"
           WHERE "companyId" = $1 AND "salesAgentId" IS NOT NULL
             AND status NOT IN ('CANCELLED','DRAFT')
             AND "createdAt" >= date_trunc('month', now())) AS "monthSales",
         (SELECT COALESCE(SUM(amount),0) FROM "AgentCommission"
           WHERE "companyId" = $1 AND status <> 'CANCELLED') AS "totalCommission",
         (SELECT COALESCE(SUM(amount),0) FROM "AgentCommission"
           WHERE "companyId" = $1 AND status IN ('CALCULATED','APPROVED'))
             AS "unpaidCommission"`,
      [companyId],
    );

    return rows[0];
  }
}
