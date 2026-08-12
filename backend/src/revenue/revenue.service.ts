import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Params } from '../database/sql';
import { AuditTrailService } from '../audit-log/audit-trail.service';
import { N8nService } from '../n8n/n8n.service';
import { PostingService } from '../accounting/posting.service';
import { receiptEntry } from '../accounting/posting-rules';

export type Receipt = Record<string, unknown> & { id: string; receiptNo: string };

export type CollectInput = {
  /** Subsystem record being paid for, e.g. 'MunicipalBill', 'BusinessLicense'. */
  entityType: string;
  entityId: string;
  amount: number;
  method?: string;
  /** Exactly one destination must be supplied. */
  cashBoxId?: string | null;
  treasuryAccountId?: string | null;
  payerName?: string | null;
  reference?: string | null;
  note?: string | null;
  userId?: string | null;
};

const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'CHEQUE', 'ONLINE', 'POS'];

/**
 * نقطهٔ واحد ثبت دریافت وجه برای همهٔ زیرسیستم‌ها.
 *
 * Every subsystem that collects money routes through here, so the cash
 * actually lands in a cash box or treasury account, the receipt is auditable,
 * and accounting can see the revenue.  Before this existed each subsystem just
 * flipped its own status to PAID and the money went nowhere.
 */
@Injectable()
export class RevenueService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditTrailService,
    private readonly n8n: N8nService,
    private readonly posting: PostingService,
  ) {}

  /**
   * Records a payment and credits its destination in one transaction: either
   * both happen or neither does.  The unique index on (entityType, entityId)
   * makes a double collection impossible even under a race.
   */
  async collect(companyId: string, input: CollectInput): Promise<Receipt> {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('مبلغ دریافتی باید بزرگ‌تر از صفر باشد');
    }

    const method = input.method ?? 'CASH';
    if (!PAYMENT_METHODS.includes(method)) {
      throw new BadRequestException(
        `روش پرداخت نامعتبر است. مقادیر مجاز: ${PAYMENT_METHODS.join(', ')}`,
      );
    }

    const toCashBox = Boolean(input.cashBoxId);
    const toTreasury = Boolean(input.treasuryAccountId);
    if (toCashBox === toTreasury) {
      throw new BadRequestException('مقصد وجه باید دقیقاً یکی از صندوق یا حساب خزانه باشد');
    }

    return this.db.transaction(async (tx) => {
      // Crediting first also proves the destination belongs to this company.
      const destination = toCashBox
        ? await tx.query<{ id: string }>(
            `UPDATE "CashBox" SET balance = balance + $1, "updatedAt" = now()
             WHERE id = $2 AND "companyId" = $3 RETURNING id`,
            [amount, input.cashBoxId, companyId],
          )
        : await tx.query<{ id: string }>(
            `UPDATE "TreasuryAccount" SET balance = balance + $1, "updatedAt" = now()
             WHERE id = $2 AND "companyId" = $3 RETURNING id`,
            [amount, input.treasuryAccountId, companyId],
          );

      if (!destination.rows[0]) {
        throw new NotFoundException(toCashBox ? 'صندوق یافت نشد' : 'حساب خزانه یافت نشد');
      }

      let created;
      try {
        created = await tx.query<Receipt>(
          `INSERT INTO "Receipt"
             (id, "companyId", "receiptNo", "entityType", "entityId", amount, method,
              "cashBoxId", "treasuryAccountId", "payerName", reference, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
          [
            randomUUID(),
            companyId,
            `RCP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            input.entityType,
            input.entityId,
            amount,
            method,
            input.cashBoxId ?? null,
            input.treasuryAccountId ?? null,
            input.payerName ?? null,
            input.reference ?? null,
            input.note ?? null,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException('برای این مورد قبلاً وجه دریافت شده است');
        }
        throw error;
      }

      const receipt = created.rows[0];

      await this.audit.recordIn(tx, companyId, {
        entity: input.entityType,
        entityId: input.entityId,
        action: 'PAID',
        userId: input.userId ?? null,
        newValue: { receiptNo: receipt.receiptNo, amount, method },
      });

      await this.posting.postAuto(tx, companyId, {
        sourceType: 'Receipt',
        sourceId: receipt.id,
        description: `رسید ${receipt.receiptNo} — ${input.entityType}`,
        userId: input.userId,
        lines: receiptEntry({
          amount,
          toCashBox,
          description: `دریافت بابت ${input.entityType}`,
        }),
      });

      return receipt;
    }).then(async (receipt) => {
      // Emitted after commit so automation never sees a rolled-back payment.
      await this.n8n.receiptCollected(receipt, companyId).catch(() => undefined);
      return receipt;
    });
  }

  /** The receipt for a given subsystem record, if it has been paid. */
  async findByEntity(
    companyId: string,
    entityType: string,
    entityId: string,
  ): Promise<Receipt | null> {
    const rows = await this.db.query<Receipt>(
      `SELECT * FROM "Receipt"
       WHERE "companyId" = $1 AND "entityType" = $2 AND "entityId" = $3`,
      [companyId, entityType, entityId],
    );
    return rows[0] ?? null;
  }

  async findAll(
    companyId: string,
    options?: { entityType?: string; from?: string; to?: string; limit?: number },
  ): Promise<Receipt[]> {
    const params = new Params();
    const conditions = [`r."companyId" = ${params.next(companyId)}`];
    if (options?.entityType) {
      conditions.push(`r."entityType" = ${params.next(options.entityType)}`);
    }
    if (options?.from) conditions.push(`r."paidAt" >= ${params.next(new Date(options.from))}`);
    if (options?.to) conditions.push(`r."paidAt" <= ${params.next(new Date(options.to))}`);

    const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 500) : 100;

    return this.db.query<Receipt>(
      `SELECT r.*, c.name AS "cashBoxName", a.name AS "treasuryAccountName"
       FROM "Receipt" r
       LEFT JOIN "CashBox" c ON c.id = r."cashBoxId"
       LEFT JOIN "TreasuryAccount" a ON a.id = r."treasuryAccountId"
       WHERE ${conditions.join(' AND ')}
       ORDER BY r."paidAt" DESC LIMIT ${params.next(limit)}`,
      params.values,
    );
  }

  /** Collected revenue grouped by subsystem — the figure accounting needs. */
  async stats(companyId: string, from?: string, to?: string) {
    const params = new Params();
    const conditions = [`"companyId" = ${params.next(companyId)}`];
    if (from) conditions.push(`"paidAt" >= ${params.next(new Date(from))}`);
    if (to) conditions.push(`"paidAt" <= ${params.next(new Date(to))}`);

    const rows = await this.db.query<{ entityType: string; count: string; amount: string }>(
      `SELECT "entityType", count(*)::text AS count, COALESCE(sum(amount), 0)::text AS amount
       FROM "Receipt" WHERE ${conditions.join(' AND ')} GROUP BY "entityType"`,
      params.values,
    );

    const byEntityType: Record<string, { count: number; amount: number }> = {};
    let total = 0;
    let totalAmount = 0;
    for (const row of rows) {
      const count = Number(row.count);
      const amount = Number(row.amount);
      byEntityType[row.entityType] = { count, amount };
      total += count;
      totalAmount += amount;
    }

    return { total, totalAmount, byEntityType };
  }
}
