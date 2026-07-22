import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- کارمندان ----------

  async findAllEmployees(
    companyId: string,
    options?: { search?: string; onlyActive?: boolean },
  ) {
    return this.prisma.employee.findMany({
      where: {
        companyId,
        ...(options?.onlyActive ? { isActive: true } : {}),
        ...(options?.search
          ? {
              OR: [
                {
                  firstName: {
                    contains: options.search,
                    mode: 'insensitive',
                  },
                },
                {
                  lastName: {
                    contains: options.search,
                    mode: 'insensitive',
                  },
                },
                { employeeNo: { contains: options.search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneEmployee(id: string, companyId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId },
      include: {
        payrollSlips: { orderBy: { period: 'desc' }, take: 12 },
      },
    });

    if (!employee) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    return employee;
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
    const existing = await this.prisma.employee.findFirst({
      where: { employeeNo: data.employeeNo },
    });

    if (existing) {
      throw new BadRequestException('شماره پرسنلی تکراری است');
    }

    return this.prisma.employee.create({
      data: {
        companyId,
        employeeNo: data.employeeNo,
        firstName: data.firstName,
        lastName: data.lastName,
        nationalId: data.nationalId,
        position: data.position,
        department: data.department,
        phone: data.phone,
        hireDate: data.hireDate ? new Date(data.hireDate) : undefined,
        baseSalary: data.baseSalary,
        housingAllowance: data.housingAllowance ?? 0,
        foodAllowance: data.foodAllowance ?? 0,
        note: data.note,
      },
    });
  }

  async updateEmployee(
    id: string,
    companyId: string,
    data: {
      firstName?: string;
      lastName?: string;
      nationalId?: string;
      position?: string;
      department?: string;
      phone?: string;
      hireDate?: string;
      baseSalary?: number;
      housingAllowance?: number;
      foodAllowance?: number;
      isActive?: boolean;
      note?: string;
    },
  ) {
    await this.findOneEmployee(id, companyId);

    return this.prisma.employee.update({
      where: { id },
      data: {
        ...(data.firstName !== undefined
          ? { firstName: data.firstName }
          : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.nationalId !== undefined
          ? { nationalId: data.nationalId }
          : {}),
        ...(data.position !== undefined ? { position: data.position } : {}),
        ...(data.department !== undefined
          ? { department: data.department }
          : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.hireDate !== undefined
          ? { hireDate: data.hireDate ? new Date(data.hireDate) : null }
          : {}),
        ...(data.baseSalary !== undefined
          ? { baseSalary: data.baseSalary }
          : {}),
        ...(data.housingAllowance !== undefined
          ? { housingAllowance: data.housingAllowance }
          : {}),
        ...(data.foodAllowance !== undefined
          ? { foodAllowance: data.foodAllowance }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.note !== undefined ? { note: data.note } : {}),
      },
    });
  }

  // ---------- فیش‌های حقوقی ----------

  async findSlips(
    companyId: string,
    options?: { period?: string; employeeId?: string; status?: string },
  ) {
    return this.prisma.payrollSlip.findMany({
      where: {
        companyId,
        ...(options?.period ? { period: options.period } : {}),
        ...(options?.employeeId ? { employeeId: options.employeeId } : {}),
        ...(options?.status ? { status: options.status as never } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeNo: true,
            firstName: true,
            lastName: true,
            position: true,
          },
        },
      },
      orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
    });
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
    const employee = await this.prisma.employee.findFirst({
      where: { id: data.employeeId, companyId, isActive: true },
    });

    if (!employee) {
      throw new NotFoundException('کارمند یافت نشد');
    }

    const existing = await this.prisma.payrollSlip.findFirst({
      where: { employeeId: employee.id, period: data.period },
    });

    if (existing) {
      throw new BadRequestException('فیش حقوقی این دوره قبلاً صادر شده است');
    }

    const baseSalary = Number(employee.baseSalary);
    const allowances =
      Number(employee.housingAllowance) + Number(employee.foodAllowance);

    const overtimeHours = Number(data.overtimeHours ?? 0);
    const hourlyRate =
      data.overtimeRate !== undefined
        ? Number(data.overtimeRate)
        : (baseSalary / 220) * 1.4;
    const overtimePay = Math.round(overtimeHours * hourlyRate);

    const bonus = Number(data.bonus ?? 0);
    const deductions = Number(data.deductions ?? 0);
    const insurance =
      data.insurance !== undefined
        ? Number(data.insurance)
        : Math.round(baseSalary * 0.07);
    const tax = Number(data.tax ?? 0);

    const netPay =
      baseSalary +
      allowances +
      overtimePay +
      bonus -
      deductions -
      insurance -
      tax;

    if (netPay < 0) {
      throw new BadRequestException('خالص پرداختی نمی‌تواند منفی باشد');
    }

    return this.prisma.payrollSlip.create({
      data: {
        companyId,
        employeeId: employee.id,
        period: data.period,
        baseSalary,
        allowances,
        overtimeHours,
        overtimePay,
        bonus,
        deductions,
        insurance,
        tax,
        netPay,
        note: data.note,
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async approveSlip(id: string, companyId: string) {
    const slip = await this.prisma.payrollSlip.findFirst({
      where: { id, companyId },
    });

    if (!slip) {
      throw new NotFoundException('فیش حقوقی یافت نشد');
    }

    if (slip.status !== 'DRAFT') {
      throw new BadRequestException('فقط فیش پیش‌نویس قابل تأیید است');
    }

    return this.prisma.payrollSlip.update({
      where: { id },
      data: { status: 'APPROVED' as never },
    });
  }

  async paySlip(id: string, companyId: string) {
    const slip = await this.prisma.payrollSlip.findFirst({
      where: { id, companyId },
    });

    if (!slip) {
      throw new NotFoundException('فیش حقوقی یافت نشد');
    }

    if (slip.status !== 'APPROVED') {
      throw new BadRequestException('فقط فیش تأییدشده قابل پرداخت است');
    }

    return this.prisma.payrollSlip.update({
      where: { id },
      data: { status: 'PAID' as never, paidAt: new Date() },
    });
  }

  // ---------- آمار ----------

  async stats(companyId: string) {
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(
      now.getMonth() + 1,
    ).padStart(2, '0')}`;

    const [employeesCount, slips] = await Promise.all([
      this.prisma.employee.count({ where: { companyId, isActive: true } }),
      this.prisma.payrollSlip.findMany({
        where: { companyId, period: currentPeriod },
        select: { status: true, netPay: true },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    let totalNetPay = 0;

    for (const slip of slips as Array<any>) {
      byStatus[slip.status] = (byStatus[slip.status] ?? 0) + 1;
      totalNetPay += Number(slip.netPay);
    }

    return {
      period: currentPeriod,
      employeesCount,
      slipsCount: slips.length,
      byStatus,
      totalNetPay,
    };
  }
}
