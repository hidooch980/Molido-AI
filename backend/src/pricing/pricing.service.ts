import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import {
  bestDiscount,
  tierPrice,
  type DiscountRule,
} from './pricing-rules';

/**
 * قیمت‌گذاری: سطح قیمت و تخفیف خودکار.
 *
 * `PriceLevel` وجود داشت ولی فقط نام بود، و `DiscountRule` ستون کامل داشت
 * ولی هیچ‌جا اعمال نمی‌شد.
 *
 * تصمیم اصلی: **محاسبه در سرور انجام می‌شود، نه در صندوق.**  اگر کلاینت
 * تخفیف را حساب کند، همان عددی که مبلغ فاکتور را می‌سازد قابل دستکاری
 * است — و تخفیف دقیقاً جایی است که سوءاستفاده اتفاق می‌افتد.
 */

type Row = Record<string, unknown>;

export type QuoteLine = {
  productId: string;
  qty: number;
  /** اگر داده شود، جای قیمت سطح می‌نشیند — برای اقلام وزنی و دستی. */
  unitPrice?: number;
};

@Injectable()
export class PricingService {
  constructor(private readonly db: DatabaseService) {}

  // ------------------------------------------------------- سطح قیمت

  async priceLevels(companyId: string) {
    return this.db.query<Row>(
      `SELECT p.*,
              (SELECT COUNT(*) FROM "ProductPrice" pp
                WHERE pp."priceLevelId" = p.id) AS "priceCount"
         FROM "PriceLevel" p
        WHERE p."companyId" = $1
        ORDER BY p."isDefault" DESC, p.name`,
      [companyId],
    );
  }

