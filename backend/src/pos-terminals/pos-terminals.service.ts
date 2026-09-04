import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Params, setClause } from '../database/sql';

/**
 * فهرست بانک‌های ایران برای انتخاب در فرم ثبت کارت‌خوان
 */
const IRANIAN_BANKS = [
  'بانک ملی ایران',
  'بانک سپه',
  'بانک ملت',
  'بانک تجارت',
  'بانک صادرات ایران',
  'بانک کشاورزی',
  'بانک مسکن',
  'بانک رفاه کارگران',
  'پست بانک',
  'بانک اقتصاد نوین',
  'بانک پارسیان',
  'بانک پاسارگاد',
  'بانک سامان',
  'بانک سینا',
  'بانک آینده',
  'بانک شهر',
  'بانک دی',
  'بانک رسالت',
  'بانک توسعه تعاون',
  'بانک کارآفرین',
  'بانک ایران زمین',
  'بانک سرمایه',
  'بانک گردشگری',
  'بانک خاورمیانه',
  'بانک ملل',
  'بانک مهر ایران',
  'بانک صنعت و معدن',
  'بانک توسعه صادرات',
];

/**
 * شرکت‌های پرداخت (PSP) دارنده مجوز شاپرک
 */
const PSP_PROVIDERS = [
  'به‌پرداخت ملت',
  'پرداخت الکترونیک سداد',
  'سامان کیش',
  'آسان پرداخت پرشین',
  'ایران کیش',
  'پرداخت نوین آرین',
  'تجارت الکترونیک پارسیان',
  'پرداخت الکترونیک پاسارگاد',
  'فن آوا کارت',
  'سایان کارت',
  'مبنا کارت آریا',
  'الکترونیک کارت دماوند',
];

const POS_STATUSES = ['ACTIVE', 'INACTIVE', 'UNDER_REPAIR', 'RETURNED'];
const POS_TYPES = ['FIXED', 'MOBILE'];

type Terminal = Record<string, unknown> & { id: string };

const WRITABLE = [
  'serialNo',
  'merchantId',
  'bankName',
  'pspName',
  'type',
  'accountNo',
  'iban',
  'holderName',
  'location',
  'simNumber',
  'cashBoxId',
  'installedAt',
  'note',
] as const;

const WITH_CASHBOX = `
  SELECT t.*, b.name AS "cashBoxName", b.code AS "cashBoxCode"
  FROM "PosTerminal" t LEFT JOIN "CashBox" b ON b.id = t."cashBoxId"
`;

@Injectable()
export class PosTerminalsService {
  constructor(private readonly db: DatabaseService) {}

  banks() {
    return { banks: IRANIAN_BANKS, psps: PSP_PROVIDERS };
  }

  async findAll(
    companyId: string,
    options?: { type?: string; status?: string; bankName?: string; search?: string },
  ) {
    const params = new Params();
    const conditions = [`t."companyId" = ${params.next(companyId)}`];
    if (options?.type) conditions.push(`t.type = ${params.next(options.type)}`);
    if (options?.status) conditions.push(`t.status = ${params.next(options.status)}`);
    if (options?.bankName) {
      conditions.push(`t."bankName" ILIKE ${params.next(`%${options.bankName}%`)}`);
    }
    if (options?.search) {
      const term = params.next(`%${options.search}%`);
      conditions.push(
        `(t."terminalNo" ILIKE ${term} OR t."serialNo" ILIKE ${term}
          OR t."merchantId" ILIKE ${term} OR t."holderName" ILIKE ${term}
          OR t.location ILIKE ${term})`,
      );
    }

    return this.db.query<Terminal>(
      `${WITH_CASHBOX} WHERE ${conditions.join(' AND ')} ORDER BY t."createdAt" DESC`,
      params.values,
    );
  }

