import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        branches: true,
        warehouses: true,
        _count: {
          select: {
            users: true,
            products: true,
            customers: true,
            suppliers: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('شرکت یافت نشد');
    }

    return company;
  }

  async update(
    id: string,
    data: {
      name?: string;
      legalName?: string;
      phone?: string;
      email?: string;
      website?: string;
      country?: string;
      city?: string;
      address?: string;
      taxNumber?: string;
      logo?: string;
    },
  ) {
    await this.findOne(id);

    return this.prisma.company.update({
      where: { id },
      data,
    });
  }
}
