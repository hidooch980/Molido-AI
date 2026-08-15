import { BadRequestException, Injectable } from '@nestjs/common';

import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

type WarehouseRow = {
  id: string;
  name: string;
  [key: string]: unknown;
};

/**
 * انبار.
 *
 * تا اینجا فقط CRUD خالی بود: انبار ساخته می‌شد ولی هیچ‌جا معلوم نبود چه
 * چیزی و چقدر در آن است، و انبار پر هم به‌سادگی حذف می‌شد.
 */
@Injectable()
export class WarehousesService extends BaseCrudService<WarehouseRow> {
  protected readonly table = 'Warehouse';
  protected readonly notFoundMessage = 'انبار یافت نشد';
  protected readonly orderColumn = 'name';
  protected readonly searchColumns = ['name', 'code'] as const;

  constructor(db: DatabaseService) {
    super(db);
  }

  /**
   * ساخت انبار.
   *
   * ستون `code` در دیتابیس `NOT NULL` است ولی در فرم اختیاری: کاربری که
   * فقط «انبار دوم» را می‌خواهد اضافه کند، نباید سر یک میدان بی‌اهمیت
   * متوقف شود.  پس اگر ندهد، از نام ساخته می‌شود.
   *
   * پیش از این، نداشتنش تا لایهٔ دیتابیس می‌رفت و ۵۰۰ می‌داد.
   */
  async create(companyId: string, data: { name: string; code?: string } & Record<string, unknown>) {
    const code = String(data.code ?? '').trim() || (await this.nextCode(companyId));

    return super.create(companyId, { ...data, code });
  }

  /**
   * کد یکتا.
   *
   * `WH-1`، `WH-2`… — شمارش از تعداد موجود شروع می‌شود و تا خالی پیدا
   * شود جلو می‌رود؛ صرفِ «تعداد + ۱» با انبار حذف‌شده تکراری می‌دهد.
   */
  private async nextCode(companyId: string): Promise<string> {
    const [row] = await this.db.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM "Warehouse" WHERE "companyId" = $1',
      [companyId],
    );

    let n = Number(row?.count ?? 0) + 1;

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = `WH-${n}`;

      const [taken] = await this.db.query<{ id: string }>(
        'SELECT id FROM "Warehouse" WHERE "companyId" = $1 AND code = $2',
        [companyId, candidate],
      );

      if (!taken) return candidate;
      n += 1;
    }

    return `WH-${Date.now()}`;
  }

  /**
   * فهرست انبارها به همراه تعداد کالا و ارزش موجودی.
   *
   * ارزش با **قیمت خرید** حساب می‌شود نه قیمت فروش: این عدد به موجودی
   * انبار در ترازنامه می‌خورد، و آنجا کالا به بهای تمام‌شده ثبت می‌شود.
   */
  async listWithStock(companyId: string) {
    return this.db.query(
      `SELECT w.*,
              (SELECT COUNT(*) FROM "Inventory" i
                WHERE i."warehouseId" = w.id AND i.quantity <> 0) AS "skuCount",
              COALESCE((SELECT SUM(i.quantity * COALESCE(p."purchasePrice", 0))
                          FROM "Inventory" i
                          JOIN "Product" p ON p.id = i."productId"
                         WHERE i."warehouseId" = w.id), 0) AS "stockValue"
         FROM "Warehouse" w
        WHERE w."companyId" = $1
        ORDER BY w.name`,
      [companyId],
    );
  }

  /** کالاهای موجود در یک انبار. */
  async contents(companyId: string, id: string) {
    await this.findOne(companyId, id);

    return this.db.query(
      `SELECT i."productId", i.quantity, p.name, p.sku, p.unit,
              p."purchasePrice", p."salePrice",
              (i.quantity * COALESCE(p."purchasePrice", 0)) AS value
         FROM "Inventory" i
         JOIN "Product" p ON p.id = i."productId"
        WHERE i."warehouseId" = $1 AND i.quantity <> 0
        ORDER BY p.name`,
      [id],
    );
  }

  /**
   * حذف انبار.
   *
   * انباری که موجودی دارد حذف نمی‌شود.  سطرهای `Inventory` به انبار
   * اشاره دارند؛ با رفتن انبار، آن مقدارها یتیم می‌شدند و کالا در هیچ
   * گزارشی دیده نمی‌شد در حالی که فیزیکی سر جایش است.
   */
  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);

    const [stock] = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM "Inventory"
        WHERE "warehouseId" = $1 AND quantity <> 0`,
      [id],
    );

    if (Number(stock?.count ?? 0) > 0) {
      throw new BadRequestException(
        'این انبار موجودی دارد؛ اول کالاها را به انبار دیگری منتقل کنید',
      );
    }

    // سطرهای صفر باقی‌مانده مانعی نیستند ولی باید بروند، وگرنه FK حذف را
    // رد می‌کند و پیام خطای دیتابیس به‌جای پیام قابل‌فهم بالا می‌آید.
    await this.db.query('DELETE FROM "Inventory" WHERE "warehouseId" = $1', [id]);

    return super.remove(companyId, id);
  }
}