  async findOne(id: string, companyId: string) {
    const rows = await this.db.query<Terminal>(
      `${WITH_CASHBOX} WHERE t.id = $1 AND t."companyId" = $2`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('کارت‌خوان یافت نشد');
    return rows[0];
  }

  async create(
    companyId: string,
    data: {
      terminalNo: string;
      serialNo?: string;
      merchantId?: string;
      bankName: string;
      pspName?: string;
      type?: string;
      accountNo?: string;
      iban?: string;
      holderName?: string;
      location?: string;
      simNumber?: string;
      cashBoxId?: string;
      installedAt?: string;
      note?: string;
    },
  ) {
    if (!data.terminalNo) throw new BadRequestException('شماره پایانه (ترمینال) الزامی است');
    if (!data.bankName) throw new BadRequestException('نام بانک الزامی است');
    this.assertType(data.type);

    const existing = await this.db.query<{ id: string }>(
      'SELECT id FROM "PosTerminal" WHERE "terminalNo" = $1',
      [data.terminalNo],
    );
    if (existing[0]) {
      throw new ConflictException('کارت‌خوانی با این شماره پایانه قبلاً ثبت شده است');
    }

    await this.assertCashBox(data.cashBoxId, companyId);

    const rows = await this.db.query<Terminal>(
      `INSERT INTO "PosTerminal"
         (id, "companyId", "terminalNo", "serialNo", "merchantId", "bankName", "pspName",
          type, status, "accountNo", iban, "holderName", location, "simNumber",
          "cashBoxId", "installedAt", note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        randomUUID(),
        companyId,
        data.terminalNo,
        data.serialNo ?? null,
        data.merchantId ?? null,
        data.bankName,
        data.pspName ?? null,
        data.type ?? 'FIXED',
        data.accountNo ?? null,
        data.iban ?? null,
        data.holderName ?? null,
        data.location ?? null,
        data.simNumber ?? null,
        data.cashBoxId ?? null,
        data.installedAt ? new Date(data.installedAt) : null,
        data.note ?? null,
      ],
    );
    return rows[0];
  }

  async update(id: string, companyId: string, data: object) {
    await this.findOne(id, companyId);

    const payload: Record<string, unknown> = { ...data };
    this.assertType(payload.type as string | undefined);
    await this.assertCashBox(payload.cashBoxId as string | undefined, companyId);
    if (payload.installedAt) payload.installedAt = new Date(payload.installedAt as string);

    const params = new Params();
    const assignments = setClause(WRITABLE, payload, params);
    if (!assignments) return this.findOne(id, companyId);

    const rows = await this.db.query<Terminal>(
      `UPDATE "PosTerminal" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  /** تغییر وضعیت: فعال / غیرفعال / در حال تعمیر / عودت به بانک */
  async updateStatus(id: string, companyId: string, status: string) {
    if (!POS_STATUSES.includes(status)) {
      throw new BadRequestException(
        `وضعیت نامعتبر است. مقادیر مجاز: ${POS_STATUSES.join(', ')}`,
      );
    }
    await this.findOne(id, companyId);

    const rows = await this.db.query<Terminal>(
      'UPDATE "PosTerminal" SET status = $1, "updatedAt" = now() WHERE id = $2 RETURNING *',
      [status, id],
    );
    return rows[0];
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.db.execute('DELETE FROM "PosTerminal" WHERE id = $1', [id]);
    return { deleted: true, id };
  }

  async stats(companyId: string) {
    const rows = await this.db.query<{
      bankName: string;
      status: string;
      type: string;
      count: string;
    }>(
      `SELECT "bankName", status, type, count(*)::text AS count
       FROM "PosTerminal" WHERE "companyId" = $1 GROUP BY "bankName", status, type`,
      [companyId],
    );

    const byBank: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let total = 0;
    let active = 0;
    let fixed = 0;
    let mobile = 0;
    let underRepair = 0;

    for (const row of rows) {
      const count = Number(row.count);
      total += count;
      byBank[row.bankName] = (byBank[row.bankName] ?? 0) + count;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + count;
      if (row.status === 'ACTIVE') active += count;
      if (row.status === 'UNDER_REPAIR') underRepair += count;
      if (row.type === 'FIXED') fixed += count;
      if (row.type === 'MOBILE') mobile += count;
    }

    return { total, active, fixed, mobile, underRepair, byBank, byStatus };
  }

  private assertType(type?: string) {
    if (type && !POS_TYPES.includes(type)) {
      throw new BadRequestException('نوع کارت‌خوان باید FIXED (ثابت) یا MOBILE (سیار) باشد');
    }
  }

  private async assertCashBox(cashBoxId: string | undefined, companyId: string) {
    if (!cashBoxId) return;
    const rows = await this.db.query<{ id: string }>(
      'SELECT id FROM "CashBox" WHERE id = $1 AND "companyId" = $2',
      [cashBoxId, companyId],
    );
    if (!rows[0]) throw new NotFoundException('صندوق مرتبط یافت نشد');
  }
}
