import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    companyId: string,
    search?: string,
    page?: number,
    limit?: number,
  ) {
    const where: Record<string, unknown> = {
      companyId,
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const take = limit && limit > 0 ? Math.min(limit, 200) : undefined;
    const skip = take && page && page > 1 ? (page - 1) * take : undefined;

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where: where as never,
        include: {
          _count: { select: { sales: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...(take ? { take, skip: skip ?? 0 } : {}),
      }),
      this.prisma.customer.count({ where: where as never }),
    ]);

    if (!take) {
      return data;
    }

    return {
      data,
      total,
      page: page && page > 0 ? page : 1,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  async findOne(id: string, companyId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId },
      include: {
        sales: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            invoiceNo: true,
            status: true,
            total: true,
            createdAt: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('مشتری یافت نشد');
    }

    return customer;
  }

  async create(
    companyId: string,
    data: {
      firstName: string;
      lastName?: string;
      phone?: string;
      email?: string;
      nationalCode?: string;
      address?: string;
      creditLimit?: number;
    },
  ) {
    return this.prisma.customer.create({
      data: { ...data, companyId },
    });
  }

  async update(
    id: string,
    companyId: string,
    data: Record<string, unknown>,
  ) {
    await this.findOne(id, companyId);

    return this.prisma.customer.update({
      where: { id },
      data: data as never,
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);

    return this.prisma.customer.delete({ where: { id } });
  }
}
