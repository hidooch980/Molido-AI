import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.warehouse.findMany({
      where: { companyId },
      include: {
        _count: { select: { inventories: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id, companyId },
      include: {
        inventories: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true },
            },
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException('انبار یافت نشد');
    }

    return warehouse;
  }

  async create(
    companyId: string,
    data: { name: string; code: string; description?: string; branchId?: string },
  ) {
    if (!data.name || !data.code) {
      throw new BadRequestException('نام و کد انبار الزامی است');
    }

    return this.prisma.warehouse.create({
      data: { ...data, companyId },
    });
  }

  async update(
    id: string,
    companyId: string,
    data: { name?: string; code?: string; description?: string },
  ) {
    await this.findOne(id, companyId);

    return this.prisma.warehouse.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);

    return this.prisma.warehouse.delete({ where: { id } });
  }
}
