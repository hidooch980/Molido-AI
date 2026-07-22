import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CashBoxService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.cashBox.findMany({
      where: { companyId },
      include: {
        _count: { select: { payments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const cashBox = await this.prisma.cashBox.findFirst({
      where: { id, companyId },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
      },
    });

    if (!cashBox) {
      throw new NotFoundException('صندوق یافت نشد');
    }

    return cashBox;
  }

  async create(
    companyId: string,
    data: { name: string; code: string; balance?: number },
  ) {
    return this.prisma.cashBox.create({
      data: {
        companyId,
        name: data.name,
        code: data.code,
        balance: data.balance ?? 0,
      },
    });
  }

  /**
   * واریز به صندوق
   */
  async deposit(id: string, companyId: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('مبلغ باید بزرگ‌تر از صفر باشد');
    }

    await this.findOne(id, companyId);

    return this.prisma.cashBox.update({
      where: { id },
      data: { balance: { increment: amount } },
    });
  }

  /**
   * برداشت از صندوق
   */
  async withdraw(id: string, companyId: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('مبلغ باید بزرگ‌تر از صفر باشد');
    }

    const cashBox = await this.findOne(id, companyId);

    if (Number(cashBox.balance) < amount) {
      throw new BadRequestException('موجودی صندوق کافی نیست');
    }

    return this.prisma.cashBox.update({
      where: { id },
      data: { balance: { decrement: amount } },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);

    return this.prisma.cashBox.delete({ where: { id } });
  }
}
