import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Params, setClause } from '../database/sql';

type Employee = Record<string, unknown> & {
  id: string;
  baseSalary: string;
  housingAllowance: string;
  foodAllowance: string;
};
type Slip = Record<string, unknown> & { id: string; status: string };

const EMPLOYEE_WRITABLE = [
  'firstName',
  'lastName',
  'nationalId',
  'position',
  'department',
  'phone',
  'hireDate',
  'baseSalary',
  'housingAllowance',
  'foodAllowance',
  'isActive',
  'note',
] as const;

/** Monthly hours used to derive the overtime rate, and the statutory multiplier. */
const MONTHLY_HOURS = 220;
const OVERTIME_MULTIPLIER = 1.4;
const INSURANCE_RATE = 0.07;

@Injectable()
export class PayrollService {
  constructor(private readonly db: DatabaseService) {}

  // ---------- کارمندان ----------

  async findAllEmployees(companyId: string, options?: { search?: string; onlyActive?: boolean }) {
    const params = new Params();
    const conditions = [`"companyId" = ${params.next(companyId)}`];
    if (options?.onlyActive) conditions.push('"isActive" = true');
    if (options?.search) {
      const term = params.next(`%${options.search}%`);
      conditions.push(
        `("firstName" ILIKE ${term} OR "lastName" ILIKE ${term} OR "employeeNo" ILIKE ${term})`,
      );
    }
    return this.db.query<Employee>(
      `SELECT * FROM "Employee" WHERE ${conditions.join(' AND ')} ORDER BY "createdAt" DESC`,
      params.values,
    );
  }

