import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const STATUS_TRANSITIONS: Record<string, Array<string>> = {
  REGISTERED: ['DEPOSITED', 'RETURNED'],
  DEPOSITED: ['CLEARED', 'BOUNCED'],
  CLEARED: [],
  BOUNCED: ['DEPOSITED', 'RETURNED'],
  RETURNED: [],
};

@Injectable()
export class ChequesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    options?: { status?: string; type?: string; dueSoon?: boolean },
  ) {
    const dueLimit = new Date();
    dueLimit.setDate(dueLimit.getDate() + 7);

    return this.prisma.cheque.findMany({
      where: {
        companyId,
        ...(options?.status ? { status: options.status as never } : {}),
        ...(options?.type ? { type: options.type as never } : {}),
        ...(options?.dueSoon
          ? {
              dueDate: { lte: dueLimit },
              status: { in: ['REGISTERED', 'DEPOSITED'] as never },
            }
          : {}),
      },
      include: {
        sale: { select: { id: true, invoiceNo: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const cheque = await this.prisma.cheque.findFirst({
      where: { id, companyId },
      include: { sale: { select: { id: true, invoiceNo: true, total: true } } },
    });

    if (!cheque) {
      throw new NotFoundException('چک یافت نشد');
    }

    return cheque;
  }

  async create(
    companyId: string,
    data: {
      chequeNo: string;
      bankName?: string;
      dueDate: string;
      amount: number;
      type?: string;
      ownerName?: string;
      note?: string;
      saleId?: string;
    },
  ) {
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('مبلغ چک باید بزرگ‌تر از صفر باشد');
    }

    if (data.saleId) {
      const sale = await this.prisma.sale.findFirst({
        where: { id: data.saleId, companyId },
      });

      if (!sale) {
        throw new NotFoundException('فاکتور مرتبط یافت نشد');
      }
    }

    return this.prisma.cheque.create({
      data: {
        companyId,
        chequeNo: data.chequeNo,
        bankName: data.bankName,
        dueDate: new Date(data.dueDate),
        amount: data.amount,
        type: (data.type ?? 'RECEIVED') as never,
        status: 'REGISTERED',
        ownerName: data.ownerName,
        note: data.note,
        saleId: data.saleId,
      },
    });
  }

  /**
   * تغییر وضعیت چک: ثبت‌شده ← واگذار/خوابانده ← وصول یا برگشتی
   */
  async updateStatus(id: string, companyId: string, status: string) {
    const cheque = await this.findOne(id, companyId);

    const allowed = STATUS_TRANSITIONS[cheque.status] ?? [];

    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `تغییر وضعیت از ${cheque.status} به ${status} مجاز نیست`,
      );
    }

    return this.prisma.cheque.update({
      where: { id },
      data: { status: status as never },
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);

    return this.prisma.cheque.delete({ where: { id } });
  }

  async stats(companyId: string) {
    const cheques = await this.prisma.cheque.findMany({
      where: { companyId },
      select: { status: true, type: true, amount: true, dueDate: true },
    });

    const typed = cheques as Array<{
      status: string;
      type: string;
      amount: unknown;
      dueDate: Date;
    }>;

    const now = new Date();
    const dueLimit = new Date();
    dueLimit.setDate(dueLimit.getDate() + 7);

    const open = typed.filter((c: any) =>
      ['REGISTERED', 'DEPOSITED'].includes(c.status),
    );

    return {
      total: typed.length,
      openCount: open.length,
      openAmount: open.reduce(
        (acc: number, c) => acc + Number(c.amount ?? 0),
        0,
      ),
      dueSoon: open.filter(
        (c) => new Date(c.dueDate) <= dueLimit && new Date(c.dueDate) >= now,
      ).length,
      overdue: open.filter((c: any) => new Date(c.dueDate) < now).length,
      bounced: typed.filter((c: any) => c.status === 'BOUNCED').length,
      cleared: typed.filter((c: any) => c.status === 'CLEARED').length,
    };
  }
}
