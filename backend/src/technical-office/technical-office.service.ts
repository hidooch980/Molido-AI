import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TechnicalOfficeService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // پروانه‌های ساختمانی (Building Permits)
  // ==========================================

  async findAllPermits(
    companyId: string,
    options?: { status?: string; type?: string; search?: string },
  ) {
    return this.prisma.buildingPermit.findMany({
      where: {
        companyId,
        ...(options?.status ? { status: options.status as never } : {}),
        ...(options?.type ? { type: options.type as never } : {}),
        ...(options?.search
          ? {
              OR: [
                { ownerName: { contains: options.search, mode: 'insensitive' } },
                { address: { contains: options.search, mode: 'insensitive' } },
                { permitNo: { contains: options.search } },
              ],
            }
          : {}),
      },
      include: {
        _count: { select: { inspections: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPermit(id: string, companyId: string) {
    const permit = await this.prisma.buildingPermit.findFirst({
      where: { id, companyId },
      include: {
        inspections: { orderBy: { inspectedAt: 'desc' } },
      },
    });

    if (!permit) {
      throw new NotFoundException('پروانه ساختمانی یافت نشد');
    }

    return permit;
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
    return this.prisma.buildingPermit.create({
      data: {
        companyId,
        permitNo: `BP-${Date.now()}`,
        type: (data.type ?? 'CONSTRUCTION') as never,
        status: 'PENDING',
        ownerName: data.ownerName,
        ownerPhone: data.ownerPhone,
        nationalCode: data.nationalCode,
        address: data.address,
        plateNumber: data.plateNumber,
        area: data.area ?? 0,
        floors: data.floors ?? 1,
        description: data.description,
      },
    });
  }

  async updatePermit(
    id: string,
    companyId: string,
    data: Record<string, unknown>,
  ) {
    await this.findPermit(id, companyId);

    return this.prisma.buildingPermit.update({
      where: { id },
      data: data as never,
    });
  }

  /**
   * صدور پروانه: تأیید نهایی با تاریخ صدور و اعتبار (پیش‌فرض ۲ سال)
   */
  async approvePermit(id: string, companyId: string, validYears = 2) {
    const permit = await this.findPermit(id, companyId);

    if (permit.status === 'APPROVED') {
      throw new BadRequestException('پروانه قبلاً صادر شده است');
    }

    const issuedAt = new Date();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + validYears);

    return this.prisma.buildingPermit.update({
      where: { id },
      data: { status: 'APPROVED', issuedAt, expiresAt, rejectReason: null },
    });
  }

  async rejectPermit(id: string, companyId: string, reason: string) {
    await this.findPermit(id, companyId);

    return this.prisma.buildingPermit.update({
      where: { id },
      data: { status: 'REJECTED', rejectReason: reason },
    });
  }

  /**
   * ثبت بازدید فنی برای یک پروانه
   */
  async addInspection(
    permitId: string,
    companyId: string,
    data: { inspectorName: string; result: string; notes?: string },
  ) {
    const permit = await this.findPermit(permitId, companyId);

    const inspection = await this.prisma.technicalInspection.create({
      data: {
        permitId: permit.id,
        inspectorName: data.inspectorName,
        result: data.result as never,
        notes: data.notes,
      },
    });

    // اگر بازدید مردود بود، پروانه به حالت بررسی برمی‌گردد
    if (data.result === 'FAILED') {
      await this.prisma.buildingPermit.update({
        where: { id: permit.id },
        data: { status: 'UNDER_REVIEW' },
      });
    }

    return inspection;
  }

  // ==========================================
  // تخلفات ساختمانی (Building Violations)
  // ==========================================

  async findAllViolations(companyId: string, status?: string) {
    return this.prisma.buildingViolation.findMany({
      where: {
        companyId,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findViolation(id: string, companyId: string) {
    const violation = await this.prisma.buildingViolation.findFirst({
      where: { id, companyId },
    });

    if (!violation) {
      throw new NotFoundException('پرونده تخلف یافت نشد');
    }

    return violation;
  }

  async createViolation(
    companyId: string,
    data: { ownerName: string; address: string; description: string },
  ) {
    return this.prisma.buildingViolation.create({
      data: {
        companyId,
        caseNo: `VIO-${Date.now()}`,
        ownerName: data.ownerName,
        address: data.address,
        description: data.description,
        status: 'REPORTED',
      },
    });
  }

  /**
   * ثبت جریمه برای پرونده تخلف (کمیسیون ماده ۱۰۰)
   */
  async fineViolation(id: string, companyId: string, fineAmount: number) {
    if (fineAmount <= 0) {
      throw new BadRequestException('مبلغ جریمه باید بزرگ‌تر از صفر باشد');
    }

    await this.findViolation(id, companyId);

    return this.prisma.buildingViolation.update({
      where: { id },
      data: { status: 'FINED', fineAmount },
    });
  }

  async updateViolation(
    id: string,
    companyId: string,
    data: Record<string, unknown>,
  ) {
    await this.findViolation(id, companyId);

    return this.prisma.buildingViolation.update({
      where: { id },
      data: data as never,
    });
  }

  // ==========================================
  // آمار دفتر فنی
  // ==========================================

  async stats(companyId: string) {
    const [permits, violations] = await Promise.all([
      this.prisma.buildingPermit.findMany({
        where: { companyId },
        select: { status: true },
      }),
      this.prisma.buildingViolation.findMany({
        where: { companyId },
        select: { status: true, fineAmount: true },
      }),
    ]);

    const countBy = (rows: Array<{ status: string }>, status: string) =>
      rows.filter((r: any) => r.status === status).length;

    return {
      permits: {
        total: permits.length,
        pending: countBy(permits, 'PENDING'),
        underReview: countBy(permits, 'UNDER_REVIEW'),
        approved: countBy(permits, 'APPROVED'),
        rejected: countBy(permits, 'REJECTED'),
      },
      violations: {
        total: violations.length,
        open: countBy(violations, 'REPORTED') + countBy(violations, 'UNDER_REVIEW'),
        fined: countBy(violations, 'FINED'),
        resolved: countBy(violations, 'RESOLVED'),
        totalFines: violations.reduce(
          (sum: number, v: { fineAmount: unknown }) =>
            sum + Number(v.fineAmount ?? 0),
          0,
        ),
      },
    };
  }
}
