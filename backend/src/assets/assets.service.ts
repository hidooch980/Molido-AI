import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: any = {}) {
    return this.prisma.asset.findMany({
      where: { companyId, ...this.buildFilter(query) },
      orderBy: { createdAt: 'desc' },
      take: query.limit ? Number(query.limit) : 50,
    });
  }

  async findOne(companyId: string, id: string) {
    const item = await this.prisma.asset.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('اموال یافت نشد');
    return item;
  }

  async create(companyId: string, data: any) {
    return this.prisma.asset.create({ data: { ...data, companyId } });
  }

  async update(companyId: string, id: string, data: any) {
    await this.findOne(companyId, id);
    return this.prisma.asset.update({ where: { id }, data });
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    return this.prisma.asset.delete({ where: { id } });
  }

  async stats(companyId: string) {
    const total = await this.prisma.asset.count({ where: { companyId } });
    return { total };
  }

  private buildFilter(query: any) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.search) {
      // subclasses override
    }
    return where;
  }

}
