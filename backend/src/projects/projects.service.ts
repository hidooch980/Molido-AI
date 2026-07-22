import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: any = {}) {
    return this.prisma.project.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: query.limit ? Number(query.limit) : 50,
    });
  }

  async findOne(companyId: string, id: string) {
    const item = await this.prisma.project.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('مدیریت پروژه یافت نشد');
    return item;
  }

  async create(companyId: string, data: any) {
    return this.prisma.project.create({ data: { ...data, companyId } });
  }

  async update(companyId: string, id: string, data: any) {
    await this.findOne(companyId, id);
    return this.prisma.project.update({ where: { id }, data });
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    return this.prisma.project.delete({ where: { id } });
  }

  async stats(companyId: string) {
    const total = await this.prisma.project.count({ where: { companyId } });
    return { total };
  }
}
