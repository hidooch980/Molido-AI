import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    options?: {
      search?: string;
      categoryId?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const where: Record<string, unknown> = {
      companyId,
      ...(options?.categoryId ? { categoryId: options.categoryId } : {}),
      ...(options?.status ? { status: options.status as never } : {}),
      ...(options?.search
        ? {
            OR: [
              { name: { contains: options.search, mode: 'insensitive' } },
              { sku: { contains: options.search, mode: 'insensitive' } },
              { barcode: { contains: options.search } },
            ],
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
      this.prisma.product.findMany({
        where: where as never,
        include: {
          category: { select: { id: true, name: true } },
          inventories: { select: { warehouseId: true, quantity: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...(take ? { take, skip: skip ?? 0 } : {}),
      }),
      this.prisma.product.count({ where: where as never }),
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
    const product = await this.prisma.product.findFirst({
      where: { id, companyId },
      include: {
        category: true,
        variants: true,
        inventories: {
          include: {
            warehouse: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('کالا یافت نشد');
    }

    return product;
  }

  async findByBarcode(barcode: string, companyId: string) {
    const product = await this.prisma.product.findFirst({
      where: { barcode, companyId },
      include: {
        inventories: { select: { warehouseId: true, quantity: true } },
      },
    });

    if (!product) {
      throw new NotFoundException('کالایی با این بارکد یافت نشد');
    }

    return product;
  }

  async create(dto: CreateProductDto, companyId: string) {
    const existing = await this.prisma.product.findFirst({
      where: { companyId, sku: dto.sku },
    });

    if (existing) {
      throw new ConflictException('کالایی با این SKU وجود دارد');
    }

    const { expiryDate, ...rest } = dto;

    return this.prisma.product.create({
      data: {
        ...(rest as never as Record<string, unknown>),
        companyId,
        ...(expiryDate ? { expiryDate: new Date(expiryDate) } : {}),
      } as never,
    });
  }

  async update(id: string, dto: UpdateProductDto, companyId: string) {
    await this.findOne(id, companyId);

    const { expiryDate, ...rest } = dto;

    return this.prisma.product.update({
      where: { id },
      data: {
        ...(rest as never as Record<string, unknown>),
        ...(expiryDate !== undefined
          ? { expiryDate: expiryDate ? new Date(expiryDate) : null }
          : {}),
      } as never,
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);

    return this.prisma.product.delete({ where: { id } });
  }
}
