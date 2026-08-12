import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Params } from '../database/sql';

type Cheque = Record<string, unknown> & { id: string; status: string };

const STATUS_TRANSITIONS: Record<string, Array<string>> = {
  REGISTERED: ['DEPOSITED', 'RETURNED'],
  DEPOSITED: ['CLEARED', 'BOUNCED'],
  CLEARED: [],
  BOUNCED: ['DEPOSITED', 'RETURNED'],
  RETURNED: [],
};

const OPEN_STATUSES = ['REGISTERED', 'DEPOSITED'];

function inDays(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

@Injectable()
export class ChequesService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(
    companyId: string,
    options?: { status?: string; type?: string; dueSoon?: boolean },
  ) {
    const params = new Params();
    const conditions = [`c."companyId" = ${params.next(companyId)}`];
    if (options?.status) conditions.push(`c.status = ${params.next(options.status)}`);
    if (options?.type) conditions.push(`c.type = ${params.next(options.type)}`);
    if (options?.dueSoon) {
      conditions.push(`c."dueDate" <= ${params.next(inDays(7))}`);
      conditions.push(`c.status = ANY(${params.next(OPEN_STATUSES)})`);
    }
    return this.db.query<Cheque>(
      `SELECT c.*, s."invoiceNo" FROM "Cheque" c
       LEFT JOIN "Sale" s ON s.id = c."saleId"
       WHERE ${conditions.join(' AND ')} ORDER BY c."dueDate" ASC`,
      params.values,
    );
  }

  async findOne(id: string, companyId: string) {
    const rows = await this.db.query<Cheque>(
      `SELECT c.*, s."invoiceNo", s.total AS "saleTotal" FROM "Cheque" c
       LEFT JOIN "Sale" s ON s.id = c."saleId"
       WHERE c.id = $1 AND c."companyId" = $2`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('چک یافت نشد');
    return rows[0];
  }

  async create(
    companyId: string,
    data: {
      chequeNo: string;
      bankName?: string;
      dueDate: string;
      amount: number;
      type?: string;
      ownerName?: string;
      note?: string;
      saleId?: string;
    },
  ) {
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('مبلغ چک باید بزرگ‌تر از صفر باشد');
    }

    if (data.saleId) {
      const sales = await this.db.query<{ id: string }>(
        'SELECT id FROM "Sale" WHERE id = $1 AND "companyId" = $2',
        [data.saleId, companyId],
      );
      if (!sales[0]) throw new NotFoundException('فاکتور مرتبط یافت نشد');
    }

    const rows = await this.db.query<Cheque>(
      `INSERT INTO "Cheque"
         (id, "companyId", "chequeNo", "bankName", "dueDate", amount, type, status, "ownerName", note, "saleId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'REGISTERED', $8, $9, $10) RETURNING *`,
      [
        randomUUID(),
        companyId,
        data.chequeNo,
        data.bankName ?? null,
        new Date(data.dueDate),
        data.amount,
        data.type ?? 'RECEIVED',
        data.ownerName ?? null,
        data.note ?? null,
        data.saleId ?? null,
      ],
    );
    return rows[0];
  }

  /** تغییر وضعیت چک: ثبت‌شده ← واگذار/خوابانده ← وصول یا برگشتی */
  async updateStatus(id: string, companyId: string, status: string) {
    const cheque = await this.findOne(id, companyId);

    const allowed = STATUS_TRANSITIONS[cheque.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `تغییر وضعیت از ${cheque.status} به ${status} مجاز نیست`,
      );
    }

    const rows = await this.db.query<Cheque>(
      'UPDATE "Cheque" SET status = $1, "updatedAt" = now() WHERE id = $2 RETURNING *',
      [status, id],
    );
    return rows[0];
  }

  async remove(id: string, companyId: string) {
    const cheque = await this.findOne(id, companyId);
    await this.db.execute('DELETE FROM "Cheque" WHERE id = $1', [id]);
    return cheque;
  }

  async stats(companyId: string) {
    const rows = await this.db.query<{
      total: string;
      open_count: string;
      open_amount: string;
      due_soon: string;
      overdue: string;
      bounced: string;
      cleared: string;
    }>(
      `SELECT
         count(*)::text AS total,
         count(*) FILTER (WHERE status = ANY($2))::text AS open_count,
         COALESCE(sum(amount) FILTER (WHERE status = ANY($2)), 0)::text AS open_amount,
         count(*) FILTER (WHERE status = ANY($2) AND "dueDate" BETWEEN now() AND $3)::text AS due_soon,
         count(*) FILTER (WHERE status = ANY($2) AND "dueDate" < now())::text AS overdue,
         count(*) FILTER (WHERE status = 'BOUNCED')::text AS bounced,
         count(*) FILTER (WHERE status = 'CLEARED')::text AS cleared
       FROM "Cheque" WHERE "companyId" = $1`,
      [companyId, OPEN_STATUSES, inDays(7)],
    );

    const row = rows[0];
    return {
      total: Number(row?.total ?? 0),
      openCount: Number(row?.open_count ?? 0),
      openAmount: Number(row?.open_amount ?? 0),
      dueSoon: Number(row?.due_soon ?? 0),
      overdue: Number(row?.overdue ?? 0),
      bounced: Number(row?.bounced ?? 0),
      cleared: Number(row?.cleared ?? 0),
    };
  }
}
