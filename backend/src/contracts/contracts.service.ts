import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    options?: {
      status?: string;
      type?: string;
      search?: string;
      expiringSoon?: boolean;
    },
  ) {
    const expiryLimit = new Date();
    expiryLimit.setDate(expiryLimit.getDate() + 30);

    return this.prisma.contract.findMany({
      where: {
        companyId,
        ...(options?.status ? { status: options.status as never } : {}),
        ...(options?.type ? { type: options.type as never } : {}),
        ...(options?.search
          ? {
              OR: [
                { title: { contains: options.search, mode: 'insensitive' } },
                {
                  partyName: {
                    contains: options.search,
                    mode: 'insensitive',
                  },
                },
                { contractNo: { contains: options.search } },
              ],
            }
          : {}),
        ...(options?.expiringSoon
          ? {
              endDate: { lte: expiryLimit },
              status: 'ACTIVE' as never,
            }
          : {}),
      },
      include: {
        payments: { select: { id: true, status: true, amount: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, companyId },
      include: {
        payments: { orderBy: { dueDate: 'asc' } },
      },
    });

    if (!contract) {
      throw new NotFoundException('قرارداد یافت نشد');
    }

    return contract;
  }

  async create(
    companyId: string,
    data: {
      contractNo: string;
      title: string;
      type?: string;
      partyName: string;
      partyPhone?: string;
      partyNationalId?: string;
      amount?: number;
      startDate?: string;
      endDate?: string;
      description?: string;
    },
  ) {
    const existing = await this.prisma.contract.findFirst({
      where: { contractNo: data.contractNo },
    });

    if (existing) {
      throw new BadRequestException('شماره قرارداد تکراری است');
    }

    return this.prisma.contract.create({
      data: {
        companyId,
        contractNo: data.contractNo,
        title: data.title,
        type: (data.type ?? 'SERVICE') as never,
        partyName: data.partyName,
        partyPhone: data.partyPhone,
        partyNationalId: data.partyNationalId,
        amount: data.amount ?? 0,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        description: data.description,
      },
    });
  }

  async update(
    id: string,
    companyId: string,
    data: {
      title?: string;
      type?: string;
      partyName?: string;
      partyPhone?: string;
      partyNationalId?: string;
      amount?: number;
      startDate?: string;
      endDate?: string;
      description?: string;
    },
  ) {
    await this.findOne(id, companyId);

    return this.prisma.contract.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.type !== undefined ? { type: data.type as never } : {}),
        ...(data.partyName !== undefined
          ? { partyName: data.partyName }
          : {}),
        ...(data.partyPhone !== undefined
          ? { partyPhone: data.partyPhone }
          : {}),
        ...(data.partyNationalId !== undefined
          ? { partyNationalId: data.partyNationalId }
          : {}),
        ...(data.amount !== undefined ? { amount: data.amount } : {}),
        ...(data.startDate !== undefined
          ? { startDate: data.startDate ? new Date(data.startDate) : null }
          : {}),
        ...(data.endDate !== undefined
          ? { endDate: data.endDate ? new Date(data.endDate) : null }
          : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
      },
    });
  }

  async updateStatus(id: string, companyId: string, status: string) {
    await this.findOne(id, companyId);

    return this.prisma.contract.update({
      where: { id },
      data: { status: status as never },
    });
  }

  // ---------- اقساط/پرداخت‌های قرارداد ----------

  async addPayment(
    contractId: string,
    companyId: string,
    data: { amount: number; dueDate: string; note?: string },
  ) {
    await this.findOne(contractId, companyId);

    return this.prisma.contractPayment.create({
      data: {
        contractId,
        amount: data.amount,
        dueDate: new Date(data.dueDate),
        note: data.note,
      },
    });
  }

  async payPayment(paymentId: string, companyId: string) {
    const payment = await this.prisma.contractPayment.findFirst({
      where: { id: paymentId, contract: { companyId } },
    });

    if (!payment) {
      throw new NotFoundException('قسط قرارداد یافت نشد');
    }

    return this.prisma.contractPayment.update({
      where: { id: paymentId },
      data: { status: 'PAID' as never, paidAt: new Date() },
    });
  }

  // ---------- آمار ----------

  async stats(companyId: string) {
    const contracts = await this.prisma.contract.findMany({
      where: { companyId },
      select: { status: true, amount: true, endDate: true },
    });

    const byStatus: Record<string, number> = {};
    let totalAmount = 0;

    for (const contract of contracts as Array<any>) {
      byStatus[contract.status] = (byStatus[contract.status] ?? 0) + 1;
      totalAmount += Number(contract.amount);
    }

    const expiryLimit = new Date();
    expiryLimit.setDate(expiryLimit.getDate() + 30);

    const expiringSoon = (contracts as Array<any>).filter(
      (contract) =>
        contract.status === 'ACTIVE' &&
        contract.endDate &&
        new Date(contract.endDate) <= expiryLimit,
    ).length;

    return {
      total: contracts.length,
      byStatus,
      totalAmount,
      expiringSoon,
    };
  }
}
