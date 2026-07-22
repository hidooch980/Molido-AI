import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, status?: string) {
    return this.prisma.purchase.findMany({
      where: {
        companyId,
        ...(status ? { status: status as never } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, companyId },
      include: {
        supplier: true,
        warehouse: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, unit: true } },
          },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundException('فاکتور خرید یافت نشد');
    }

    return purchase;
  }

  /**
   * ثبت فاکتور خرید (وضعیت اولیه: PENDING)
   */
  async create(dto: CreatePurchaseDto, companyId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, companyId },
    });

    if (!supplier) {
      throw new NotFoundException('تأمین‌کننده یافت نشد');
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, companyId },
    });

    if (!warehouse) {
      throw new NotFoundException('انبار یافت نشد');
    }

    const productIds = dto.items.map((item: any) => item.productId);

    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, companyId },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('برخی کالاها یافت نشدند');
    }

    const productMap = new Map<string, any>(products.map((p: any) => [p.id, p]));

    let subtotal = 0;

    const itemsData = dto.items.map((item: any) => {
      const product = productMap.get(item.productId)!;
      const price = item.purchasePrice ?? Number(product.purchasePrice);
      const total = price * item.quantity;

      subtotal += total;

      return {
        productId: item.productId,
        quantity: item.quantity,
        purchasePrice: price,
        total,
      };
    });

    const discount = dto.discount ?? 0;
    const tax = dto.tax ?? 0;
    const total = subtotal - discount + tax;

    return this.prisma.purchase.create({
      data: {
        companyId,
        supplierId: dto.supplierId,
        warehouseId: dto.warehouseId,
        purchaseNo: `PUR-${Date.now()}`,
        status: 'PENDING',
        subtotal,
        discount,
        tax,
        total,
        note: dto.note,
        items: { create: itemsData },
      },
      include: { items: true },
    });
  }

  /**
   * دریافت کالا: افزایش خودکار موجودی انبار (تراکنشی)
   */
  async receive(id: string, companyId: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const purchase = await tx.purchase.findFirst({
        where: { id, companyId },
        include: { items: true },
      });

      if (!purchase) {
        throw new NotFoundException('فاکتور خرید یافت نشد');
      }

      if (purchase.status === 'RECEIVED') {
        throw new BadRequestException('این فاکتور قبلاً دریافت شده است');
      }

      if (purchase.status === 'CANCELLED') {
        throw new BadRequestException('فاکتور لغوشده قابل دریافت نیست');
      }

      for (const item of purchase.items) {
        await tx.inventory.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: purchase.warehouseId,
              productId: item.productId,
            },
          },
          create: {
            warehouseId: purchase.warehouseId,
            productId: item.productId,
            quantity: item.quantity,
          },
          update: { quantity: { increment: Number(item.quantity) } },
        });
      }

      return tx.purchase.update({
        where: { id },
        data: { status: 'RECEIVED' },
      });
    });
  }

  async cancel(id: string, companyId: string) {
    const purchase = await this.findOne(id, companyId);

    if (purchase.status === 'RECEIVED') {
      throw new BadRequestException(
        'فاکتور دریافت‌شده قابل لغو نیست',
      );
    }

    return this.prisma.purchase.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
