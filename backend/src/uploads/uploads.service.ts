import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import process from 'node:process';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService) {}

  async saveAttachment(
    companyId: string,
    file: {
      originalname: string;
      filename: string;
      mimetype?: string;
      size?: number;
    } | null,
    meta?: { entityType?: string; entityId?: string },
  ) {
    if (!file) {
      throw new BadRequestException('فایلی ارسال نشده است');
    }

    return this.prisma.attachment.create({
      data: {
        companyId,
        entityType: meta?.entityType ?? 'GENERAL',
        entityId: meta?.entityId ?? '',
        fileName: file.originalname,
        filePath: `/uploads/${file.filename}`,
        mimeType: file.mimetype,
        size: file.size ?? 0,
      },
    });
  }

  async findAll(
    companyId: string,
    options?: { entityType?: string; entityId?: string },
  ) {
    return this.prisma.attachment.findMany({
      where: {
        companyId,
        ...(options?.entityType ? { entityType: options.entityType } : {}),
        ...(options?.entityId ? { entityId: options.entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string, companyId: string) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, companyId },
    });

    if (!attachment) {
      throw new NotFoundException('پیوست یافت نشد');
    }

    await this.prisma.attachment.delete({ where: { id } });

    // حذف فایل فیزیکی (در صورت خطا، رکورد حذف شده و فایل باقی می‌ماند)
    try {
      await unlink(
        join(process.cwd(), 'uploads', basename(attachment.filePath)),
      );
    } catch {
      // ignore
    }

    return { deleted: true, id };
  }
}