  private async requireEmployee(id: string, companyId: string): Promise<Employee> {
    const rows = await this.db.query<Employee>(
      'SELECT * FROM "Employee" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('کارمند یافت نشد');
    return rows[0];
  }

  async findOneEmployee(id: string, companyId: string) {
    const employee = await this.requireEmployee(id, companyId);
    const payrollSlips = await this.db.query<Slip>(
      'SELECT * FROM "PayrollSlip" WHERE "employeeId" = $1 ORDER BY period DESC LIMIT 12',
      [id],
    );
    return { ...employee, payrollSlips };
  }

  async createEmployee(
    companyId: string,
    data: {
      employeeNo: string;
      firstName: string;
      lastName: string;
      nationalId?: string;
      position?: string;
      department?: string;
      phone?: string;
      hireDate?: string;
      baseSalary: number;
      housingAllowance?: number;
      foodAllowance?: number;
      note?: string;
    },
  ) {
    const existing = await this.db.query<{ id: string }>(
      'SELECT id FROM "Employee" WHERE "employeeNo" = $1',
      [data.employeeNo],
    );
    if (existing[0]) throw new BadRequestException('شماره پرسنلی تکراری است');

    const rows = await this.db.query<Employee>(
      `INSERT INTO "Employee"
         (id, "companyId", "employeeNo", "firstName", "lastName", "nationalId", position,
          department, phone, "hireDate", "baseSalary", "housingAllowance", "foodAllowance", note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        randomUUID(),
        companyId,
        data.employeeNo,
        data.firstName,
        data.lastName,
        data.nationalId ?? null,
        data.position ?? null,
        data.department ?? null,
        data.phone ?? null,
        data.hireDate ? new Date(data.hireDate) : null,
        data.baseSalary,
        data.housingAllowance ?? 0,
        data.foodAllowance ?? 0,
        data.note ?? null,
      ],
    );
    return rows[0];
  }

  async updateEmployee(id: string, companyId: string, data: object) {
    await this.requireEmployee(id, companyId);

    const payload: Record<string, unknown> = { ...data };
    if (payload.hireDate !== undefined) {
      payload.hireDate = payload.hireDate ? new Date(payload.hireDate as string) : null;
    }

    const params = new Params();
    const assignments = setClause(EMPLOYEE_WRITABLE, payload, params);
    if (!assignments) return this.requireEmployee(id, companyId);

    const rows = await this.db.query<Employee>(
      `UPDATE "Employee" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  // ---------- فیش‌های حقوقی ----------

  async findSlips(
    companyId: string,
    options?: { period?: string; employeeId?: string; status?: string },
  ) {
    const params = new Params();
    const conditions = [`s."companyId" = ${params.next(companyId)}`];
    if (options?.period) conditions.push(`s.period = ${params.next(options.period)}`);
    if (options?.employeeId) conditions.push(`s."employeeId" = ${params.next(options.employeeId)}`);
    if (options?.status) conditions.push(`s.status = ${params.next(options.status)}`);

    return this.db.query<Slip>(
      `SELECT s.*, e."employeeNo", e."firstName", e."lastName", e.position
       FROM "PayrollSlip" s JOIN "Employee" e ON e.id = s."employeeId"
       WHERE ${conditions.join(' AND ')} ORDER BY s.period DESC, s."createdAt" DESC`,
      params.values,
    );
  }

  async createSlip(
    companyId: string,
    data: {
      employeeId: string;
      period: string;
      overtimeHours?: number;
      overtimeRate?: number;
      bonus?: number;
      deductions?: number;
      insurance?: number;
      tax?: number;
      note?: string;
    },
  ) {
    const employees = await this.db.query<Employee>(
      'SELECT * FROM "Employee" WHERE id = $1 AND "companyId" = $2 AND "isActive" = true',
      [data.employeeId, companyId],
    );
    const employee = employees[0];
    if (!employee) throw new NotFoundException('کارمند یافت نشد');

    const existing = await this.db.query<{ id: string }>(
      'SELECT id FROM "PayrollSlip" WHERE "employeeId" = $1 AND period = $2',
      [employee.id, data.period],
    );
    if (existing[0]) throw new BadRequestException('فیش حقوقی این دوره قبلاً صادر شده است');

    const baseSalary = Number(employee.baseSalary);
    const allowances = Number(employee.housingAllowance) + Number(employee.foodAllowance);

    const overtimeHours = Number(data.overtimeHours ?? 0);
    const hourlyRate =
      data.overtimeRate !== undefined
        ? Number(data.overtimeRate)
        : (baseSalary / MONTHLY_HOURS) * OVERTIME_MULTIPLIER;
    const overtimePay = Math.round(overtimeHours * hourlyRate);

    const bonus = Number(data.bonus ?? 0);
    const deductions = Number(data.deductions ?? 0);
    const insurance =
      data.insurance !== undefined
        ? Number(data.insurance)
        : Math.round(baseSalary * INSURANCE_RATE);
    const tax = Number(data.tax ?? 0);

    const netPay =
      baseSalary + allowances + overtimePay + bonus - deductions - insurance - tax;
    if (netPay < 0) throw new BadRequestException('خالص پرداختی نمی‌تواند منفی باشد');

    const rows = await this.db.query<Slip>(
      `INSERT INTO "PayrollSlip"
         (id, "companyId", "employeeId", period, "baseSalary", allowances, "overtimeHours",
          "overtimePay", bonus, deductions, insurance, tax, "netPay", note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        randomUUID(),
        companyId,
        employee.id,
        data.period,
        baseSalary,
        allowances,
        overtimeHours,
        overtimePay,
        bonus,
        deductions,
        insurance,
        tax,
        netPay,
        data.note ?? null,
      ],
    );

    return {
      ...rows[0],
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
      },
    };
  }

  async approveSlip(id: string, companyId: string) {
    return this.advanceSlip(id, companyId, 'DRAFT', 'APPROVED', 'فقط فیش پیش‌نویس قابل تأیید است');
  }

  async paySlip(id: string, companyId: string) {
    return this.advanceSlip(id, companyId, 'APPROVED', 'PAID', 'فقط فیش تأییدشده قابل پرداخت است');
  }

  private async advanceSlip(
    id: string,
    companyId: string,
    from: string,
    to: string,
    rejection: string,
  ) {
    const paidAt = to === 'PAID' ? ', "paidAt" = now()' : '';
    const rows = await this.db.query<Slip>(
      `UPDATE "PayrollSlip" SET status = $1${paidAt}, "updatedAt" = now()
       WHERE id = $2 AND "companyId" = $3 AND status = $4 RETURNING *`,
      [to, id, companyId, from],
    );
    if (rows[0]) return rows[0];

    const existing = await this.db.query<{ id: string }>(
      'SELECT id FROM "PayrollSlip" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!existing[0]) throw new NotFoundException('فیش حقوقی یافت نشد');
    throw new BadRequestException(rejection);
  }

  // ---------- آمار ----------

  async stats(companyId: string) {
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [employees, slips] = await Promise.all([
      this.db.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "Employee"
         WHERE "companyId" = $1 AND "isActive" = true`,
        [companyId],
      ),
      this.db.query<{ status: string; count: string; net: string }>(
        `SELECT status, count(*)::text AS count, COALESCE(sum("netPay"), 0)::text AS net
         FROM "PayrollSlip" WHERE "companyId" = $1 AND period = $2 GROUP BY status`,
        [companyId, period],
      ),
    ]);

    const byStatus: Record<string, number> = {};
    let slipsCount = 0;
    let totalNetPay = 0;
    for (const row of slips) {
      byStatus[row.status] = Number(row.count);
      slipsCount += Number(row.count);
      totalNetPay += Number(row.net);
    }

    return {
      period,
      employeesCount: Number(employees[0]?.count ?? 0),
      slipsCount,
      byStatus,
      totalNetPay,
    };
  }
}
