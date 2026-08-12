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

export type Shift = Record<string, unknown> & {
  id: string;
  cashBoxId: string;
  warehouseId: string | null;
  startedAt: string;
  endedAt: string | null;
  openingCash: string;
};

/** Sale statuses that count towards a shift's takings. */
const COUNTED_STATUSES = ['PAID', 'PARTIAL'];

/**
 * شیفت صندوق‌دار
 *
 * هر فروش صندوق به یک شیفت باز گره می‌خورد، و در پایان شیفت پول شمرده‌شده با
 * آنچه سیستم انتظار دارد مقایسه می‌شود.  بدون این، کسری صندوق هیچ‌وقت دیده
 * نمی‌شود.
 *
 * «یک شیفت باز برای هر صندوق‌دار» و «یک شیفت باز برای هر صندوق» با ایندکس
 * یکتای جزئی در دیتابیس تضمین شده‌اند، نه با بررسی در کد.
 */
@Injectable()
export class CashierShiftService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditTrailService,
  ) {}

  /** شیفت باز فعلی این کاربر، یا null. */
  async current(companyId: string, userId: string): Promise<Shift | null> {
    const rows = await this.db.query<Shift>(
      `SELECT s.*, b.name AS "cashBoxName", w.name AS "warehouseName"
       FROM "CashierShift" s
       JOIN "CashBox" b ON b.id = s."cashBoxId"
       LEFT JOIN "Warehouse" w ON w.id = s."warehouseId"
       WHERE s."companyId" = $1 AND s."userId" = $2 AND s."endedAt" IS NULL`,
      [companyId, userId],
    );
    return rows[0] ?? null;
  }

  /** شیفت باز، یا خطا — برای مسیرهایی که بدون شیفت معنا ندارند. */
  async requireOpen(companyId: string, userId: string): Promise<Shift> {
    const shift = await this.current(companyId, userId);
    if (!shift) throw new BadRequestException('ابتدا شیفت صندوق را باز کنید');
    return shift;
  }

  async open(
    companyId: string,
    userId: string,
    data: { cashBoxId: string; warehouseId?: string; openingCash?: number; note?: string },
  ): Promise<Shift> {
    const cashBoxes = await this.db.query<{ id: string }>(
      'SELECT id FROM "CashBox" WHERE id = $1 AND "companyId" = $2',
      [data.cashBoxId, companyId],
    );
    if (!cashBoxes[0]) throw new NotFoundException('صندوق یافت نشد');

    if (data.warehouseId) {
      const warehouses = await this.db.query<{ id: string }>(
        'SELECT id FROM "Warehouse" WHERE id = $1 AND "companyId" = $2',
        [data.warehouseId, companyId],
      );
      if (!warehouses[0]) throw new NotFoundException('انبار یافت نشد');
    }

    try {
      const rows = await this.db.query<Shift>(
        `INSERT INTO "CashierShift"
           (id, "companyId", "userId", "cashBoxId", "warehouseId", "openingCash", note)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          randomUUID(),
          companyId,
          userId,
          data.cashBoxId,
          data.warehouseId ?? null,
          data.openingCash ?? 0,
          data.note ?? null,
        ],
      );

      await this.audit.record(companyId, {
        entity: 'CashierShift',
        entityId: rows[0].id,
        action: 'OPENED',
        userId,
        newValue: { cashBoxId: data.cashBoxId, openingCash: data.openingCash ?? 0 },
      });

      return rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('یک شیفت باز برای این صندوق‌دار یا صندوق وجود دارد');
      }
      throw error;
    }
  }

  /** جمع فروش شیفت، تفکیک‌شده به نقد و کارت. */
  async totals(shiftId: string) {
    const rows = await this.db.query<{
      count: string;
      sales: string;
      cash: string;
      card: string;
    }>(
      `SELECT
         count(DISTINCT s.id)::text AS count,
         COALESCE(sum(DISTINCT s.total), 0)::text AS sales,
         COALESCE(sum(p.amount) FILTER (WHERE p.method = 'CASH'), 0)::text AS cash,
         COALESCE(sum(p.amount) FILTER (WHERE p.method <> 'CASH'), 0)::text AS card
       FROM "Sale" s
       LEFT JOIN "Payment" p ON p."saleId" = s.id AND p.status = 'COMPLETED'
       WHERE s."shiftId" = $1 AND s.status = ANY($2)`,
      [shiftId, COUNTED_STATUSES],
    );

    const row = rows[0];
    return {
      salesCount: Number(row?.count ?? 0),
      salesTotal: Number(row?.sales ?? 0),
      cashTotal: Number(row?.cash ?? 0),
      cardTotal: Number(row?.card ?? 0),
    };
  }

  /**
   * بستن شیفت با شمارش دستی صندوق.
   *
   * مغایرت ذخیره می‌شود ولی مانع بستن نمی‌شود — کسری صندوق یک واقعیت است که
   * باید ثبت شود، نه خطایی که جلوی صندوق‌دار را بگیرد.
   */
  async close(
    companyId: string,
    shiftId: string,
    userId: string,
    data: { countedCash?: number; note?: string } = {},
  ) {
    const open = await this.db.query<Shift>(
      'SELECT * FROM "CashierShift" WHERE id = $1 AND "companyId" = $2',
      [shiftId, companyId],
    );
    const shift = open[0];
    if (!shift) throw new NotFoundException('شیفت یافت نشد');
    if (shift.endedAt) throw new BadRequestException('این شیفت قبلاً بسته شده است');

    const totals = await this.totals(shiftId);
    const expectedCash = Number(shift.openingCash) + totals.cashTotal;
    const countedCash = data.countedCash === undefined ? null : Number(data.countedCash);
    const difference = countedCash === null ? null : countedCash - expectedCash;

    const rows = await this.db.query<Shift>(
      `UPDATE "CashierShift"
       SET "endedAt" = now(), "countedCash" = $1, "expectedCash" = $2, "difference" = $3,
           "salesCount" = $4, "salesTotal" = $5, "cashTotal" = $6, "cardTotal" = $7,
           note = COALESCE($8, note), "updatedAt" = now()
       WHERE id = $9 RETURNING *`,
      [
        countedCash,
        expectedCash,
        difference,
        totals.salesCount,
        totals.salesTotal,
        totals.cashTotal,
        totals.cardTotal,
        data.note ?? null,
        shiftId,
      ],
    );

    await this.audit.record(companyId, {
      entity: 'CashierShift',
      entityId: shiftId,
      action: 'CLOSED',
      userId,
      newValue: { expectedCash, countedCash, difference, ...totals },
    });

    return rows[0];
  }

  async findAll(
    companyId: string,
    options?: { userId?: string; cashBoxId?: string; open?: boolean; limit?: number },
  ) {
    const params = new Params();
    const conditions = [`s."companyId" = ${params.next(companyId)}`];
    if (options?.userId) conditions.push(`s."userId" = ${params.next(options.userId)}`);
    if (options?.cashBoxId) conditions.push(`s."cashBoxId" = ${params.next(options.cashBoxId)}`);
    if (options?.open === true) conditions.push('s."endedAt" IS NULL');
    if (options?.open === false) conditions.push('s."endedAt" IS NOT NULL');

    const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 200) : 50;

    return this.db.query<Shift>(
      `SELECT s.*, u."firstName", u."lastName", b.name AS "cashBoxName"
       FROM "CashierShift" s
       JOIN "User" u ON u.id = s."userId"
       JOIN "CashBox" b ON b.id = s."cashBoxId"
       WHERE ${conditions.join(' AND ')}
       ORDER BY s."startedAt" DESC LIMIT ${params.next(limit)}`,
      params.values,
    );
  }

  /** گزارش یک شیفت با جمع‌های زندهٔ آن — برای شیفت باز هم کار می‌کند. */
  async findOne(companyId: string, shiftId: string) {
    const rows = await this.db.query<Shift>(
      `SELECT s.*, u."firstName", u."lastName", b.name AS "cashBoxName"
       FROM "CashierShift" s
       JOIN "User" u ON u.id = s."userId"
       JOIN "CashBox" b ON b.id = s."cashBoxId"
       WHERE s.id = $1 AND s."companyId" = $2`,
      [shiftId, companyId],
    );
    if (!rows[0]) throw new NotFoundException('شیفت یافت نشد');

    const totals = await this.totals(shiftId);
    return {
      ...rows[0],
      live: { ...totals, expectedCash: Number(rows[0].openingCash) + totals.cashTotal },
    };
  }
}
