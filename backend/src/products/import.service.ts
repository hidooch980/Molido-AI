import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import {
  guessDelimiter,
  mapHeaders,
  parseCsv,
  parseRow,
  type ImportRow,
  type RowError,
} from './import-rules';
import { BarcodeCatalogService } from '../catalog/barcode-catalog.service';

/**
 * ورود گروهی کالا از فایل.
 *
 * فروشگاهی که از نرم‌افزار دیگری می‌آید، هزاران کالا دارد.  بدون این،
 * راه‌اندازی یعنی هفته‌ها تایپ دستی — که در عمل یعنی سامانه استفاده
 * نمی‌شود.
 *
 * دو تصمیم اصلی:
 *
 *   **پیش‌نمایش اجباری.**  هیچ‌چیز بدون دیدن نوشته نمی‌شود.  فایلی که
 *   ستون‌هایش اشتباه تشخیص داده شده، سه هزار کالای خراب می‌سازد و پاک
 *   کردنشان از خودِ ورود سخت‌تر است.
 *
 *   **به‌روزرسانی به‌جای تکرار.**  کالای موجود با همان کد، به‌روز می‌شود نه
 *   دوباره ساخته.  وگرنه دومین بار که کاربر فایل را وارد کند — که حتماً
 *   می‌کند — همه‌چیز دو برابر می‌شود.
 */

type Preview = {
  headers: string[];
  mapped: Record<string, string>;
  missing: string[];
  rows: ImportRow[];
  errors: RowError[];
  total: number;
  willCreate: number;
  willUpdate: number;
};

/** سقف هر فایل؛ بیشتر از این باید تکه‌تکه شود. */
const MAX_ROWS = 20_000;

