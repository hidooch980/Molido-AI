import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { Params, setClause } from '../database/sql';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { parseDate } from '../common/date';
import { BarcodeCatalogService } from '../catalog/barcode-catalog.service';

type Product = Record<string, unknown> & { id: string };

const WRITABLE = [
  'categoryId',
  'name',
  'sku',
  'barcode',
  'description',
  'purchasePrice',
  'salePrice',
  'taxRate',
  'unit',
  'status',
  'trackInventory',
  'minStock',
  'expiryDate',
  'isWeighed',
  'scaleCode',
  'isRationEligible',
  'rationPrice',
  // میدان‌های فروشگاه اینترنتی.  تا امروز در این فهرست نبودند، پس PATCH
  // موفق برمی‌گشت ولی هیچ‌چیز ذخیره نمی‌شد — بدترین شکل شکست، چون شبیه
  // موفقیت است.
  'isOnline',
  'onlinePrice',
  'imageUrl',
] as const;

const MAX_PAGE_SIZE = 200;

@Injectable()
export class ProductsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly catalog: BarcodeCatalogService,
  ) {}

  private async withRelations(products: Product[]): Promise<Product[]> {
    if (!products.length) return products;
    const ids = products.map((product) => product.id);
    const inventories = await this.db.query<{
      productId: string;
      warehouseId: string;
      quantity: string;
    }>('SELECT "productId", "warehouseId", quantity FROM "Inventory" WHERE "productId" = ANY($1)', [
      ids,
    ]);
    return products.map((product) => ({
      ...product,
      inventories: inventories.filter((row) => row.productId === product.id),
    }));
  }

  async findAll(
    companyId: string,
    options?: {
      search?: string;
      categoryId?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const params = new Params();
    const conditions = [`p."companyId" = ${params.next(companyId)}`];
    if (options?.categoryId) conditions.push(`p."categoryId" = ${params.next(options.categoryId)}`);
    if (options?.status) conditions.push(`p.status = ${params.next(options.status)}`);
    if (options?.search) {
      const term = params.next(`%${options.search}%`);
      conditions.push(`(p.name ILIKE ${term} OR p.sku ILIKE ${term} OR p.barcode ILIKE ${term})`);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const select =
      `SELECT p.*, c.name AS "categoryName" FROM "Product" p
       LEFT JOIN "Category" c ON c.id = p."categoryId" ${where} ORDER BY p."createdAt" DESC`;

    const take =
      options?.limit && options.limit > 0 ? Math.min(options.limit, MAX_PAGE_SIZE) : undefined;

    if (!take) {
      return this.withRelations(await this.db.query<Product>(select, params.values));
    }

    const page = options?.page && options.page > 0 ? options.page : 1;
    const rows = await this.db.query<Product>(
      `${select} LIMIT ${params.next(take)} OFFSET ${params.next((page - 1) * take)}`,
      params.values,
    );
    const counted = await this.db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "Product" p ${where}`,
      params.values.slice(0, params.values.length - 2),
    );
    const total = Number(counted[0]?.count ?? 0);

    return {
      data: await this.withRelations(rows),
      total,
      page,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  async findOne(id: string, companyId: string) {
    const products = await this.db.query<Product>(
      'SELECT * FROM "Product" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!products[0]) throw new NotFoundException('کالا یافت نشد');

    const [category, variants, inventories] = await Promise.all([
      products[0].categoryId
        ? this.db.query('SELECT * FROM "Category" WHERE id = $1', [products[0].categoryId])
        : Promise.resolve([]),
      this.db.query('SELECT * FROM "ProductVariant" WHERE "productId" = $1', [id]),
      this.db.query(
        `SELECT i.*, w.name AS "warehouseName", w.code AS "warehouseCode"
         FROM "Inventory" i JOIN "Warehouse" w ON w.id = i."warehouseId"
         WHERE i."productId" = $1`,
        [id],
      ),
    ]);

    return { ...products[0], category: category[0] ?? null, variants, inventories };
  }

  async findByBarcode(barcode: string, companyId: string) {
    const products = await this.db.query<Product>(
      'SELECT * FROM "Product" WHERE barcode = $1 AND "companyId" = $2 LIMIT 1',
      [barcode, companyId],
    );
    if (!products[0]) throw new NotFoundException('کالایی با این بارکد یافت نشد');
    return (await this.withRelations(products))[0];
  }

  async create(dto: CreateProductDto, companyId: string) {
    const existing = await this.db.query<{ id: string }>(
      'SELECT id FROM "Product" WHERE "companyId" = $1 AND sku = $2',
      [companyId, dto.sku],
    );
    if (existing[0]) throw new ConflictException('کالایی با این SKU وجود دارد');

    const payload = this.payloadOf(dto);
    const params = new Params();
    const present = WRITABLE.filter((column) => payload[column] !== undefined);
    const columns = ['id', 'companyId', ...present];
    const placeholders = [params.next(randomUUID()), params.next(companyId)];
    for (const column of present) placeholders.push(params.next(payload[column]));

    const products = await this.db.query<Product>(
      `INSERT INTO "Product" (${columns.map((column) => `"${column}"`).join(', ')})
       VALUES (${placeholders.join(', ')}) RETURNING *`,
      params.values,
    );
    const created = products[0];

    // ⚠️ «هر جنسی که ثبت شود» به فهرستِ مشترک برمی‌گردد.
    //
    //    بدونِ این، حافظه هرگز پر نمی‌شود و قابلیتِ «اسکن کن،
    //    شناسایی شود» برای همیشه خالی می‌ماند.  همان دامی که در
    //    تحلیل‌ها دیدیم: زیرساخت ساخته شده و راهی به آن نیست.
    //
    // ⚠️ شکستش ثبتِ کالا را برنمی‌گرداند.
    //
    //    فهرستِ مشترک کمکی است، نه شرطِ کار.  اگر بنویسد نشد، کالای
    //    فروشگاه باید ثبت شده باشد — وگرنه یک قابلیتِ جانبی، کارِ
    //    اصلی را می‌خواباند.
    if (created?.barcode) {
      await this.catalog
        .remember({
          barcode: created.barcode,
          name: created.name,
          unit: created.unit,
          source: 'LOCAL',
        })
        .catch(() => undefined);
    }

    return created;
  }

  async update(id: string, dto: UpdateProductDto, companyId: string) {
    await this.findOne(id, companyId);

    const params = new Params();
    const assignments = setClause(WRITABLE, this.payloadOf(dto), params);
    if (!assignments) return this.findOne(id, companyId);

    const products = await this.db.query<Product>(
      `UPDATE "Product" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return products[0];
  }

  async remove(id: string, companyId: string) {
    const product = await this.findOne(id, companyId);
    await this.db.execute('DELETE FROM "Product" WHERE id = $1', [id]);
    return product;
  }

  /** Normalises the DTO's date string into a value pg can bind. */
  private payloadOf(dto: CreateProductDto | UpdateProductDto): Record<string, unknown> {
    const { expiryDate, ...rest } = dto as Record<string, unknown> & { expiryDate?: string | null };
    const payload: Record<string, unknown> = { ...rest };
    if (expiryDate !== undefined) payload.expiryDate = expiryDate ? parseDate(expiryDate as string, "تاریخ انقضا") : null;
    return payload;
  }
}
