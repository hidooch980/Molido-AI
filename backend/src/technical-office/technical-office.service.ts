import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Params, setClause } from '../database/sql';

type Permit = Record<string, unknown> & { id: string; status: string };
type Violation = Record<string, unknown> & { id: string; status: string };
type Inspection = Record<string, unknown> & { id: string };

const PERMIT_WRITABLE = [
  'type',
  'ownerName',
  'ownerPhone',
  'nationalCode',
  'address',
  'plateNumber',
  'area',
  'floors',
  'description',
] as const;

const VIOLATION_WRITABLE = ['ownerName', 'address', 'description', 'status'] as const;

/** Default validity of an issued permit, in years. */
const DEFAULT_PERMIT_YEARS = 2;

@Injectable()
export class TechnicalOfficeService {
  constructor(private readonly db: DatabaseService) {}

  // ==========================================
  // پروانه‌های ساختمانی (Building Permits)
  // ==========================================

  async findAllPermits(
    companyId: string,
    options?: { status?: string; type?: string; search?: string },
  ) {
    const params = new Params();
    const conditions = [`p."companyId" = ${params.next(companyId)}`];
    if (options?.status) conditions.push(`p.status = ${params.next(options.status)}`);
    if (options?.type) conditions.push(`p.type = ${params.next(options.type)}`);
    if (options?.search) {
      const term = params.next(`%${options.search}%`);
      conditions.push(
        `(p."ownerName" ILIKE ${term} OR p.address ILIKE ${term} OR p."permitNo" ILIKE ${term})`,
      );
    }

    return this.db.query<Permit>(
      `SELECT p.*,
              (SELECT count(*)::int FROM "TechnicalInspection" i WHERE i."permitId" = p.id)
                AS "inspectionsCount"
       FROM "BuildingPermit" p
       WHERE ${conditions.join(' AND ')} ORDER BY p."createdAt" DESC`,
      params.values,
    );
  }

