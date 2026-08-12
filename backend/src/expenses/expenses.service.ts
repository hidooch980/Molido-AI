import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PostingService } from '../accounting/posting.service';
import { expenseEntry } from '../accounting/posting-rules';

type Expense = Record<string, unknown> & { id: string };

const WRITABLE = ['title', 'amount', 'status', 'note'] as const;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly posting: PostingService,
  ) {}

  async findAll(companyId: string, options?: { status?: string; from?: string; to?: string }) {
    const values: unknown[] = [companyId];
    const conditions = ['"companyId" = $1'];
    if (options?.status) {
      values.push(options.status);
      conditions.push(`status = $${values.length}`);
    }
    if (options?.from) {
      values.push(new Date(options.from));
      conditions.push(`"createdAt" >= $${values.length}`);
    }
    if (options?.to) {
      values.push(new Date(options.to));
      conditions.push(`"createdAt" <= $${values.length}`);
    }
    return this.db.query<Expense>(
      `SELECT * FROM "Expense" WHERE ${conditions.join(' AND ')} ORDER BY "createdAt" DESC`,
      values,
    );
  }

  async findOne(id: string, companyId: string) {
    const expenses = await this.db.query<Expense>(
      'SELECT * FROM "Expense" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!expenses[0]) throw new NotFoundException('هزینه یافت نشد');
    return expenses[0];
  }

  async create(
    companyId: string,
    data: { title: string; amount: number; status?: string; note?: string },
  ) {
    const status = data.status ?? 'DRAFT';

    return this.db.transaction(async (tx) => {
      const created = await tx.query<Expense>(
        `INSERT INTO "Expense" (id, "companyId", title, amount, status, note)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [randomUUID(), companyId, data.title, data.amount, status, data.note ?? null],
      );
      const expense = created.rows[0];

      // هزینهٔ پیش‌نویس هنوز قطعی نیست و سند نمی‌خورد؛ سند هنگام تأیید یا
      // پرداخت صادر می‌شود.
      if (status !== 'DRAFT') {
        await this.posting.postAuto(tx, companyId, {
          sourceType: 'Expense',
          sourceId: expense.id,
          description: data.title,
          lines: expenseEntry({ amount: Number(data.amount), paid: status === 'PAID' }),
        });
      }

      return expense;
    });
  }

  async update(
    id: string,
    companyId: string,
    data: { title?: string; amount?: number; status?: string; note?: string },
  ) {
    await this.findOne(id, companyId);

    const values: unknown[] = [];
    const assignments = WRITABLE.filter((column) => data[column] !== undefined).map((column) => {
      values.push(data[column]);
      return `"${column}" = $${values.length}`;
    });
    if (!assignments.length) return this.findOne(id, companyId);

    values.push(id);
    const expenses = await this.db.query<Expense>(
      `UPDATE "Expense" SET ${assignments.join(', ')}, "updatedAt" = now()
       WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return expenses[0];
  }

  async remove(id: string, companyId: string) {
    const expense = await this.findOne(id, companyId);
    await this.db.execute('DELETE FROM "Expense" WHERE id = $1', [id]);
    return expense;
  }
}
