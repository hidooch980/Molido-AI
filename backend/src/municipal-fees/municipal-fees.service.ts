import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Params } from '../database/sql';
import { AuditTrailService } from '../audit-log/audit-trail.service';
import { N8nService } from '../n8n/n8n.service';
import { RevenueService } from '../revenue/revenue.service';

type Bill = Record<string, unknown> & { id: string; status: string; amount: string };

/** Subsystem key used on the shared Receipt record. */
const ENTITY_TYPE = 'MunicipalBill';

@Injectable()
export class MunicipalFeesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly revenue: RevenueService,
    private readonly audit: AuditTrailService,
    private readonly n8n: N8nService,
  ) {}

  async findAll(
    companyId: string,
    options?: { status?: string; type?: string; search?: string },
  ) {
    const params = new Params();
    const conditions = [`b."companyId" = ${params.next(companyId)}`];
    if (options?.status) conditions.push(`b.status = ${params.next(options.status)}`);
    if (options?.type) conditions.push(`b.type = ${params.next(options.type)}`);
    if (options?.search) {
      const term = params.next(`%${options.search}%`);
      conditions.push(
        `(b."payerName" ILIKE ${term} OR b."billNo" ILIKE ${term} OR b.address ILIKE ${term})`,
      );
    }

    return this.db.query<Bill>(
      `SELECT b.*, p."permitNo", p."ownerName" AS "permitOwnerName"
       FROM "MunicipalBill" b
       LEFT JOIN "BuildingPermit" p ON p.id = b."permitId"
       WHERE ${conditions.join(' AND ')} ORDER BY b."createdAt" DESC`,
      params.values,
    );
  }

  async findOne(id: string, companyId: string): Promise<Bill & { permit: unknown }> {
    const rows = await this.db.query<Bill>(
      'SELECT * FROM "MunicipalBill" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('فیش عوارض یافت نشد');

    const permits = rows[0].permitId
      ? await this.db.query('SELECT * FROM "BuildingPermit" WHERE id = $1', [rows[0].permitId])
      : [];
    return { ...rows[0], permit: permits[0] ?? null };
  }

  /** صدور فیش عوارض (نوسازی، کسب، عوارض پروانه، جریمه، سایر) */
  async create(
    companyId: string,
    data: {
      type?: string;
      payerName: string;
      payerPhone?: string;
      address?: string;
      amount: number;
      description?: string;
      permitId?: string;
    },
  ) {
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('مبلغ فیش باید بزرگ‌تر از صفر باشد');
    }

    if (data.permitId) {
      const permits = await this.db.query<{ id: string }>(
        'SELECT id FROM "BuildingPermit" WHERE id = $1 AND "companyId" = $2',
        [data.permitId, companyId],
      );
      if (!permits[0]) throw new NotFoundException('پروانه مرتبط یافت نشد');
    }

    return this.insertBill(companyId, {
      type: data.type ?? 'OTHER',
      payerName: data.payerName,
      payerPhone: data.payerPhone ?? null,
      address: data.address ?? null,
      amount: data.amount,
      description: data.description ?? null,
      permitId: data.permitId ?? null,
    });
  }

  /** صدور خودکار فیش جریمه از پرونده تخلف ساختمانی (ماده ۱۰۰) */
  async createFromViolation(violationId: string, companyId: string) {
    const violations = await this.db.query<{
      caseNo: string;
      ownerName: string;
      address: string | null;
      status: string;
      fineAmount: string | null;
    }>('SELECT * FROM "BuildingViolation" WHERE id = $1 AND "companyId" = $2', [
      violationId,
      companyId,
    ]);
    const violation = violations[0];
    if (!violation) throw new NotFoundException('پرونده تخلف یافت نشد');

    const fine = Number(violation.fineAmount ?? 0);
    if (violation.status !== 'FINED' || fine <= 0) {
      throw new BadRequestException('برای این پرونده جریمه‌ای ثبت نشده است');
    }

    return this.insertBill(companyId, {
      type: 'VIOLATION_FINE',
      payerName: violation.ownerName,
      payerPhone: null,
      address: violation.address,
      amount: fine,
      description: `جریمه پرونده تخلف ${violation.caseNo}`,
      permitId: null,
    });
  }

  /** Shared insert for both issuing paths; emits the creation event once. */
  private async insertBill(companyId: string, data: Record<string, unknown>) {
    const rows = await this.db.query<Bill>(
      `INSERT INTO "MunicipalBill"
         (id, "companyId", "billNo", type, status, "payerName", "payerPhone", address,
          amount, description, "permitId")
       VALUES ($1, $2, $3, $4, 'UNPAID', $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        randomUUID(),
        companyId,
        `MB-${Date.now()}`,
        data.type,
        data.payerName,
        data.payerPhone,
        data.address,
        data.amount,
        data.description,
        data.permitId,
      ],
    );

    const bill = rows[0];
    await this.n8n.municipalBillCreated(bill, companyId).catch(() => undefined);
    return bill;
  }

  /**
   * وصول فیش عوارض.
   *
   * وجه از طریق RevenueService وارد صندوق یا حساب خزانه می‌شود، رسید صادر
   * می‌گردد و رویداد به اتوماسیون می‌رود.  پیش از این، این متد فقط وضعیت را
   * عوض می‌کرد و پول هیچ‌جا ثبت نمی‌شد.
   */
  async pay(
    id: string,
    companyId: string,
    payment: {
      cashBoxId?: string;
      treasuryAccountId?: string;
      method?: string;
      reference?: string;
      userId?: string;
    } = {},
  ) {
    const bill = await this.findOne(id, companyId);
    if (bill.status === 'PAID') throw new BadRequestException('این فیش قبلاً پرداخت شده است');
    if (bill.status === 'CANCELLED') {
      throw new BadRequestException('فیش لغوشده قابل پرداخت نیست');
    }

    // The receipt is written first: its unique (entityType, entityId) index is
    // what actually prevents a double collection, and if crediting the cash box
    // fails the bill must stay unpaid.
    const receipt = await this.revenue.collect(companyId, {
      entityType: ENTITY_TYPE,
      entityId: id,
      amount: Number(bill.amount),
      method: payment.method,
      cashBoxId: payment.cashBoxId,
      treasuryAccountId: payment.treasuryAccountId,
      payerName: (bill.payerName as string) ?? null,
      reference: payment.reference ?? (bill.billNo as string),
      userId: payment.userId,
    });

    const rows = await this.db.query<Bill>(
      `UPDATE "MunicipalBill" SET status = 'PAID', "paidAt" = now(), "updatedAt" = now()
       WHERE id = $1 RETURNING *`,
      [id],
    );

    return { ...rows[0], receipt };
  }

  async cancel(id: string, companyId: string, userId?: string) {
    const bill = await this.findOne(id, companyId);
    if (bill.status === 'PAID') {
      throw new BadRequestException('فیش پرداخت‌شده قابل لغو نیست');
    }

    const rows = await this.db.query<Bill>(
      `UPDATE "MunicipalBill" SET status = 'CANCELLED', "updatedAt" = now()
       WHERE id = $1 RETURNING *`,
      [id],
    );

    await this.audit.record(companyId, {
      entity: ENTITY_TYPE,
      entityId: id,
      action: 'CANCELLED',
      userId,
      oldValue: { status: bill.status },
      newValue: { status: 'CANCELLED' },
    });

    return rows[0];
  }

  async stats(companyId: string) {
    const rows = await this.db.query<{
      type: string;
      status: string;
      count: string;
      amount: string;
    }>(
      `SELECT type, status, count(*)::text AS count, COALESCE(sum(amount), 0)::text AS amount
       FROM "MunicipalBill" WHERE "companyId" = $1 GROUP BY type, status`,
      [companyId],
    );

    const byType: Record<string, { count: number; amount: number }> = {};
    let total = 0;
    let unpaidCount = 0;
    let paidCount = 0;
    let unpaidAmount = 0;
    let collectedAmount = 0;

    for (const row of rows) {
      const count = Number(row.count);
      const amount = Number(row.amount);
      total += count;

      byType[row.type] = byType[row.type] ?? { count: 0, amount: 0 };
      byType[row.type].count += count;
      byType[row.type].amount += amount;

      if (row.status === 'UNPAID') {
        unpaidCount += count;
        unpaidAmount += amount;
      } else if (row.status === 'PAID') {
        paidCount += count;
        collectedAmount += amount;
      }
    }

    return { total, unpaidCount, paidCount, unpaidAmount, collectedAmount, byType };
  }
}
