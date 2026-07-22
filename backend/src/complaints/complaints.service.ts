import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { N8nService } from '../n8n/n8n.service';

const COMPLAINT_STATUSES = [
  'REGISTERED',
  'REFERRED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
];

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly n8n: N8nService,
  ) {}

  async findAll(
    companyId: string,
    options?: { status?: string; category?: string; search?: string },
  ) {
    return this.prisma.citizenComplaint.findMany({
      where: {
        companyId,
        ...(options?.status ? { status: options.status as never } : {}),
        ...(options?.category ? { category: options.category as never } : {}),
        ...(options?.search
          ? {
              OR: [
                { subject: { contains: options.search, mode: 'insensitive' } },
                { citizenName: { contains: options.search, mode: 'insensitive' } },
                { trackingNo: { contains: options.search } },
                { address: { contains: options.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const complaint = await this.prisma.citizenComplaint.findFirst({
      where: { id, companyId },
    });

    if (!complaint) {
      throw new NotFoundException('پیام شهروندی یافت نشد');
    }

    return complaint;
  }

  /**
   * پیگیری با کد رهگیری (بدون نیاز به ورود — مخصوص شهروندان)
   */
  async track(trackingNo: string) {
    const complaint = await this.prisma.citizenComplaint.findUnique({
      where: { trackingNo },
      select: {
        trackingNo: true,
        category: true,
        status: true,
        subject: true,
        referredTo: true,
        responseNote: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!complaint) {
      throw new NotFoundException('کد رهگیری نامعتبر است');
    }

    return complaint;
  }

  async create(
    companyId: string,
    data: {
      category?: string;
      citizenName?: string;
      citizenPhone?: string;
      address?: string;
      subject: string;
      description?: string;
    },
  ) {
    return this.prisma.citizenComplaint.create({
      data: {
        companyId,
        trackingNo: `137-${Date.now()}`,
        category: (data.category ?? 'OTHER') as never,
        status: 'REGISTERED',
        citizenName: data.citizenName,
        citizenPhone: data.citizenPhone,
        address: data.address,
        subject: data.subject,
        description: data.description,
      },
    });
  }

  /**
   * ارجاع به واحد مربوطه (مثلاً دفتر فنی، فضای سبز، پسماند)
   */
  async refer(id: string, companyId: string, referredTo: string) {
    if (!referredTo) {
      throw new BadRequestException('نام واحد مقصد الزامی است');
    }

    await this.findOne(id, companyId);

    return this.prisma.citizenComplaint.update({
      where: { id },
      data: { status: 'REFERRED', referredTo },
    });
  }

  async updateStatus(
    id: string,
    companyId: string,
    data: { status: string; responseNote?: string },
  ) {
    if (!COMPLAINT_STATUSES.includes(data.status)) {
      throw new BadRequestException('وضعیت نامعتبر است');
    }

    await this.findOne(id, companyId);

    return this.prisma.citizenComplaint.update({
      where: { id },
      data: {
        status: data.status as never,
        ...(data.responseNote !== undefined
          ? { responseNote: data.responseNote }
          : {}),
      },
    });
  }

  async stats(companyId: string) {
    const complaints = await this.prisma.citizenComplaint.findMany({
      where: { companyId },
      select: { status: true, category: true },
    });

    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const c of complaints as Array<{ status: string; category: string }>) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    }

    return {
      total: complaints.length,
      open:
        (byStatus['REGISTERED'] ?? 0) +
        (byStatus['REFERRED'] ?? 0) +
        (byStatus['IN_PROGRESS'] ?? 0),
      byStatus,
      byCategory,
    };
  }
}