  async createPriceLevel(companyId: string, dto: Record<string, unknown>) {
    if (!String(dto.name ?? '').trim()) {
      throw new BadRequestException('نام سطح قیمت لازم است');
    }

    return this.db.transaction(async (tx) => {
      // پیش‌فرض تازه، پیش‌فرض قبلی را کنار می‌زند.  نمایهٔ جزئی «یک
      // پیش‌فرض» وگرنه درج را رد می‌کرد.
      if (dto.isDefault) {
        await tx.query(
          'UPDATE "PriceLevel" SET "isDefault" = false WHERE "companyId" = $1',
          [companyId],
        );
      }

      const rows = await tx.query<Row>(
        `INSERT INTO "PriceLevel" (id, "companyId", name, description, "isDefault")
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [
          randomUUID(),
          companyId,
          String(dto.name).trim(),
          dto.description ?? null,
          dto.isDefault === true,
        ],
      );

      return rows.rows[0];
    });
  }

  async setProductPrice(
    companyId: string,
    dto: {
      productId: string;
      priceLevelId: string;
      price: number;
      minQty?: number;
    },
  ) {
    const price = Number(dto.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new BadRequestException('قیمت نامعتبر است');
    }

    const rows = await this.db.query<Row>(
      `INSERT INTO "ProductPrice"
         (id, "companyId", "productId", "priceLevelId", price, "minQty")
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("productId", "priceLevelId", "minQty") DO UPDATE
         SET price = EXCLUDED.price, "updatedAt" = now()
       RETURNING *`,
      [
        randomUUID(),
        companyId,
        dto.productId,
        dto.priceLevelId,
        price,
        Number(dto.minQty ?? 0),
      ],
    );

    return rows[0];
  }

  async productPrices(companyId: string, productId: string) {
    return this.db.query<Row>(
      `SELECT pp.*, pl.name AS "levelName", pl."isDefault"
         FROM "ProductPrice" pp
         JOIN "PriceLevel" pl ON pl.id = pp."priceLevelId"
        WHERE pp."companyId" = $1 AND pp."productId" = $2
        ORDER BY pl.name, pp."minQty"`,
      [companyId, productId],
    );
  }

  // --------------------------------------------------------- تخفیف

  async rules(companyId: string) {
    return this.db.query<Row>(
      `SELECT d.*, p.name AS "productName", c.name AS "categoryName"
         FROM "DiscountRule" d
         LEFT JOIN "Product" p ON p.id = d."productId"
         LEFT JOIN "Category" c ON c.id = d."categoryId"
        WHERE d."companyId" = $1
        ORDER BY d.priority DESC, d."createdAt" DESC`,
      [companyId],
    );
  }

  async createRule(companyId: string, dto: Record<string, unknown>) {
    if (!String(dto.name ?? '').trim()) {
      throw new BadRequestException('نام قاعده لازم است');
    }

    const kind = String(dto.kind ?? 'PERCENT');
    const value = Number(dto.value ?? 0);

    if (kind === 'PERCENT' && (value < 0 || value > 100)) {
      throw new BadRequestException('درصد تخفیف باید بین ۰ تا ۱۰۰ باشد');
    }

    // فقط ستون‌هایی درج می‌شوند که مقدار دارند.  چند ستون در دیتابیس
    // NOT NULL با پیش‌فرض‌اند؛ فرستادن null صریح پیش‌فرض را دور می‌زند و
    // درج را می‌شکند — و کدام ستون‌ها این‌طورند، از نصبی به نصب دیگر فرق
    // می‌کند.  ساخت پویا این وابستگی شکننده را حذف می‌کند.
    const columns: string[] = ['id', 'companyId', 'name', 'kind', 'value'];
    const values: unknown[] = [
      randomUUID(),
      companyId,
      String(dto.name).trim(),
      kind,
      value,
    ];

    const optional: Array<[string, unknown]> = [
      ['minQty', dto.minQty],
      ['minAmount', dto.minAmount],
      ['getQty', dto.getQty],
      ['startsAt', dto.startsAt],
      ['endsAt', dto.endsAt],
      ['code', dto.code],
      ['maxUses', dto.maxUses],
      ['productId', dto.productId],
      ['categoryId', dto.categoryId],
      ['priority', dto.priority],
    ];

    for (const [column, raw] of optional) {
      if (raw === undefined || raw === null || raw === '') continue;
      columns.push(column);
      values.push(raw);
    }

    if (dto.isActive !== undefined) {
      columns.push('isActive');
      values.push(dto.isActive !== false);
    }

    const rows = await this.db.query<Row>(
      `INSERT INTO "DiscountRule" (${columns.map((c) => `"${c}"`).join(', ')})
       VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING *`,
      values,
    );

    return rows[0];
  }

  async toggleRule(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      `UPDATE "DiscountRule" SET "isActive" = NOT "isActive", "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      [id, companyId],
    );

    if (!rows[0]) throw new BadRequestException('قاعده یافت نشد');
    return rows[0];
  }

  // ---------------------------------------------------------- قیمت‌دهی

  /**
   * قیمت‌گذاری یک سبد: قیمت سطح + بهترین تخفیف هر قلم.
   *
   * صندوق این را صدا می‌زند تا مبلغ نهایی را **سرور** تعیین کند.
   */
  async quote(
    companyId: string,
    lines: QuoteLine[],
    options: { customerId?: string; priceLevelId?: string } = {},
  ) {
    if (!lines?.length) {
      return { lines: [], subtotal: 0, discount: 0, total: 0 };
    }

    // سطح قیمت: صریح ← سطح مشتری ← پیش‌فرض شرکت
    let levelId = options.priceLevelId ?? null;

    if (!levelId && options.customerId) {
      const rows = await this.db.query<{ priceLevelId: string | null }>(
        'SELECT "priceLevelId" FROM "Customer" WHERE id = $1 AND "companyId" = $2',
        [options.customerId, companyId],
      );
      levelId = rows[0]?.priceLevelId ?? null;
    }

    if (!levelId) {
      const rows = await this.db.query<{ id: string }>(
        `SELECT id FROM "PriceLevel"
          WHERE "companyId" = $1 AND "isDefault" = true LIMIT 1`,
        [companyId],
      );
      levelId = rows[0]?.id ?? null;
    }

    const productIds = lines.map((line) => line.productId);

    const products = await this.db.query<{
      id: string;
      name: string;
      categoryId: string | null;
      salePrice: string;
    }>(
      `SELECT id, name, "categoryId", "salePrice" FROM "Product"
        WHERE id = ANY($1) AND "companyId" = $2`,
      [productIds, companyId],
    );

    const productMap = new Map(products.map((item) => [item.id, item]));

    const tiers = levelId
      ? await this.db.query<{
          productId: string;
          price: string;
          minQty: string;
        }>(
          `SELECT "productId", price, "minQty" FROM "ProductPrice"
            WHERE "companyId" = $1 AND "priceLevelId" = $2
              AND "productId" = ANY($3)`,
          [companyId, levelId, productIds],
        )
      : [];

    const rules = (await this.db.query<DiscountRule>(
      `SELECT * FROM "DiscountRule"
        WHERE "companyId" = $1 AND "isActive" = true`,
      [companyId],
    )) as unknown as DiscountRule[];

    const now = new Date();
    let subtotal = 0;
    let discountTotal = 0;

    const priced = lines.map((line) => {
      const product = productMap.get(line.productId);
      const qty = Number(line.qty);

      const levelTiers = tiers
        .filter((tier) => tier.productId === line.productId)
        .map((tier) => ({
          price: Number(tier.price),
          minQty: Number(tier.minQty),
        }));

      // قیمت صریح (کالای وزنی) بر همه‌چیز مقدم است.
      const unitPrice =
        line.unitPrice !== undefined
          ? Number(line.unitPrice)
          : tierPrice(levelTiers, qty, Number(product?.salePrice ?? 0));

      const gross = qty * unitPrice;

      const best = bestDiscount(
        rules,
        {
          productId: line.productId,
          categoryId: product?.categoryId ?? null,
          qty,
          unitPrice,
        },
        now,
      );

      const discount = best?.amount ?? 0;

      subtotal += gross;
      discountTotal += discount;

      return {
        productId: line.productId,
        name: product?.name ?? '—',
        qty,
        unitPrice,
        gross: Math.round(gross * 100) / 100,
        discount,
        discountName: best?.rule.name ?? null,
        total: Math.round((gross - discount) * 100) / 100,
      };
    });

    return {
      priceLevelId: levelId,
      lines: priced,
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(discountTotal * 100) / 100,
      total: Math.round((subtotal - discountTotal) * 100) / 100,
    };
  }
}
