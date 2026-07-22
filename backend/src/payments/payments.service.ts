import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, saleId?: string) {
    return this.prisma.payment.findMany({
      where: {
        ...(saleId ? { saleId } : {}),
        OR: [
          { sale: { companyId } },
          { cashBox: { companyId } },
        ],
      },
      include: {
        sale: { select: { id: true, invoiceNo: true, total: true } },
        cashBox: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id,
        OR: [{ sale: { companyId } }, { cashBox: { companyId } }],
      },
      include: { sale: true, cashBox: true },
    });

    if (!payment) {
      throw new NotFoundException('پرداخت یافت نشد');
    }

    return payment;
  }

  /**
   * ثبت پرداخت برای فاکتور فروش + به‌روزرسانی وضعیت فاکتور و صندوق
   */
  async create(
    companyId: string,
    data: {
      saleId: string;
      amount: number;
      method?: string;
      cashBoxId?: string;
      referenceNo?: string;
      note?: string;
    },
  ) {
    if (data.amount <= 0) {
      throw new BadRequestException('مبلغ پرداخت باید بزرگ‌تر از صفر باشد');
    }

    return this.prisma.$transaction(async (tx: any) => {
      const sale = await tx.sale.findFirst({
        where: { id: data.saleId, companyId },
        include: { payments: { where: { status: 'COMPLETED' } } },
      });

      if (!sale) {
        throw new NotFoundException('فاکتور فروش یافت نشد');
      }

      if (sale.status === 'CANCELLED') {
        throw new BadRequestException('فاکتور لغوشده قابل پرداخت نیست');
      }

      const paidSoFar = sale.payments.reduce((sum: number, p: any) => sum + Number(p.amount),
        0,
      );

      const remaining = Number(sale.total) - paidSoFar;

      if (data.amount > remaining) {
        throw new BadRequestException(
          `مبلغ پرداخت بیشتر از مانده فاکتور (${remaining}) است`,
        );
      }

      const payment = await tx.payment.create({
        data: {
          saleId: data.saleId,
          cashBoxId: data.cashBoxId ?? null,
          method: (data.method ?? 'CASH') as never,
          status: 'COMPLETED',
          amount: data.amount,
          referenceNo: data.referenceNo,
          note: data.note,
        },
      });

      if (data.cashBoxId) {
        await tx.cashBox.update({
          where: { id: data.cashBoxId },
          data: { balance: { increment: data.amount } },
        });
      }

      const newPaid = paidSoFar + data.amount;

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: newPaid >= Number(sale.total) ? 'PAID' : 'PARTIAL',
        },
      });

      return payment;
    });
  }
}
