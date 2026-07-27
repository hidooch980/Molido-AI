import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * مرجوعی کالا از مشتری.
 *
 * ثبت مرجوعی فقط سند می‌سازد؛ موجودی انبار تنها هنگام «بازگشت به انبار»
 * (restock) افزایش می‌یابد تا کالای معیوب اشتباهاً قابل فروش نشود.
 */
@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: any = {}) {
    return this.prisma.productReturn.findMany({
      where: {
        companyId,
        ...(query.status ? { status: query.status } : {}),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: query.limit ? Number(query.limit) : 50,
    });
  }

  async findOne(companyId: string, id: string) {
    const item = await this.prisma.productReturn.findFirst({
      where: { id, companyId },
      include: { items: true },
    });

    if (!item) throw new NotFoundException('مرجوعی کالا یافت نشد');

    return item;
  }

  /** شماره مرجوعی ترتیبی روزانه: RET-YYMMDD-0001 */
  private async nextReturnNo(tx: any) {
    const now = new Date();
    const prefix =
      `RET-${String(now.getFullYear()).slice(2)}` +
      `${String(now.getMonth() + 1).padStart(2, '0')}` +
      `${String(now.getDate()).padStart(2, '0')}-`;

    const last = await tx.productReturn.findFirst({
      where: { returnNo: { startsWith: prefix } },
      orderBy: { returnNo: 'desc' },
      select: { returnNo: true },
    });

    const seq = last ? Number(last.returnNo.slice(prefix.length)) + 1 : 1;

    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  /**
   * ثبت مرجوعی. مبلغ کل از روی اقلام محاسبه می‌شود تا کاربر نتواند
   * مبلغ دلخواه بفرستد.
   */
  async create(companyId: string, data: any) {
    const items: any[] = Array.isArray(data?.items) ? data.items : [];

    if (items.length === 0) {
      throw new BadRequestException('حداقل یک قلم کالا لازم است');
    }

    const totalAmount = items.reduce(
      (sum, i) => sum + Number(i.qty ?? 0) * Number(i.unitPrice ?? 0),
      0,
    );

    return this.prisma.$transaction(async (tx: any) =>
      tx.productReturn.create({
        data: {
          companyId,
          returnNo: await this.nextReturnNo(tx),
          saleId: data.saleId ?? null,
          customerId: data.customerId ?? null,
          reason: data.reason ?? 'OTHER',
          status: 'PENDING',
          totalAmount,
          note: data.note ?? null,
          items: {
            create: items.map((i) => ({
              productId: i.productId ?? null,
              name: String(i.name ?? ''),
              qty: Number(i.qty ?? 0),
              unitPrice: Number(i.unitPrice ?? 0),
            })),
          },
        },
        include: { items: true },
      }),
    );
  }

  /**
   * بازگشت کالا به انبار — موجودی را افزایش می‌دهد و وضعیت را
   * RESTOCKED می‌کند. فقط یک بار قابل اجراست.
   */
  async restock(companyId: string, id: string, warehouseId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const ret = await tx.productReturn.findFirst({
        where: { id, companyId },
        include: { items: true },
      });

      if (!ret) throw new NotFoundException('مرجوعی کالا یافت نشد');

      if (ret.status === 'RESTOCKED') {
        throw new BadRequestException('این مرجوعی قبلاً به انبار برگشته است');
      }

      const warehouse = await tx.warehouse.findFirst({
        where: { id: warehouseId, companyId },
      });

      if (!warehouse) throw new NotFoundException('انبار یافت نشد');

      for (const item of ret.items) {
        if (!item.productId) continue;

        await tx.inventory.upsert({
          where: {
            warehouseId_productId: {
              warehouseId,
              productId: item.productId,
            },
          },
          create: {
            warehouseId,
            productId: item.productId,
            quantity: Number(item.qty),
          },
          update: { quantity: { increment: Number(item.qty) } },
        });
      }

      return tx.productReturn.update({
        where: { id },
        data: { status: 'RESTOCKED' },
        include: { items: true },
      });
    });
  }

  /** بازپرداخت وجه به مشتری — از صندوق کسر می‌شود. */
  async refund(companyId: string, id: string, cashBoxId?: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const ret = await tx.productReturn.findFirst({
        where: { id, companyId },
      });

      if (!ret) throw new NotFoundException('مرجوعی کالا یافت نشد');

      if (ret.status === 'REFUNDED') {
        throw new BadRequestException('وجه این مرجوعی قبلاً بازپرداخت شده است');
      }

      if (cashBoxId) {
        const box = await tx.cashBox.findFirst({
          where: { id: cashBoxId, companyId },
        });

        if (!box) throw new NotFoundException('صندوق یافت نشد');

        if (Number(box.balance) < Number(ret.totalAmount)) {
          throw new BadRequestException(
            'موجودی صندوق برای بازپرداخت کافی نیست',
          );
        }

        await tx.cashBox.update({
          where: { id: cashBoxId },
          data: { balance: { decrement: Number(ret.totalAmount) } },
        });
      }

      return tx.productReturn.update({
        where: { id },
        data: { status: 'REFUNDED' },
      });
    });
  }

  async update(companyId: string, id: string, data: any) {
    await this.findOne(companyId, id);

    // مبلغ، شماره و اقلام نباید از بیرون دستکاری شوند.
    const {
      totalAmount: _t,
      returnNo: _r,
      companyId: _c,
      items: _i,
      ...safe
    } = data ?? {};

    return this.prisma.productReturn.update({ where: { id }, data: safe });
  }

  async remove(companyId: string, id: string) {
    const ret = await this.findOne(companyId, id);

    if (ret.status === 'RESTOCKED' || ret.status === 'REFUNDED') {
      throw new BadRequestException(
        'مرجوعی پردازش‌شده قابل حذف نیست — آن را رد (REJECTED) کنید',
      );
    }

    return this.prisma.productReturn.delete({ where: { id } });
  }

  async stats(companyId: string) {
    const [total, pending, restocked, refunded] = await Promise.all([
      this.prisma.productReturn.count({ where: { companyId } }),
      this.prisma.productReturn.count({
        where: { companyId, status: 'PENDING' },
      }),
      this.prisma.productReturn.count({
        where: { companyId, status: 'RESTOCKED' },
      }),
      this.prisma.productReturn.count({
        where: { companyId, status: 'REFUNDED' },
      }),
    ]);

    return { total, pending, restocked, refunded };
  }
}
