import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TreasuryService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- حساب‌ها ----------

  async findAllAccounts(companyId: string) {
    return this.prisma.treasuryAccount.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneAccount(id: string, companyId: string) {
    const account = await this.prisma.treasuryAccount.findFirst({
      where: { id, companyId },
      include: {
        transactions: { orderBy: { date: 'desc' }, take: 20 },
      },
    });

    if (!account) {
      throw new NotFoundException('حساب خزانه یافت نشد');
    }

    return account;
  }

  async createAccount(
    companyId: string,
    data: {
      name: string;
      type?: string;
      bankName?: string;
      accountNo?: string;
      iban?: string;
      openingBalance?: number;
      note?: string;
    },
  ) {
    return this.prisma.treasuryAccount.create({
      data: {
        companyId,
        name: data.name,
        type: (data.type ?? 'BANK') as never,
        bankName: data.bankName,
        accountNo: data.accountNo,
        iban: data.iban,
        balance: data.openingBalance ?? 0,
        note: data.note,
      },
    });
  }

  async updateAccount(
    id: string,
    companyId: string,
    data: {
      name?: string;
      type?: string;
      bankName?: string;
      accountNo?: string;
      iban?: string;
      isActive?: boolean;
      note?: string;
    },
  ) {
    await this.findOneAccount(id, companyId);

    return this.prisma.treasuryAccount.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type as never } : {}),
        ...(data.bankName !== undefined ? { bankName: data.bankName } : {}),
        ...(data.accountNo !== undefined
          ? { accountNo: data.accountNo }
          : {}),
        ...(data.iban !== undefined ? { iban: data.iban } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.note !== undefined ? { note: data.note } : {}),
      },
    });
  }

  // ---------- تراکنش‌ها ----------

  async findTransactions(
    companyId: string,
    options?: { accountId?: string; type?: string },
  ) {
    return this.prisma.treasuryTransaction.findMany({
      where: {
        companyId,
        ...(options?.accountId ? { accountId: options.accountId } : {}),
        ...(options?.type ? { type: options.type as never } : {}),
      },
      include: {
        account: { select: { id: true, name: true, type: true } },
      },
      orderBy: { date: 'desc' },
      take: 200,
    });
  }

  async createTransaction(
    companyId: string,
    data: {
      accountId: string;
      type: string;
      amount: number;
      reference?: string;
      description?: string;
      date?: string;
    },
  ) {
    const account = await this.prisma.treasuryAccount.findFirst({
      where: { id: data.accountId, companyId },
    });

    if (!account) {
      throw new NotFoundException('حساب خزانه یافت نشد');
    }

    const amount = Number(data.amount);

    if (data.type === 'WITHDRAWAL' && Number(account.balance) < amount) {
      throw new BadRequestException('موجودی حساب کافی نیست');
    }

    const delta = data.type === 'DEPOSIT' ? amount : -amount;

    return this.prisma.$transaction(async (tx: any) => {
      await tx.treasuryAccount.update({
        where: { id: account.id },
        data: { balance: { increment: delta } },
      });

      return tx.treasuryTransaction.create({
        data: {
          companyId,
          accountId: account.id,
          type: data.type as never,
          amount,
          reference: data.reference,
          description: data.description,
          date: data.date ? new Date(data.date) : new Date(),
        },
      });
    });
  }

  async transfer(
    companyId: string,
    data: {
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      description?: string;
    },
  ) {
    if (data.fromAccountId === data.toAccountId) {
      throw new BadRequestException('حساب مبدأ و مقصد نباید یکسان باشند');
    }

    const [from, to] = await Promise.all([
      this.prisma.treasuryAccount.findFirst({
        where: { id: data.fromAccountId, companyId },
      }),
      this.prisma.treasuryAccount.findFirst({
        where: { id: data.toAccountId, companyId },
      }),
    ]);

    if (!from || !to) {
      throw new NotFoundException('حساب خزانه یافت نشد');
    }

    const amount = Number(data.amount);

    if (Number(from.balance) < amount) {
      throw new BadRequestException('موجودی حساب کافی نیست');
    }

    return this.prisma.$transaction(async (tx: any) => {
      await tx.treasuryAccount.update({
        where: { id: from.id },
        data: { balance: { decrement: amount } },
      });

      await tx.treasuryAccount.update({
        where: { id: to.id },
        data: { balance: { increment: amount } },
      });

      const description =
        data.description ?? `انتقال از ${from.name} به ${to.name}`;

      const outTx = await tx.treasuryTransaction.create({
        data: {
          companyId,
          accountId: from.id,
          type: 'TRANSFER_OUT' as never,
          amount,
          description,
        },
      });

      const inTx = await tx.treasuryTransaction.create({
        data: {
          companyId,
          accountId: to.id,
          type: 'TRANSFER_IN' as never,
          amount,
          description,
          reference: outTx.id,
        },
      });

      return { out: outTx, in: inTx };
    });
  }

  // ---------- آمار ----------

  async stats(companyId: string) {
    const accounts = await this.prisma.treasuryAccount.findMany({
      where: { companyId, isActive: true },
    });

    const totalBalance = accounts.reduce(
      (sum: number, account: any) => sum + Number(account.balance),
      0,
    );

    const byType: Record<string, number> = {};

    for (const account of accounts as Array<any>) {
      byType[account.type] = (byType[account.type] ?? 0) + Number(account.balance);
    }

    const recentTransactions = await this.prisma.treasuryTransaction.findMany({
      where: { companyId },
      include: { account: { select: { id: true, name: true } } },
      orderBy: { date: 'desc' },
      take: 10,
    });

    return {
      accountsCount: accounts.length,
      totalBalance,
      byType,
      recentTransactions,
    };
  }
}