  async findPermit(id: string, companyId: string) {
    const permits = await this.db.query<Permit>(
      'SELECT * FROM "BuildingPermit" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!permits[0]) throw new NotFoundException('پروانه ساختمانی یافت نشد');

    const inspections = await this.db.query<Inspection>(
      'SELECT * FROM "TechnicalInspection" WHERE "permitId" = $1 ORDER BY "inspectedAt" DESC',
      [id],
    );
    return { ...permits[0], inspections };
  }

  async createPermit(
    companyId: string,
    data: {
      type?: string;
      ownerName: string;
      ownerPhone?: string;
      nationalCode?: string;
      address: string;
      plateNumber?: string;
      area?: number;
      floors?: number;
      description?: string;
    },
  ) {
    const rows = await this.db.query<Permit>(
      `INSERT INTO "BuildingPermit"
         (id, "companyId", "permitNo", type, status, "ownerName", "ownerPhone",
          "nationalCode", address, "plateNumber", area, floors, description)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        randomUUID(),
        companyId,
        `BP-${Date.now()}`,
        data.type ?? 'CONSTRUCTION',
        data.ownerName,
        data.ownerPhone ?? null,
        data.nationalCode ?? null,
        data.address,
        data.plateNumber ?? null,
        data.area ?? 0,
        data.floors ?? 1,
        data.description ?? null,
      ],
    );
    return rows[0];
  }

  async updatePermit(id: string, companyId: string, data: object) {
    await this.findPermit(id, companyId);

    const params = new Params();
    const assignments = setClause(PERMIT_WRITABLE, data, params);
    if (!assignments) return this.findPermit(id, companyId);

    const rows = await this.db.query<Permit>(
      `UPDATE "BuildingPermit" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  /** صدور پروانه: تأیید نهایی با تاریخ صدور و اعتبار (پیش‌فرض ۲ سال) */
  async approvePermit(id: string, companyId: string, validYears = DEFAULT_PERMIT_YEARS) {
    const permit = await this.findPermit(id, companyId);
    if (permit.status === 'APPROVED') {
      throw new BadRequestException('پروانه قبلاً صادر شده است');
    }

    const issuedAt = new Date();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + validYears);

    const rows = await this.db.query<Permit>(
      `UPDATE "BuildingPermit"
       SET status = 'APPROVED', "issuedAt" = $1, "expiresAt" = $2,
           "rejectReason" = NULL, "updatedAt" = now()
       WHERE id = $3 RETURNING *`,
      [issuedAt, expiresAt, id],
    );
    return rows[0];
  }

  async rejectPermit(id: string, companyId: string, reason: string) {
    await this.findPermit(id, companyId);

    const rows = await this.db.query<Permit>(
      `UPDATE "BuildingPermit" SET status = 'REJECTED', "rejectReason" = $1, "updatedAt" = now()
       WHERE id = $2 RETURNING *`,
      [reason, id],
    );
    return rows[0];
  }

  /** ثبت بازدید فنی برای یک پروانه */
  async addInspection(
    permitId: string,
    companyId: string,
    data: { inspectorName: string; result: string; notes?: string },
  ) {
    const permit = await this.findPermit(permitId, companyId);

    const rows = await this.db.query<Inspection>(
      `INSERT INTO "TechnicalInspection" (id, "permitId", "inspectorName", result, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [randomUUID(), permit.id, data.inspectorName, data.result, data.notes ?? null],
    );

    // اگر بازدید مردود بود، پروانه به حالت بررسی برمی‌گردد
    if (data.result === 'FAILED') {
      await this.db.execute(
        `UPDATE "BuildingPermit" SET status = 'UNDER_REVIEW', "updatedAt" = now() WHERE id = $1`,
        [permit.id],
      );
    }

    return rows[0];
  }

  // ==========================================
  // تخلفات ساختمانی (Building Violations)
  // ==========================================

  async findAllViolations(companyId: string, status?: string) {
    const values: unknown[] = [companyId];
    let where = '"companyId" = $1';
    if (status) {
      values.push(status);
      where += ` AND status = $${values.length}`;
    }
    return this.db.query<Violation>(
      `SELECT * FROM "BuildingViolation" WHERE ${where} ORDER BY "createdAt" DESC`,
      values,
    );
  }

  async findViolation(id: string, companyId: string) {
    const rows = await this.db.query<Violation>(
      'SELECT * FROM "BuildingViolation" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('پرونده تخلف یافت نشد');
    return rows[0];
  }

  async createViolation(
    companyId: string,
    data: { ownerName: string; address: string; description: string },
  ) {
    const rows = await this.db.query<Violation>(
      `INSERT INTO "BuildingViolation"
         (id, "companyId", "caseNo", "ownerName", address, description, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'REPORTED') RETURNING *`,
      [
        randomUUID(),
        companyId,
        `VIO-${Date.now()}`,
        data.ownerName,
        data.address,
        data.description,
      ],
    );
    return rows[0];
  }

  /** ثبت جریمه برای پرونده تخلف (کمیسیون ماده ۱۰۰) */
  async fineViolation(id: string, companyId: string, fineAmount: number) {
    if (fineAmount <= 0) {
      throw new BadRequestException('مبلغ جریمه باید بزرگ‌تر از صفر باشد');
    }
    await this.findViolation(id, companyId);

    const rows = await this.db.query<Violation>(
      `UPDATE "BuildingViolation" SET status = 'FINED', "fineAmount" = $1, "updatedAt" = now()
       WHERE id = $2 RETURNING *`,
      [fineAmount, id],
    );
    return rows[0];
  }

  async updateViolation(id: string, companyId: string, data: object) {
    await this.findViolation(id, companyId);

    const params = new Params();
    const assignments = setClause(VIOLATION_WRITABLE, data, params);
    if (!assignments) return this.findViolation(id, companyId);

    const rows = await this.db.query<Violation>(
      `UPDATE "BuildingViolation" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  // ==========================================
  // آمار دفتر فنی
  // ==========================================

  async stats(companyId: string) {
    const [permitRows, violationRows] = await Promise.all([
      this.db.query<{ status: string; count: string }>(
        `SELECT status, count(*)::text AS count FROM "BuildingPermit"
         WHERE "companyId" = $1 GROUP BY status`,
        [companyId],
      ),
      this.db.query<{ status: string; count: string; fines: string }>(
        `SELECT status, count(*)::text AS count,
                COALESCE(sum("fineAmount"), 0)::text AS fines
         FROM "BuildingViolation" WHERE "companyId" = $1 GROUP BY status`,
        [companyId],
      ),
    ]);

    const permits: Record<string, number> = {};
    let permitTotal = 0;
    for (const row of permitRows) {
      permits[row.status] = Number(row.count);
      permitTotal += Number(row.count);
    }

    const violations: Record<string, number> = {};
    let violationTotal = 0;
    let totalFines = 0;
    for (const row of violationRows) {
      violations[row.status] = Number(row.count);
      violationTotal += Number(row.count);
      totalFines += Number(row.fines);
    }

    return {
      permits: {
        total: permitTotal,
        pending: permits.PENDING ?? 0,
        underReview: permits.UNDER_REVIEW ?? 0,
        approved: permits.APPROVED ?? 0,
        rejected: permits.REJECTED ?? 0,
      },
      violations: {
        total: violationTotal,
        open: (violations.REPORTED ?? 0) + (violations.UNDER_REVIEW ?? 0),
        fined: violations.FINED ?? 0,
        resolved: violations.RESOLVED ?? 0,
        totalFines,
      },
    };
  }
}
