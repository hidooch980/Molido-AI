import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Params, setClause } from '../database/sql';

type Contract = Record<string, unknown> & { id: string };
type ContractPayment = Record<string, unknown> & { id: string };

const WRITABLE = [
  'title',
  'type',
  'partyName',
  'partyPhone',
  'partyNationalId',
  'amount',
  'startDate',
  'endDate',
  'description',
] as const;

function inDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

/** Turns the DTO's date strings into values pg can bind. */
function withDates(data: object): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...data };
  for (const key of ['startDate', 'endDate'] as const) {
    if (payload[key] !== undefined) {
      payload[key] = payload[key] ? new Date(payload[key] as string) : null;
    }
  }
  return payload;
}

@Injectable()
export class ContractsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(
    companyId: string,
    options?: { status?: string; type?: string; search?: string; expiringSoon?: boolean },
  ) {
    const params = new Params();
    const conditions = [`"companyId" = ${params.next(companyId)}`];
    if (options?.status) conditions.push(`status = ${params.next(options.status)}`);
    if (options?.type) conditions.push(`type = ${params.next(options.type)}`);
    if (options?.search) {
      const term = params.next(`%${options.search}%`);
      conditions.push(
        `(title ILIKE ${term} OR "partyName" ILIKE ${term} OR "contractNo" ILIKE ${term})`,
      );
    }
    if (options?.expiringSoon) {
      conditions.push(`"endDate" <= ${params.next(inDays(30))}`);
      conditions.push(`status = 'ACTIVE'`);
    }

    const contracts = await this.db.query<Contract>(
      `SELECT * FROM "Contract" WHERE ${conditions.join(' AND ')} ORDER BY "createdAt" DESC`,
      params.values,
    );
    if (!contracts.length) return contracts;

    const payments = await this.db.query<ContractPayment & { contractId: string }>(
      'SELECT id, "contractId", status, amount FROM "ContractPayment" WHERE "contractId" = ANY($1)',
      [contracts.map((contract) => contract.id)],
    );
    return contracts.map((contract) => ({
      ...contract,
      payments: payments.filter((payment) => payment.contractId === contract.id),
    }));
  }

  async findOne(id: string, companyId: string) {
    const contracts = await this.db.query<Contract>(
      'SELECT * FROM "Contract" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!contracts[0]) throw new NotFoundException('قرارداد یافت نشد');

    const payments = await this.db.query<ContractPayment>(
      'SELECT * FROM "ContractPayment" WHERE "contractId" = $1 ORDER BY "dueDate" ASC',
      [id],
    );
    return { ...contracts[0], payments };
  }

  async create(
    companyId: string,
    data: {
      contractNo: string;
      title: string;
      type?: string;
      partyName: string;
      partyPhone?: string;
      partyNationalId?: string;
      amount?: number;
      startDate?: string;
      endDate?: string;
      description?: string;
    },
  ) {
    // ⚠️ حتماً محدود به شرکت.
    //
    // نسخهٔ اول `companyId` نداشت: شرکتی که قرارداد «۱۰۰۱» می‌ساخت،
    // همان شماره را برای همهٔ شرکت‌های دیگر می‌بست — و پیام «شماره
    // قرارداد تکراری است» دربارهٔ رکوردی بود که کاربر حق دیدنش را
    // نداشت، یعنی خودش نشت اطلاعات بود.
    const existing = await this.db.query<{ id: string }>(
      'SELECT id FROM "Contract" WHERE "contractNo" = $1 AND "companyId" = $2',
      [data.contractNo, companyId],
    );
    if (existing[0]) throw new BadRequestException('شماره قرارداد تکراری است');

    const rows = await this.db.query<Contract>(
      `INSERT INTO "Contract"
         (id, "companyId", "contractNo", title, type, "partyName", "partyPhone",
          "partyNationalId", amount, "startDate", "endDate", description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        randomUUID(),
        companyId,
        data.contractNo,
        data.title,
        data.type ?? 'SERVICE',
        data.partyName,
        data.partyPhone ?? null,
        data.partyNationalId ?? null,
        data.amount ?? 0,
        data.startDate ? new Date(data.startDate) : null,
        data.endDate ? new Date(data.endDate) : null,
        data.description ?? null,
      ],
    );
    return rows[0];
  }

  async update(id: string, companyId: string, data: object) {
    await this.findOne(id, companyId);

    const params = new Params();
    const assignments = setClause(WRITABLE, withDates(data), params);
    if (!assignments) return this.findOne(id, companyId);

    const rows = await this.db.query<Contract>(
      `UPDATE "Contract" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  async updateStatus(id: string, companyId: string, status: string) {
    await this.findOne(id, companyId);
    const rows = await this.db.query<Contract>(
      'UPDATE "Contract" SET status = $1, "updatedAt" = now() WHERE id = $2 RETURNING *',
      [status, id],
    );
    return rows[0];
  }

  // ---------- اقساط/پرداخت‌های قرارداد ----------

  async addPayment(
    contractId: string,
    companyId: string,
    data: { amount: number; dueDate: string; note?: string },
  ) {
    await this.findOne(contractId, companyId);

    const rows = await this.db.query<ContractPayment>(
      `INSERT INTO "ContractPayment" (id, "contractId", amount, "dueDate", note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [randomUUID(), contractId, data.amount, new Date(data.dueDate), data.note ?? null],
    );
    return rows[0];
  }

  async payPayment(paymentId: string, companyId: string) {
    const rows = await this.db.query<ContractPayment>(
      `UPDATE "ContractPayment" SET status = 'PAID', "paidAt" = now()
       WHERE id = $1 AND "contractId" IN (SELECT id FROM "Contract" WHERE "companyId" = $2)
       RETURNING *`,
      [paymentId, companyId],
    );
    if (!rows[0]) throw new NotFoundException('قسط قرارداد یافت نشد');
    return rows[0];
  }

  // ---------- آمار ----------

  async stats(companyId: string) {
    const rows = await this.db.query<{ status: string; count: string; amount: string }>(
      `SELECT status, count(*)::text AS count, COALESCE(sum(amount), 0)::text AS amount
       FROM "Contract" WHERE "companyId" = $1 GROUP BY status`,
      [companyId],
    );

    const byStatus: Record<string, number> = {};
    let total = 0;
    let totalAmount = 0;
    for (const row of rows) {
      byStatus[row.status] = Number(row.count);
      total += Number(row.count);
      totalAmount += Number(row.amount);
    }

    const expiring = await this.db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "Contract"
       WHERE "companyId" = $1 AND status = 'ACTIVE' AND "endDate" IS NOT NULL AND "endDate" <= $2`,
      [companyId, inDays(30)],
    );

    return {
      total,
      byStatus,
      totalAmount,
      expiringSoon: Number(expiring[0]?.count ?? 0),
    };
  }
}
