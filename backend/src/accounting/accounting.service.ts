import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Params, setClause } from '../database/sql';
import { parseDate } from '../common/date';

type Account = Record<string, unknown> & { id: string };

const ACCOUNT_WRITABLE = ['name', 'code', 'type', 'isActive'] as const;

/** Statuses excluded from turnover, on both the sales and purchase sides. */
const IGNORED_STATUSES = ['CANCELLED', 'DRAFT'];

@Injectable()
export class AccountingService {
  constructor(private readonly db: DatabaseService) {}

  async findAllAccounts(companyId: string) {
    return this.db.query<Account>(
      'SELECT * FROM "Account" WHERE "companyId" = $1 ORDER BY code ASC',
      [companyId],
    );
  }

  async findAccount(id: string, companyId: string) {
    const rows = await this.db.query<Account>(
      'SELECT * FROM "Account" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('حساب یافت نشد');
    return rows[0];
  }

  async createAccount(
    companyId: string,
    data: { name: string; code: string; type: string; balance?: number },
  ) {
    const rows = await this.db.query<Account>(
      `INSERT INTO "Account" (id, "companyId", name, code, type, balance)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [randomUUID(), companyId, data.name, data.code, data.type, data.balance ?? 0],
    );
    return rows[0];
  }

  async updateAccount(id: string, companyId: string, data: object) {
    await this.findAccount(id, companyId);

    const params = new Params();
    const assignments = setClause(ACCOUNT_WRITABLE, data, params);
    if (!assignments) return this.findAccount(id, companyId);

    const rows = await this.db.query<Account>(
      `UPDATE "Account" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  async removeAccount(id: string, companyId: string) {
    const account = await this.findAccount(id, companyId);
    await this.db.execute('DELETE FROM "Account" WHERE id = $1', [id]);
    return account;
  }

  /** تراز مالی ساده: درآمد، هزینه و سود */
  async summary(companyId: string, from?: string, to?: string) {
    const range = (params: Params, alias: string): string => {
      const parts: string[] = [];
      if (from) parts.push(`AND ${alias}."createdAt" >= ${params.next(parseDate(from, "از تاریخ"))}`);
      if (to) parts.push(`AND ${alias}."createdAt" <= ${params.next(parseDate(to, "تا تاریخ"))}`);
      return parts.join(' ');
    };

    const totalOf = async (table: string, column: string, statusClause: string) => {
      const params = new Params();
      const companyParam = params.next(companyId);
      const filter = statusClause.includes('$STATUSES')
        ? statusClause.replace('$STATUSES', params.next(IGNORED_STATUSES))
        : statusClause;
      const dates = range(params, 't');
      const rows = await this.db.query<{ sum: string }>(
        `SELECT COALESCE(sum(t."${column}"), 0)::text AS sum FROM "${table}" t
         WHERE t."companyId" = ${companyParam} ${filter} ${dates}`,
        params.values,
      );
      return Number(rows[0]?.sum ?? 0);
    };

    const [totalSales, totalPurchases, totalExpenses, otherRevenue] = await Promise.all([
      totalOf('Sale', 'total', 'AND NOT (t.status = ANY($STATUSES))'),
      totalOf('Purchase', 'total', 'AND NOT (t.status = ANY($STATUSES))'),
      totalOf('Expense', 'amount', `AND t.status = 'PAID'`),
      this.receiptsTotal(from, to, companyId),
    ]);

    return {
      totalSales,
      totalPurchases,
      totalExpenses,
      // درآمد زیرسیستم‌های غیرفروشی: عوارض، جواز کسب، پارکینگ، آرامستان و ...
      otherRevenue: otherRevenue.total,
      otherRevenueByType: otherRevenue.byEntityType,
      totalRevenue: totalSales + otherRevenue.total,
      grossProfit: totalSales - totalPurchases,
      netProfit: totalSales + otherRevenue.total - totalPurchases - totalExpenses,
    };
  }

  /** Revenue collected through the shared Receipt layer, split by subsystem. */
  private async receiptsTotal(
    from: string | undefined,
    to: string | undefined,
    companyId: string,
  ): Promise<{ total: number; byEntityType: Record<string, number> }> {
    const params = new Params();
    const conditions = [`"companyId" = ${params.next(companyId)}`];
    if (from) conditions.push(`"paidAt" >= ${params.next(parseDate(from, "از تاریخ"))}`);
    if (to) conditions.push(`"paidAt" <= ${params.next(parseDate(to, "تا تاریخ"))}`);

    const rows = await this.db.query<{ entityType: string; amount: string }>(
      `SELECT "entityType", COALESCE(sum(amount), 0)::text AS amount
       FROM "Receipt" WHERE ${conditions.join(' AND ')} GROUP BY "entityType"`,
      params.values,
    );

    const byEntityType: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      const amount = Number(row.amount);
      byEntityType[row.entityType] = amount;
      total += amount;
    }
    return { total, byEntityType };
  }
}
