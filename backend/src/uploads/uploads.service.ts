import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import process from 'node:process';

import { DatabaseService } from '../database/database.service';

type Attachment = Record<string, unknown> & { id: string; filePath: string };

@Injectable()
export class UploadsService {
  constructor(private readonly db: DatabaseService) {}

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

    const rows = await this.db.query<Attachment>(
      `INSERT INTO "Attachment"
         (id, "companyId", "entityType", "entityId", "fileName", "filePath", "mimeType", size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        randomUUID(),
        companyId,
        meta?.entityType ?? 'GENERAL',
        meta?.entityId ?? '',
        file.originalname,
        `/uploads/${file.filename}`,
        file.mimetype ?? null,
        file.size ?? 0,
      ],
    );
    return rows[0];
  }

  async findAll(companyId: string, options?: { entityType?: string; entityId?: string }) {
    const values: unknown[] = [companyId];
    const conditions = ['"companyId" = $1'];
    if (options?.entityType) {
      values.push(options.entityType);
      conditions.push(`"entityType" = $${values.length}`);
    }
    if (options?.entityId) {
      values.push(options.entityId);
      conditions.push(`"entityId" = $${values.length}`);
    }
    return this.db.query<Attachment>(
      `SELECT * FROM "Attachment" WHERE ${conditions.join(' AND ')} ORDER BY "createdAt" DESC`,
      values,
    );
  }

  async remove(id: string, companyId: string) {
    const rows = await this.db.query<Attachment>(
      'SELECT * FROM "Attachment" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('پیوست یافت نشد');

    await this.db.execute('DELETE FROM "Attachment" WHERE id = $1', [id]);

    // حذف فایل فیزیکی (در صورت خطا، رکورد حذف شده و فایل باقی می‌ماند)
    try {
      await unlink(join(process.cwd(), 'uploads', basename(rows[0].filePath)));
    } catch {
      // ignore
    }

    return { deleted: true, id };
  }
}
