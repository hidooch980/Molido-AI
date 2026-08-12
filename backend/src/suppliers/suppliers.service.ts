import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type Supplier = Record<string, unknown> & { id: string };

const WRITABLE = ['name', 'phone', 'email', 'address', 'isActive'] as const;

@Injectable()
export class SuppliersService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(companyId: string, search?: string) {
    const values: unknown[] = [companyId];
    let where = 's."companyId" = $1';
    if (search) {
      values.push(`%${search}%`);
      where += ` AND s.name ILIKE $${values.length}`;
    }
    return this.db.query(
      `SELECT s.*, (SELECT count(*)::int FROM "Purchase" p WHERE p."supplierId" = s.id) AS "purchaseCount"
       FROM "Supplier" s WHERE ${where} ORDER BY s."createdAt" DESC`,
      values,
    );
  }

  async findOne(id: string, companyId: string) {
    const suppliers = await this.db.query<Supplier>(
      'SELECT * FROM "Supplier" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!suppliers[0]) throw new NotFoundException('تأمین‌کننده یافت نشد');

    const purchases = await this.db.query(
      `SELECT id, "purchaseNo", status, total, "createdAt" FROM "Purchase"
       WHERE "supplierId" = $1 ORDER BY "createdAt" DESC LIMIT 20`,
      [id],
    );
    return { ...suppliers[0], purchases };
  }

  async create(
    companyId: string,
    data: { name: string; phone?: string; email?: string; address?: string },
  ) {
    const suppliers = await this.db.query<Supplier>(
      `INSERT INTO "Supplier" (id, "companyId", name, phone, email, address)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        randomUUID(),
        companyId,
        data.name,
        data.phone ?? null,
        data.email ?? null,
        data.address ?? null,
      ],
    );
    return suppliers[0];
  }

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    await this.findOne(id, companyId);

    const values: unknown[] = [];
    const assignments = WRITABLE.filter((column) => data[column] !== undefined).map((column) => {
      values.push(data[column]);
      return `"${column}" = $${values.length}`;
    });
    if (!assignments.length) return this.findOne(id, companyId);

    values.push(id);
    const suppliers = await this.db.query<Supplier>(
      `UPDATE "Supplier" SET ${assignments.join(', ')}, "updatedAt" = now()
       WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return suppliers[0];
  }

  async remove(id: string, companyId: string) {
    const supplier = await this.findOne(id, companyId);
    await this.db.execute('DELETE FROM "Supplier" WHERE id = $1', [id]);
    return supplier;
  }
}
