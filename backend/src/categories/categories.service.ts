import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.category.findMany({
      where: { companyId },
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { products: true, children: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, companyId },
      include: {
        parent: true,
        children: true,
        products: {
          select: { id: true, name: true, sku: true, salePrice: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }

    return category;
  }

  async create(
    companyId: string,
    data: { name: string; description?: string; parentId?: string },
  ) {
    return this.prisma.category.create({
      data: { ...data, companyId },
    });
  }

  async update(
    id: string,
    companyId: string,
    data: { name?: string; description?: string; parentId?: string | null },
  ) {
    await this.findOne(id, companyId);

    return this.prisma.category.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);

    return this.prisma.category.delete({ where: { id } });
  }
}
