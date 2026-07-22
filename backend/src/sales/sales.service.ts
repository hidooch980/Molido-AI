import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { N8nService } from '../n8n/n8n.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly n8n: N8nService,
  ) {}

  async findAll(
    companyId: string,
    options?: {
      status?: string;
      from?: string;
      to?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const where: Record<string, unknown> = {
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
    };

    const take =
      options?.limit && options.limit > 0
        ? Math.min(options.limit, 200)
        : undefined;
    const skip =
      take && options?.page && options.page > 1
        ? (options.page - 1) * take
        : undefined;

    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where: where as never,
        include: {
          customer: { select: { id: true, firstName: true, lastName: true } },
          user: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...(take ? { take, skip: skip ?? 0 } : {}),
      }),
      this.prisma.sale.count({ where: where as never }),
    ]);

    if (!take) {
      return data;
    }

    return {
      data,
      total,
      page: options?.page && options.page > 0 ? options.page : 1,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  async findOne(id: string, companyId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, companyId },
      include: {
        customer: true,
        user: { select: { id: true, firstName: true, lastName: true } },
        warehouse: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true } },
          },
        },
        payments: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('فاکتور فروش یافت نشد');
    }

    return sale;
  }

  /**
   * ثبت فاکتور فروش:
   * - محاسبه خودکار مبالغ
   * - کاهش خودکار موجودی انبار (تراکنشی)
   * - ثبت پرداخت و به‌روزرسانی صندوق (اختیاری)
   */
  async create(dto: CreateSaleDto, companyId: string, userId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const warehouse = await tx.warehouse.findFirst({
        where: { id: dto.warehouseId, companyId },
      });

      if (!warehouse) {
        throw new NotFoundException('انبار یافت نشد');
      }

      const productIds = dto.items.map((item: any) => item.productId);

      const products = await tx.product.findMany({
        where: { id: { in: productIds }, companyId },
      });

      if (products.length !== productIds.length) {
        throw new BadRequestException('برخی کالاها یافت نشدند');
      }

      const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));

      let subtotal = 0;

      const itemsData = dto.items.map((item: any) => {
        const product = productMap.get(item.productId)!;
        const price = item.price ?? Number(product.salePrice);
        const discount = item.discount ?? 0;
        const total = price * item.quantity - discount;

        subtotal += total;

        return {
          productId: item.productId,
          quantity: item.quantity,
          price,
          discount,
          total,
        };
      });

      const discount = dto.discount ?? 0;
      const tax = dto.tax ?? 0;
      const total = subtotal - discount + tax;

      if (total < 0) {
        throw new BadRequestException('مبلغ فاکتور نامعتبر است');
      }

      // کاهش موجودی انبار
      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;

        if (!product.trackInventory) {
          continue;
        }

        const inventory = await tx.inventory.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: dto.warehouseId,
              productId: item.productId,
            },
          },
        });

        if (!inventory || Number(inventory.quantity) < item.quantity) {
          throw new BadRequestException(
            `موجودی کالای «${product.name}» کافی نیست`,
          );
        }

        await tx.inventory.update({
          where: { id: inventory.id },
          data: { quantity: Number(inventory.quantity) - item.quantity },
        });
      }

      const paidAmount = dto.paidAmount ?? 0;

      const status =
        paidAmount >= total ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'PENDING';

      const sale = await tx.sale.create({
        data: {
          companyId,
          customerId: dto.customerId ?? null,
          userId,
          warehouseId: dto.warehouseId,
          invoiceNo: `INV-${Date.now()}`,
          status: status as never,
          subtotal,
          discount,
          tax,
          total,
          note: dto.note,
          items: { create: itemsData },
        },
        include: { items: true },
      });

      // ثبت پرداخت
      if (paidAmount > 0) {
        await tx.payment.create({
          data: {
            saleId: sale.id,
            cashBoxId: dto.cashBoxId ?? null,
            method: (dto.paymentMethod ?? 'CASH') as never,
            status: 'COMPLETED',
            amount: Math.min(paidAmount, total),
          },
        });

        if (dto.cashBoxId) {
          await tx.cashBox.update({
            where: { id: dto.cashBoxId },
            data: { balance: { increment: Math.min(paidAmount, total) } },
          });
        }
      }

      return sale;
    });
  }

  /**
   * لغو فاکتور و برگرداندن موجودی
   */
  async cancel(id: string, companyId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const sale = await tx.sale.findFirst({
        where: { id, companyId },
        include: { items: true },
      });

      if (!sale) {
        throw new NotFoundException('فاکتور فروش یافت نشد');
      }

      if (sale.status === 'CANCELLED') {
        throw new BadRequestException('فاکتور قبلاً لغو شده است');
      }

      // برگرداندن موجودی
      for (const item of sale.items) {
        await tx.inventory.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: sale.warehouseId,
              productId: item.productId,
            },
          },
          create: {
            warehouseId: sale.warehouseId,
            productId: item.productId,
            quantity: item.quantity,
          },
          update: { quantity: { increment: Number(item.quantity) } },
        });
      }

      return tx.sale.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
    });
  }

  /**
   * فاکتور چاپی HTML (راست‌به‌چپ)
   */
  async printInvoice(id: string, companyId: string) {
    const sale: any = await this.findOne(id, companyId);

    const customerName = sale.customer
      ? `${sale.customer.firstName} ${sale.customer.lastName ?? ''}`.trim()
      : 'مشتری نقدی';

    const rows = (sale.items as Array<any>)
      .map(
        (item: any, index: number) =>
          `<tr><td>${index + 1}</td><td>${item.product?.name ?? '-'}</td><td>${Number(
            item.quantity ?? 0,
          )}</td><td>${Number(item.unitPrice ?? item.price ?? 0).toLocaleString(
            'fa-IR',
          )}</td><td>${Number(item.total ?? item.subtotal ?? 0).toLocaleString(
            'fa-IR',
          )}</td></tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
<meta charset="utf-8" />
<title>فاکتور ${sale.invoiceNo}</title>
<style>
  body { font-family: Tahoma, 'Vazirmatn', sans-serif; margin: 24px; color: #222; }
  .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #999; padding: 8px; text-align: center; }
  th { background: #f0f0f0; }
  .totals { margin-top: 16px; width: 300px; margin-right: auto; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .grand { font-weight: bold; border-top: 1px solid #333; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h2>فاکتور فروش</h2>
      <div>شماره: ${sale.invoiceNo}</div>
      <div>تاریخ: ${new Date(sale.createdAt).toLocaleDateString('fa-IR')}</div>
    </div>
    <div>
      <div>مشتری: ${customerName}</div>
      <div>وضعیت: ${sale.status}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>کالا</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>جمع کل:</span><span>${Number(sale.subtotal).toLocaleString('fa-IR')}</span></div>
    <div><span>تخفیف:</span><span>${Number(sale.discount).toLocaleString('fa-IR')}</span></div>
    <div><span>مالیات:</span><span>${Number(sale.tax).toLocaleString('fa-IR')}</span></div>
    <div class="grand"><span>مبلغ نهایی:</span><span>${Number(sale.total).toLocaleString('fa-IR')}</span></div>
  </div>
  <button class="no-print" onclick="window.print()">چاپ</button>
</body>
</html>`;
  }

  /**
   * تعریف اقساط برای مانده فاکتور
   */
  async createInstallments(
    id: string,
    companyId: string,
    options: { count: number; intervalDays?: number; startDate?: string },
  ) {
    const count = Math.floor(options?.count ?? 0);

    if (!count || count < 2 || count > 60) {
      throw new BadRequestException('تعداد اقساط باید بین ۲ تا ۶۰ باشد');
    }

    const sale: any = await this.findOne(id, companyId);

    if (['CANCELLED', 'RETURNED'].includes(sale.status)) {
      throw new BadRequestException('برای فاکتور لغوشده نمی‌توان قسط تعریف کرد');
    }

    const existing = await this.prisma.installment.count({
      where: { saleId: sale.id },
    });

    if (existing > 0) {
      throw new BadRequestException('برای این فاکتور قبلاً اقساط تعریف شده است');
    }

    const paid = ((sale.payments ?? []) as Array<any>)
      .filter((payment: any) => payment.status === 'COMPLETED')
      .reduce((sum: number, payment: any) => sum + Number(payment.amount), 0);

    const remaining = Number(sale.total) - paid;

    if (remaining <= 0) {
      throw new BadRequestException('این فاکتور مانده‌ای برای تقسیط ندارد');
    }

    const intervalDays =
      options?.intervalDays && options.intervalDays > 0
        ? options.intervalDays
        : 30;
    const start = options?.startDate ? new Date(options.startDate) : new Date();

    const base = Math.floor((remaining / count) * 100) / 100;

    const data = Array.from({ length: count }, (_, i) => {
      const dueDate = new Date(start);
      dueDate.setDate(dueDate.getDate() + i * intervalDays);

      const amount =
        i === count - 1
          ? Math.round((remaining - base * (count - 1)) * 100) / 100
          : base;

      return {
        saleId: sale.id,
        seq: i + 1,
        dueDate,
        amount,
        status: 'PENDING' as never,
      };
    });

    await this.prisma.installment.createMany({ data });

    return this.listInstallments(id, companyId);
  }

  async listInstallments(id: string, companyId: string) {
    const sale: any = await this.findOne(id, companyId);

    return this.prisma.installment.findMany({
      where: { saleId: sale.id },
      orderBy: { seq: 'asc' },
    });
  }

  /**
   * پرداخت قسط (اختیاری: واریز به صندوق و ثبت پرداخت)
   */
  async payInstallment(
    installmentId: string,
    companyId: string,
    cashBoxId?: string,
  ) {
    const installment: any = await this.prisma.installment.findFirst({
      where: { id: installmentId, sale: { companyId } },
      include: { sale: true },
    });

    if (!installment) {
      throw new NotFoundException('قسط یافت نشد');
    }

    if (installment.status === 'PAID') {
      throw new BadRequestException('این قسط قبلاً پرداخت شده است');
    }

    return this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.installment.update({
        where: { id: installmentId },
        data: { status: 'PAID', paidAt: new Date() },
      });

      if (cashBoxId) {
        const cashBox = await tx.cashBox.findFirst({
          where: { id: cashBoxId, companyId },
        });

        if (!cashBox) {
          throw new NotFoundException('صندوق یافت نشد');
        }

        await tx.payment.create({
          data: {
            saleId: installment.saleId,
            cashBoxId,
            amount: installment.amount,
            method: 'CASH',
            status: 'COMPLETED',
          },
        });

        await tx.cashBox.update({
          where: { id: cashBoxId },
          data: { balance: { increment: installment.amount } },
        });

        const payments = await tx.payment.findMany({
          where: { saleId: installment.saleId, status: 'COMPLETED' },
        });

        const paidSum = payments.reduce(
          (sum: number, payment: any) => sum + Number(payment.amount),
          0,
        );

        await tx.sale.update({
          where: { id: installment.saleId },
          data: {
            status:
              paidSum >= Number(installment.sale.total) ? 'PAID' : 'PARTIAL',
          },
        });
      }

      return updated;
    });
  }

}
