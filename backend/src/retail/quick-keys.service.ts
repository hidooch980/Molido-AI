import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

type Row = Record<string, unknown>;

/**
 * کلید سریع صندوق.
 *
 * صندوق تا امروز فقط با اسکن کار می‌کرد.  برای نصف کارِ یک فروشگاه
 * واقعی کافی نیست: میوه و نان بارکد ندارند، و کالای پرفروش با یک لمس
 * سریع‌تر از اسکن است.
 *
 * چیدمان را **فروشنده** تعیین می‌کند، نه برنامه‌نویس: هر فروشگاه
 * پرفروش‌های خودش را دارد و هیچ پیش‌فرضی برای همه درست نیست.
 */
@Injectable()
export class QuickKeysService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * چیدمان کامل برای صندوق — گروه‌ها با کلیدهایشان، در یک درخواست.
   *
   * صندوق این را یک بار در شروع شیفت می‌گیرد؛ درخواست جدا برای هر گروه
   * یعنی تأخیر دیدنی موقع عوض کردن زبانه.
   */
  async layout(companyId: string) {
    const groups = await this.db.query<Row>(
      `SELECT id, name, color, "sortOrder"
         FROM "QuickKeyGroup"
        WHERE "companyId" = $1 AND "isActive" = true
        ORDER BY "sortOrder", name`,
      [companyId],
    );

    // نام و قیمت کالا همراه کلید می‌آید: بدون آن، صندوق برای نشان دادن
    // هر دکمه یک درخواست جدا می‌زند.
    const keys = await this.db.query<Row>(
      `SELECT k.id, k."groupId", k."productId", k.label, k.color,
              k."defaultQty", k."sortOrder",
              p.name AS "productName", p."salePrice", p.unit,
              p."isWeighed", p."trackInventory"
         FROM "QuickKey" k
         JOIN "Product" p ON p.id = k."productId"
        WHERE k."companyId" = $1 AND p.status = 'ACTIVE'
        ORDER BY k."sortOrder", p.name`,
      [companyId],
    );

    return groups.map((g) => ({
      ...g,
      keys: keys.filter((k) => k.groupId === g.id),
    }));
  }

  // ---------------------------------------------------------- گروه

  async groups(companyId: string) {
    return this.db.query<Row>(
      `SELECT g.*, (SELECT COUNT(*) FROM "QuickKey" k WHERE k."groupId" = g.id) AS "keyCount"
         FROM "QuickKeyGroup" g
        WHERE g."companyId" = $1
        ORDER BY g."sortOrder", g.name`,
      [companyId],
    );
  }

  async createGroup(companyId: string, dto: { name: string; color?: string; sortOrder?: number }) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('نام گروه را وارد کنید');

    const rows = await this.db.query<Row>(
      `INSERT INTO "QuickKeyGroup" (id, "companyId", name, color, "sortOrder")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("companyId", name) DO UPDATE
         SET color = EXCLUDED.color,
             "sortOrder" = EXCLUDED."sortOrder",
             "isActive" = true,
             "updatedAt" = now()
       RETURNING *`,
      [randomUUID(), companyId, name, dto.color ?? null, dto.sortOrder ?? 0],
    );
    return rows[0];
  }

  async updateGroup(
    companyId: string,
    id: string,
    dto: { name?: string; color?: string; sortOrder?: number; isActive?: boolean },
  ) {
    const rows = await this.db.query<Row>(
      `UPDATE "QuickKeyGroup"
          SET name = COALESCE($3, name),
              color = COALESCE($4, color),
              "sortOrder" = COALESCE($5, "sortOrder"),
              "isActive" = COALESCE($6, "isActive"),
              "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2
        RETURNING *`,
      [id, companyId, dto.name?.trim() ?? null, dto.color ?? null, dto.sortOrder ?? null, dto.isActive ?? null],
    );
    if (!rows[0]) throw new NotFoundException('گروه یافت نشد');
    return rows[0];
  }

  async removeGroup(companyId: string, id: string) {
    // کلیدها با ON DELETE CASCADE می‌روند — حذف گروه یعنی حذف چیدمانش،
    // نه اینکه کلیدهای بی‌صاحب بمانند.
    await this.db.query('DELETE FROM "QuickKeyGroup" WHERE id = $1 AND "companyId" = $2', [
      id,
      companyId,
    ]);
    return { deleted: true };
  }

  // ---------------------------------------------------------- کلید

  async addKey(
    companyId: string,
    dto: {
      groupId: string;
      productId: string;
      label?: string;
      color?: string;
      defaultQty?: number;
      sortOrder?: number;
    },
  ) {
    const qty = Number(dto.defaultQty ?? 1);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new BadRequestException('مقدار پیش‌فرض باید بزرگ‌تر از صفر باشد');
    }

    // کالا و گروه باید مال همین شرکت باشند.  بدون این بررسی، کسی
    // می‌توانست شناسهٔ کالای شرکت دیگری را بفرستد و دکمه‌اش بسازد —
    // RLS جلوی خواندنش را می‌گیرد ولی درج کلید ناموفق نمی‌شود.
    const product = await this.db.query<{ id: string }>(
      'SELECT id FROM "Product" WHERE id = $1 AND "companyId" = $2',
      [dto.productId, companyId],
    );
    if (!product[0]) throw new NotFoundException('کالا یافت نشد');

    const group = await this.db.query<{ id: string }>(
      'SELECT id FROM "QuickKeyGroup" WHERE id = $1 AND "companyId" = $2',
      [dto.groupId, companyId],
    );
    if (!group[0]) throw new NotFoundException('گروه یافت نشد');

    const rows = await this.db.query<Row>(
      `INSERT INTO "QuickKey"
         (id, "companyId", "groupId", "productId", label, color, "defaultQty", "sortOrder")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT ("groupId", "productId") DO UPDATE
         SET label = EXCLUDED.label,
             color = EXCLUDED.color,
             "defaultQty" = EXCLUDED."defaultQty",
             "sortOrder" = EXCLUDED."sortOrder",
             "updatedAt" = now()
       RETURNING *`,
      [
        randomUUID(),
        companyId,
        dto.groupId,
        dto.productId,
        dto.label?.trim() || null,
        dto.color ?? null,
        qty,
        dto.sortOrder ?? 0,
      ],
    );
    return rows[0];
  }

  async removeKey(companyId: string, id: string) {
    await this.db.query('DELETE FROM "QuickKey" WHERE id = $1 AND "companyId" = $2', [
      id,
      companyId,
    ]);
    return { deleted: true };
  }

  /**
   * ترتیب تازهٔ کلیدها پس از جابه‌جایی.
   *
   * یکجا، نه یکی‌یکی: کاربر چند دکمه را جابه‌جا می‌کند و بعد ذخیره —
   * درخواست جدا برای هر کلید یعنی نیمی از تغییرات ثبت شود اگر وسط کار
   * اتصال قطع شود.
   */
  async reorder(companyId: string, items: Array<{ id: string; sortOrder: number }>) {
    if (!items?.length) return { updated: 0 };

    return this.db.transaction(async (tx) => {
      let updated = 0;
      for (const item of items) {
        const result = await tx.query(
          'UPDATE "QuickKey" SET "sortOrder" = $3, "updatedAt" = now() WHERE id = $1 AND "companyId" = $2',
          [item.id, companyId, Number(item.sortOrder) || 0],
        );
        updated += result.rowCount ?? 0;
      }
      return { updated };
    });
  }
}
