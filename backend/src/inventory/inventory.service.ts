import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, warehouseId?: string) {
    return this.prisma.inventory.findMany({
      where: {
        warehouse: { companyId },
        ...(warehouseId ? { warehouseId } : {}),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
            minStock: true,
            salePrice: true,
          },
        },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const inventory = await this.prisma.inventory.findFirst({
      where: { id, warehouse: { companyId } },
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (!inventory) {
      throw new NotFoundException('رکورد موجودی یافت نشد');
    }

    return inventory;
  }

  /**
   * تنظیم دستی موجودی (افزایش یا کاهش)
   */
  async adjust(
    companyId: string,
    data: { productId: string; warehouseId: string; quantityChange: number },
  ) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: data.warehouseId, companyId },
    });

    if (!warehouse) {
      throw new NotFoundException('انبار یافت نشد');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, companyId },
    });

    if (!product) {
      throw new NotFoundException('کالا یافت نشد');
    }

    const existing = await this.prisma.inventory.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: data.warehouseId,
          productId: data.productId,
        },
      },
    });

    const currentQty = existing ? Number(existing.quantity) : 0;
    const newQty = currentQty + data.quantityChange;

    if (newQty < 0) {
      throw new BadRequestException('موجودی نمی‌تواند منفی شود');
    }

    return this.prisma.inventory.upsert({
      where: {
        warehouseId_productId: {
          warehouseId: data.warehouseId,
          productId: data.productId,
        },
      },
      create: {
        warehouseId: data.warehouseId,
        productId: data.productId,
        quantity: newQty,
      },
      update: { quantity: newQty },
    });
  }

  /**
   * انتقال موجودی بین دو انبار
   */
  async transfer(
    companyId: string,
    data: {
      productId: string;
      fromWarehouseId: string;
      toWarehouseId: string;
      quantity: number;
    },
  ) {
    if (data.quantity <= 0) {
      throw new BadRequestException('مقدار انتقال باید بزرگ‌تر از صفر باشد');
    }

    if (data.fromWarehouseId === data.toWarehouseId) {
      throw new BadRequestException('انبار مبدأ و مقصد یکسان است');
    }

    return this.prisma.$transaction(async (tx: any) => {
      const source = await tx.inventory.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: data.fromWarehouseId,
            productId: data.productId,
          },
        },
      });

      if (!source || Number(source.quantity) < data.quantity) {
        throw new BadRequestException('موجودی انبار مبدأ کافی نیست');
      }

      await tx.inventory.update({
        where: { id: source.id },
        data: { quantity: Number(source.quantity) - data.quantity },
      });

      return tx.inventory.upsert({
        where: {
          warehouseId_productId: {
            warehouseId: data.toWarehouseId,
            productId: data.productId,
          },
        },
        create: {
          warehouseId: data.toWarehouseId,
          productId: data.productId,
          quantity: data.quantity,
        },
        update: { quantity: { increment: data.quantity } },
      });
    });
  }

  async lowStock(companyId: string) {
    const inventories = await this.prisma.inventory.findMany({
      where: { warehouse: { companyId } },
      include: {
        product: {
          select: { id: true, name: true, sku: true, minStock: true, unit: true },
        },
        warehouse: { select: { id: true, name: true } },
      },
    });

    return inventories.filter(
      (inv: any) => Number(inv.quantity) <= Number(inv.product.minStock),
    );
  }
}
