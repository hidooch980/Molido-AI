import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: any = {}) {
    return this.prisma.shipment.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: query.limit ? Number(query.limit) : 50,
    });
  }

  async findOne(companyId: string, id: string) {
    const item = await this.prisma.shipment.findFirst({ where: { id, companyId } });
    if (!item) throw new NotFoundException('ارسال‌ها یافت نشد');
    return item;
  }

  async create(companyId: string, data: any) {
    return this.prisma.shipment.create({ data: { ...data, companyId } });
  }

  async update(companyId: string, id: string, data: any) {
    await this.findOne(companyId, id);
    return this.prisma.shipment.update({ where: { id }, data });
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    return this.prisma.shipment.delete({ where: { id } });
  }

  async stats(companyId: string) {
    const total = await this.prisma.shipment.count({ where: { companyId } });
    return { total };
  }
}
