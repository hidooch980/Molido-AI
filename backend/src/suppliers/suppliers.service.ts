import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, search?: string) {
    return this.prisma.supplier.findMany({
      where: {
        companyId,
        ...(search
          ? { name: { contains: search, mode: 'insensitive' } }
          : {}),
      },
      include: {
        _count: { select: { purchases: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId },
      include: {
        purchases: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            purchaseNo: true,
            status: true,
            total: true,
            createdAt: true,
          },
        },
      },
    });

    if (!supplier) {
      throw new NotFoundException('تأمین‌کننده یافت نشد');
    }

    return supplier;
  }

  async create(
    companyId: string,
    data: { name: string; phone?: string; email?: string; address?: string },
  ) {
    return this.prisma.supplier.create({
      data: { ...data, companyId },
    });
  }

  async update(
    id: string,
    companyId: string,
    data: Record<string, unknown>,
  ) {
    await this.findOne(id, companyId);

    return this.prisma.supplier.update({
      where: { id },
      data: data as never,
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);

    return this.prisma.supplier.delete({ where: { id } });
  }
}
