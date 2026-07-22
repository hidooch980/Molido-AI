import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PriceLevelsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: any = {}) {
    return this.prisma.priceLevel.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: query.limit ? Number(query.limit) : 50,
    });
  }

  async findOne(companyId: string, id: string) {
    const item = await this.prisma.priceLevel.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('سطح قیمت یافت نشد');
    return item;
  }

  async create(companyId: string, data: any) {
    return this.prisma.priceLevel.create({ data: { ...data, companyId } });
  }

  async update(companyId: string, id: string, data: any) {
    await this.findOne(companyId, id);
    return this.prisma.priceLevel.update({ where: { id }, data });
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    return this.prisma.priceLevel.delete({ where: { id } });
  }

  async stats(companyId: string) {
    const total = await this.prisma.priceLevel.count({ where: { companyId } });
    return { total };
  }
}
