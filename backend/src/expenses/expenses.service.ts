import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    options?: { status?: string; from?: string; to?: string },
  ) {
    return this.prisma.expense.findMany({
      where: {
        companyId,
        ...(options?.status ? { status: options.status as never } : {}),
        ...(options?.from || options?.to
          ? {
              createdAt: {
                ...(options.from ? { gte: new Date(options.from) } : {}),
                ...(options.to ? { lte: new Date(options.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, companyId },
    });

    if (!expense) {
      throw new NotFoundException('هزینه یافت نشد');
    }

    return expense;
  }

  async create(
    companyId: string,
    data: { title: string; amount: number; status?: string; note?: string },
  ) {
    return this.prisma.expense.create({
      data: {
        companyId,
        title: data.title,
        amount: data.amount,
        status: (data.status ?? 'DRAFT') as never,
        note: data.note,
      },
    });
  }

  async update(
    id: string,
    companyId: string,
    data: { title?: string; amount?: number; status?: string; note?: string },
  ) {
    await this.findOne(id, companyId);

    return this.prisma.expense.update({
      where: { id },
      data: data as never,
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);

    return this.prisma.expense.delete({ where: { id } });
  }
}
