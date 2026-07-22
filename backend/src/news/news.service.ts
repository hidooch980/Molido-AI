import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: any = {}) {
    return this.prisma.newsPost.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: query.limit ? Number(query.limit) : 50,
    });
  }

  async findOne(companyId: string, id: string) {
    const item = await this.prisma.newsPost.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('روابط عمومی یافت نشد');
    return item;
  }

  async create(companyId: string, data: any) {
    return this.prisma.newsPost.create({ data: { ...data, companyId } });
  }

  async update(companyId: string, id: string, data: any) {
    await this.findOne(companyId, id);
    return this.prisma.newsPost.update({ where: { id }, data });
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    return this.prisma.newsPost.delete({ where: { id } });
  }

  async stats(companyId: string) {
    const total = await this.prisma.newsPost.count({ where: { companyId } });
    return { total };
  }
}
