import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllAccounts(companyId: string) {
    return this.prisma.account.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
    });
  }

  async findAccount(id: string, companyId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, companyId },
    });

    if (!account) {
      throw new NotFoundException('حساب یافت نشد');
    }

    return account;
  }

  async createAccount(
    companyId: string,
    data: { name: string; code: string; type: string; balance?: number },
  ) {
    return this.prisma.account.create({
      data: {
        companyId,
        name: data.name,
        code: data.code,
        type: data.type as never,
        balance: data.balance ?? 0,
      },
    });
  }

  async updateAccount(
    id: string,
    companyId: string,
    data: { name?: string; code?: string; type?: string; isActive?: boolean },
  ) {
    await this.findAccount(id, companyId);

    return this.prisma.account.update({
      where: { id },
      data: data as never,
    });
  }

  async removeAccount(id: string, companyId: string) {
    await this.findAccount(id, companyId);

    return this.prisma.account.delete({ where: { id } });
  }

  /**
   * تراز مالی ساده: درآمد، هزینه و سود
   */
  async summary(companyId: string, from?: string, to?: string) {
    const dateFilter =
      from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {};

    const [sales, purchases, expenses] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          companyId,
          status: { notIn: ['CANCELLED', 'DRAFT'] },
          ...dateFilter,
        },
        select: { total: true },
      }),
      this.prisma.purchase.findMany({
        where: {
          companyId,
          status: { notIn: ['CANCELLED', 'DRAFT'] },
          ...dateFilter,
        },
        select: { total: true },
      }),
      this.prisma.expense.findMany({
        where: { companyId, status: 'PAID', ...dateFilter },
        select: { amount: true },
      }),
    ]);

    const totalSales = sales.reduce((sum: number, s: any) => sum + Number(s.total), 0);
    const totalPurchases = purchases.reduce((sum: number, p: any) => sum + Number(p.total),
      0,
    );
    const totalExpenses = expenses.reduce((sum: number, e: any) => sum + Number(e.amount),
      0,
    );

    return {
      totalSales,
      totalPurchases,
      totalExpenses,
      grossProfit: totalSales - totalPurchases,
      netProfit: totalSales - totalPurchases - totalExpenses,
    };
  }
}
