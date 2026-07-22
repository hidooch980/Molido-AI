import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MunicipalFeesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    options?: { status?: string; type?: string; search?: string },
  ) {
    return this.prisma.municipalBill.findMany({
      where: {
        companyId,
        ...(options?.status ? { status: options.status as never } : {}),
        ...(options?.type ? { type: options.type as never } : {}),
        ...(options?.search
          ? {
              OR: [
                { payerName: { contains: options.search, mode: 'insensitive' } },
                { billNo: { contains: options.search } },
                { address: { contains: options.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        permit: { select: { id: true, permitNo: true, ownerName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const bill = await this.prisma.municipalBill.findFirst({
      where: { id, companyId },
      include: { permit: true },
    });

    if (!bill) {
      throw new NotFoundException('فیش عوارض یافت نشد');
    }

    return bill;
  }

  /**
   * صدور فیش عوارض (نوسازی، کسب، عوارض پروانه، جریمه، سایر)
   */
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
      const permit = await this.prisma.buildingPermit.findFirst({
        where: { id: data.permitId, companyId },
      });

      if (!permit) {
        throw new NotFoundException('پروانه مرتبط یافت نشد');
      }
    }

    return this.prisma.municipalBill.create({
      data: {
        companyId,
        billNo: `MB-${Date.now()}`,
        type: (data.type ?? 'OTHER') as never,
        status: 'UNPAID',
        payerName: data.payerName,
        payerPhone: data.payerPhone,
        address: data.address,
        amount: data.amount,
        description: data.description,
        permitId: data.permitId,
      },
    });
  }

  /**
   * صدور خودکار فیش جریمه از پرونده تخلف ساختمانی (ماده ۱۰۰)
   */
  async createFromViolation(violationId: string, companyId: string) {
    const violation = await this.prisma.buildingViolation.findFirst({
      where: { id: violationId, companyId },
    });

    if (!violation) {
      throw new NotFoundException('پرونده تخلف یافت نشد');
    }

    const fine = Number(violation.fineAmount ?? 0);

    if (violation.status !== 'FINED' || fine <= 0) {
      throw new BadRequestException(
        'برای این پرونده جریمه‌ای ثبت نشده است',
      );
    }

    return this.prisma.municipalBill.create({
      data: {
        companyId,
        billNo: `MB-${Date.now()}`,
        type: 'VIOLATION_FINE',
        status: 'UNPAID',
        payerName: violation.ownerName,
        address: violation.address,
        amount: fine,
        description: `جریمه پرونده تخلف ${violation.caseNo}`,
      },
    });
  }

  async pay(id: string, companyId: string) {
    const bill = await this.findOne(id, companyId);

    if (bill.status === 'PAID') {
      throw new BadRequestException('این فیش قبلاً پرداخت شده است');
    }

    if (bill.status === 'CANCELLED') {
      throw new BadRequestException('فیش لغوشده قابل پرداخت نیست');
    }

    return this.prisma.municipalBill.update({
      where: { id },
      data: { status: 'PAID', paidAt: new Date() },
    });
  }

  async cancel(id: string, companyId: string) {
    const bill = await this.findOne(id, companyId);

    if (bill.status === 'PAID') {
      throw new BadRequestException('فیش پرداخت‌شده قابل لغو نیست');
    }

    return this.prisma.municipalBill.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async stats(companyId: string) {
    const bills = await this.prisma.municipalBill.findMany({
      where: { companyId },
      select: { status: true, type: true, amount: true },
    });

    const typed = bills as Array<{
      status: string;
      type: string;
      amount: unknown;
    }>;

    const sum = (rows: Array<{ amount: unknown }>) =>
      rows.reduce((acc: number, b) => acc + Number(b.amount ?? 0), 0);

    const byType: Record<string, { count: number; amount: number }> = {};

    for (const b of typed) {
      byType[b.type] = byType[b.type] ?? { count: 0, amount: 0 };
      byType[b.type].count += 1;
      byType[b.type].amount += Number(b.amount ?? 0);
    }

    return {
      total: typed.length,
      unpaidCount: typed.filter((b: any) => b.status === 'UNPAID').length,
      paidCount: typed.filter((b: any) => b.status === 'PAID').length,
      unpaidAmount: sum(typed.filter((b: any) => b.status === 'UNPAID')),
      collectedAmount: sum(typed.filter((b: any) => b.status === 'PAID')),
      byType,
    };
  }
}
