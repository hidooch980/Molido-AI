import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

type SerialRow = {
  id: string;
  serial: string;
  status: string;
  [key: string]: unknown;
};

export const SERIAL_STATUSES = [
  'IN_STOCK',
  'SOLD',
  'RETURNED',
  'DEFECTIVE',
] as const;

/**
 * شمارهٔ سریال کالا.
 *
 * برای کالای گارانتی‌دار (لوازم برقی، موبایل) لازم است: وقتی مشتری با
 * دستگاه خراب برمی‌گردد، باید بتوان گفت این دستگاه کِی و در کدام فاکتور
 * فروخته شده و گارانتی‌اش تا چه تاریخی است.
 */
@Injectable()
export class SerialNumbersService extends BaseCrudService<SerialRow> {
  protected readonly table = 'SerialNumber';
  protected readonly notFoundMessage = 'شمارهٔ سریال یافت نشد';
  protected readonly searchColumns = ['serial'] as const;

  constructor(db: DatabaseService) {
    super(db);
  }

  async findAll(
    companyId: string,
    query: { productId?: string; status?: string; search?: string; limit?: number } = {},
  ) {
    const values: unknown[] = [companyId];
    const next = (value: unknown) => `$${values.push(value)}`;
    const conditions = ['s."companyId" = $1'];

    if (query.productId) conditions.push(`s."productId" = ${next(query.productId)}`);
    if (query.status) conditions.push(`s.status = ${next(query.status)}`);
    if (query.search) conditions.push(`s.serial ILIKE ${next(`%${query.search}%`)}`);

    const limit = Math.min(Number(query.limit ?? 200) || 200, 1000);

    return this.db.query<SerialRow>(
      `SELECT s.*, p.name AS "productName", p.sku
         FROM "SerialNumber" s
         JOIN "Product" p ON p.id = s."productId"
        WHERE ${conditions.join(' AND ')}
        ORDER BY s."createdAt" DESC
        LIMIT ${next(limit)}`,
      values,
    );
  }

  /**
   * ثبت دسته‌ای.
   *
   * انباردار کارتن را باز می‌کند و ده‌ها سریال پشت سر هم اسکن می‌کند؛ یک
   * درخواست به‌ازای هر سریال کار را غیرعملی می‌کند.
   *
   * سریال تکراری **کل دسته را رد نمی‌کند** بلکه گزارش می‌شود: در ثبت ۵۰
   * سریال، یک تکراری نباید ۴۹ تای دیگر را دور بریزد و انباردار را مجبور
   * کند همه را از اول اسکن کند.
   */
  async addBatch(
    companyId: string,
    dto: { productId: string; serials: string[]; warrantyUntil?: string; note?: string },
  ) {
    const list = [
      ...new Set(
        (dto.serials ?? []).map((item) => String(item ?? '').trim()).filter(Boolean),
      ),
    ];

    if (!list.length) {
      throw new BadRequestException('حداقل یک شمارهٔ سریال لازم است');
    }

    const [product] = await this.db.query<{ id: string }>(
      'SELECT id FROM "Product" WHERE id = $1 AND "companyId" = $2',
      [dto.productId, companyId],
    );

    if (!product) throw new NotFoundException('کالا یافت نشد');

    const added: string[] = [];
    const duplicates: string[] = [];

    for (const serial of list) {
      const rows = await this.db.query<{ serial: string }>(
        `INSERT INTO "SerialNumber"
           (id, "companyId", "productId", serial, status, "warrantyUntil", note)
         VALUES ($1, $2, $3, $4, 'IN_STOCK', $5, $6)
         ON CONFLICT ("companyId", serial) DO NOTHING
         RETURNING serial`,
        [
          randomUUID(),
          companyId,
          dto.productId,
          serial,
          dto.warrantyUntil || null,
          dto.note || null,
        ],
      );

      if (rows[0]) added.push(serial);
      else duplicates.push(serial);
    }

    return { added: added.length, duplicates, total: list.length };
  }

  /**
   * تغییر وضعیت.
   *
   * `SOLD` بدون فاکتور پذیرفته نمی‌شود — قید دیتابیس هم همین را می‌گوید،
   * ولی خطای اینجا قابل‌فهم است و خطای دیتابیس نیست.
   */
  async setStatus(
    companyId: string,
    id: string,
    status: string,
    saleId?: string | null,
  ) {
    if (!SERIAL_STATUSES.includes(status as (typeof SERIAL_STATUSES)[number])) {
      throw new BadRequestException('وضعیت نامعتبر است');
    }

    const current = await this.findOne(companyId, id);

    if (status === 'SOLD' && !saleId && !current.saleId) {
      throw new BadRequestException('برای وضعیت «فروخته‌شده» شمارهٔ فاکتور لازم است');
    }

    const rows = await this.db.query<SerialRow>(
      `UPDATE "SerialNumber"
          SET status = $1,
              "saleId" = CASE WHEN $2::text IS NULL THEN "saleId" ELSE $2 END,
              "updatedAt" = now()
        WHERE id = $3 AND "companyId" = $4
        RETURNING *`,
      [status, saleId ?? null, id, companyId],
    );

    return rows[0];
  }

  /** جست‌وجوی گارانتی: مشتری با دستگاه می‌آید و فقط سریال روی جعبه را دارد. */
  async lookup(companyId: string, serial: string) {
    const [row] = await this.db.query<Record<string, unknown>>(
      `SELECT s.*, p.name AS "productName", p.sku,
              sa."invoiceNo", sa."createdAt" AS "soldAt",
              NULLIF(TRIM(CONCAT_WS(' ', c."firstName", c."lastName")), '')
                AS "customerName",
              c.phone AS "customerPhone",
              (s."warrantyUntil" IS NOT NULL AND s."warrantyUntil" >= CURRENT_DATE)
                AS "warrantyValid"
         FROM "SerialNumber" s
         JOIN "Product" p ON p.id = s."productId"
         LEFT JOIN "Sale" sa ON sa.id = s."saleId"
         LEFT JOIN "Customer" c ON c.id = sa."customerId"
        WHERE s."companyId" = $1 AND s.serial = $2`,
      [companyId, String(serial ?? '').trim()],
    );

    if (!row) throw new NotFoundException(this.notFoundMessage);
    return row;
  }

  async stats(companyId: string) {
    const [row] = await this.db.query<Record<string, string>>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'IN_STOCK')  AS "inStock",
         COUNT(*) FILTER (WHERE status = 'SOLD')      AS sold,
         COUNT(*) FILTER (WHERE status = 'RETURNED')  AS returned,
         COUNT(*) FILTER (WHERE status = 'DEFECTIVE') AS defective,
         COUNT(*)                                     AS total
        FROM "SerialNumber" WHERE "companyId" = $1`,
      [companyId],
    );

    return {
      inStock: Number(row?.inStock ?? 0),
      sold: Number(row?.sold ?? 0),
      returned: Number(row?.returned ?? 0),
      defective: Number(row?.defective ?? 0),
      total: Number(row?.total ?? 0),
    };
  }
}