@Injectable()
export class ImportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly catalog: BarcodeCatalogService,
  ) {}

  /** خواندن و بررسی فایل، بدون نوشتن. */
  async preview(companyId: string, csv: string): Promise<Preview> {
    const { rows, map, headers, errors } = this.parse(csv);

    if (!rows.length && !errors.length) {
      throw new BadRequestException('فایل خالی است');
    }

    const skus = rows.map((row) => row.sku);

    const existing = skus.length
      ? await this.db.query<{ sku: string }>(
          'SELECT sku FROM "Product" WHERE "companyId" = $1 AND sku = ANY($2)',
          [companyId, skus],
        )
      : [];

    const known = new Set(existing.map((item) => item.sku));

    const mapped: Record<string, string> = {};
    for (const [field, index] of Object.entries(map)) {
      if (index !== undefined) mapped[field] = headers[index];
    }

    return {
      headers,
      mapped,
      missing: mapHeaders(headers).missing,
      // پیش‌نمایش محدود است ولی شمارش‌ها روی کل فایل‌اند: کاربر باید
      // بداند چند سطر می‌آید، نه فقط بیست تای اول را ببیند.
      rows: rows.slice(0, 20),
      errors: errors.slice(0, 50),
      total: rows.length,
      willCreate: rows.filter((row) => !known.has(row.sku)).length,
      willUpdate: rows.filter((row) => known.has(row.sku)).length,
    };
  }

  /**
   * نوشتن واقعی.
   *
   * هر سطر در تراکنش خودش نیست: یک تراکنش برای کل فایل یعنی سطر ۲۹۰۰
   * خراب، ۲۸۹۹ تای سالم را هم برمی‌گرداند.  ولی هر کالا با موجودی‌اش
   * **با هم** نوشته می‌شود، وگرنه کالایی می‌ماند که موجودی‌اش هرگز ثبت
   * نشد.
   */
  async run(
    companyId: string,
    csv: string,
    options: { warehouseId?: string; updateExisting?: boolean } = {},
  ) {
    const { rows, errors } = this.parse(csv);

    if (!rows.length) {
      throw new BadRequestException('سطر قابل ورودی یافت نشد');
    }

    let warehouseId = options.warehouseId ?? null;

    if (!warehouseId) {
      const [first] = await this.db.query<{ id: string }>(
        'SELECT id FROM "Warehouse" WHERE "companyId" = $1 ORDER BY name LIMIT 1',
        [companyId],
      );
      warehouseId = first?.id ?? null;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const failed: RowError[] = [...errors];

    // ⚠️ جمع می‌شود و **بعد از** حلقه نوشته می‌شود، نه داخلش.
    //
    //    نوشتنِ درجا یعنی پنج هزار رفت‌وبرگشتِ اضافه به پایگاه‌داده
    //    وسطِ تراکنشِ واردات — واردات را کند می‌کند و قفل را طولانی.
    const remembered: Array<{ barcode: string; name: string; unit: string }> = [];

    // دسته‌بندی‌ها یک‌بار ساخته می‌شوند نه به‌ازای هر سطر.
    const categories = await this.ensureCategories(companyId, rows);

    for (const [index, row] of rows.entries()) {
      try {
        const [existing] = await this.db.query<{ id: string }>(
          'SELECT id FROM "Product" WHERE "companyId" = $1 AND sku = $2',
          [companyId, row.sku],
        );

        if (existing && options.updateExisting === false) {
          skipped += 1;
          continue;
        }

        await this.db.transaction(async (tx) => {
          const productId = existing?.id ?? randomUUID();
          const categoryId = row.categoryName
            ? (categories.get(row.categoryName) ?? null)
            : null;

          if (existing) {
            await tx.query(
              `UPDATE "Product"
                  SET name = $1, barcode = COALESCE($2, barcode), unit = $3,
                      "purchasePrice" = $4, "salePrice" = $5,
                      "categoryId" = COALESCE($6, "categoryId"),
                      "minStock" = COALESCE($7, "minStock"),
                      "updatedAt" = now()
                WHERE id = $8`,
              [
                row.name,
                row.barcode,
                row.unit,
                row.purchasePrice,
                row.salePrice,
                categoryId,
                row.minStock,
                productId,
              ],
            );
            updated += 1;
          } else {
            // درج **پویا**: ستونی که مقدار ندارد اصلاً فرستاده نمی‌شود.
            //
            // چند ستون در دیتابیس NOT NULL با پیش‌فرض‌اند (`minStock` پنج
            // است).  فرستادن `null` صریح، پیش‌فرض را دور می‌زند و درج را
            // می‌شکند — و کدام ستون‌ها این‌طورند از نصبی به نصب دیگر فرق
            // می‌کند.
            const columns = [
              'id',
              'companyId',
              'name',
              'sku',
              'unit',
              'purchasePrice',
              'salePrice',
              'status',
            ];
            const values: unknown[] = [
              productId,
              companyId,
              row.name,
              row.sku,
              row.unit,
              row.purchasePrice,
              row.salePrice,
              'ACTIVE',
            ];

            const optional: Array<[string, unknown]> = [
              ['barcode', row.barcode],
              ['categoryId', categoryId],
              ['minStock', row.minStock],
            ];

            for (const [column, value] of optional) {
              if (value === null || value === undefined) continue;
              columns.push(column);
              values.push(value);
            }

            await tx.query(
              `INSERT INTO "Product" (${columns.map((c) => `"${c}"`).join(', ')})
               VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})`,
              values,
            );
            created += 1;

            // ⚠️ واردات غنی‌ترین منبعِ فهرستِ مشترک است.
            //
            //    یک فایلِ اکسلِ پنج‌هزار کالایی، پنج هزار بارکد به
            //    حافظه می‌دهد — بیش از آنچه ثبتِ دستی در یک سال
            //    می‌دهد.  بدونِ این، «هر جنسی که ثبت شود» فقط شاملِ
            //    کالای دستی می‌شد و بزرگ‌ترین منبع بیرون می‌ماند.
            //
            // ⚠️ بیرونِ تراکنش، و شکستش واردات را برنمی‌گرداند.
            //
            //    فهرستِ مشترک کمکی است؛ اگر ننشست، کالای فروشگاه باید
            //    وارد شده باشد.  وگرنه یک قابلیتِ جانبی، وارداتِ
            //    پنج‌هزارتایی را می‌خواباند.
            if (row.barcode) {
              remembered.push({ barcode: row.barcode, name: row.name, unit: row.unit });
            }
          }

          // موجودی فقط برای کالای تازه نوشته می‌شود.  بازنویسی موجودی
          // کالای موجود یعنی ورود دوبارهٔ فایل، شمارش انبار را پاک کند —
          // و آن عدد از فروش و خرید واقعی آمده، نه از فایل.
          if (!existing && warehouseId && row.stock > 0) {
            await tx.query(
              `INSERT INTO "Inventory" (id, "productId", "warehouseId", quantity)
               VALUES ($1,$2,$3,$4)
               ON CONFLICT DO NOTHING`,
              [randomUUID(), productId, warehouseId, row.stock],
            );
          }
        });
      } catch (err) {
        failed.push({
          line: index + 2,
          message: err instanceof Error ? err.message : String(err),
          raw: row.name,
        });
      }
    }

    // ⚠️ خارج از حلقه و خارج از تراکنش — و شکستش خاموش است.
    //    واردات تمام شده و ثبت‌شده؛ فهرستِ مشترک نباید عقب بکشدش.
    for (const item of remembered) {
      await this.catalog.remember({ ...item, source: 'LOCAL' }).catch(() => undefined);
    }

    return {
      created,
      updated,
      skipped,
      failed: failed.length,
      // فقط چند نمونه برمی‌گردد؛ سه هزار خطا در یک پاسخ، مرورگر را
      // می‌خواباند و کسی هم نمی‌خواندش.
      errors: failed.slice(0, 50),
    };
  }

  /** دسته‌بندی‌های فایل که هنوز وجود ندارند ساخته می‌شوند. */
  private async ensureCategories(companyId: string, rows: ImportRow[]) {
    const names = [
      ...new Set(
        rows
          .map((row) => row.categoryName)
          .filter((name): name is string => Boolean(name)),
      ),
    ];

    const map = new Map<string, string>();
    if (!names.length) return map;

    const existing = await this.db.query<{ id: string; name: string }>(
      'SELECT id, name FROM "Category" WHERE "companyId" = $1 AND name = ANY($2)',
      [companyId, names],
    );

    for (const row of existing) map.set(row.name, row.id);

    for (const name of names) {
      if (map.has(name)) continue;

      const [created] = await this.db.query<{ id: string }>(
        'INSERT INTO "Category" (id, "companyId", name) VALUES ($1,$2,$3) RETURNING id',
        [randomUUID(), companyId, name],
      );

      map.set(name, created.id);
    }

    return map;
  }

  private parse(csv: string) {
    const text = String(csv ?? '');

    if (!text.trim()) throw new BadRequestException('فایل خالی است');

    const table = parseCsv(text, guessDelimiter(text));

    if (!table.length) throw new BadRequestException('فایل قابل خواندن نیست');

    const [headers, ...body] = table;
    const { map, missing } = mapHeaders(headers);

    if (missing.length) {
      throw new BadRequestException(
        `این ستون‌ها در فایل پیدا نشدند: ${missing.join('، ')}`,
      );
    }

    if (body.length > MAX_ROWS) {
      throw new BadRequestException(
        `فایل ${body.length} سطر دارد؛ حداکثر ${MAX_ROWS} سطر در هر بار`,
      );
    }

    const rows: ImportRow[] = [];
    const errors: RowError[] = [];
    const seen = new Set<string>();

    for (const [index, cells] of body.entries()) {
      // شمارهٔ خط برای کاربر است: سرستون خط ۱ است، پس داده از ۲ شروع می‌شود.
      const result = parseRow(cells, map, index + 2);

      if ('error' in result) {
        errors.push(result.error);
        continue;
      }

      // کد تکراری **داخل خود فایل** — دومی روی اولی می‌نوشت و کاربر
      // هرگز نمی‌فهمید کدام مانده.
      if (seen.has(result.row.sku)) {
        errors.push({
          line: index + 2,
          message: `کد «${result.row.sku}» در فایل تکراری است`,
          raw: result.row.name,
        });
        continue;
      }

      seen.add(result.row.sku);
      rows.push(result.row);
    }

    return { rows, errors, map, headers };
  }
}
