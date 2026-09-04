import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';

/**
 * فاکتور معلق.
 *
 * مشتری وسط حساب یادش می‌افتد چیزی برنداشته؛ صندوق‌دار سبد را کنار
 * می‌گذارد و نفر بعد را حساب می‌کند.  بدون این، یا صف می‌ایستد یا سبد
 * دور ریخته می‌شود — و در فروشگاه شلوغ، هر دو روزی چند بار اتفاق می‌افتد.
 *
 * چرا در دیتابیس و نه در مرورگر: صندوق‌دار ممکن است صفحه را ببندد،
 * مرورگر کرش کند، یا شیفت عوض شود.  سبدی که فقط در حافظهٔ مرورگر است با
 * اولین تازه‌سازی می‌رود، و آن یعنی مشتری دوباره باید همه‌چیز را بیاورد.
 */

type Line = {
  productId: string;
  quantity: number;
  /** فقط برای نمایش در فهرست معلق‌ها؛ مبنای حساب نیست. */
  name?: string;
  price?: number;
};

@Injectable()
export class ParkedSaleService {
  constructor(private readonly db: DatabaseService) {}

  async list(companyId: string) {
    return this.db.query<Record<string, unknown>>(
      `SELECT p.*,
              NULLIF(TRIM(CONCAT_WS(' ', c."firstName", c."lastName")), '')
                AS "customerName",
              jsonb_array_length(p.lines) AS "lineCount"
         FROM "ParkedSale" p
         LEFT JOIN "Customer" c ON c.id = p."customerId"
        WHERE p."companyId" = $1
        ORDER BY p."createdAt" DESC
        LIMIT 50`,
      [companyId],
    );
  }

  async park(
    companyId: string,
    userId: string,
    dto: {
      lines: Line[];
      label?: string;
      customerId?: string;
      shiftId?: string;
      note?: string;
    },
  ) {
    const lines = (dto.lines ?? []).filter(
      (line) => line?.productId && Number(line.quantity) > 0,
    );

    if (!lines.length) {
      throw new BadRequestException('سبد خالی است');
    }

    const id = randomUUID();

    await this.db.query(
      `INSERT INTO "ParkedSale"
         (id, "companyId", "userId", "shiftId", label, "customerId", lines, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        companyId,
        userId,
        dto.shiftId ?? null,
        // برچسب خودکار وقتی صندوق‌دار چیزی ننوشته: «سبد ۳ قلم» بهتر از
        // یک شناسهٔ بی‌معناست وقتی پنج سبد معلق داری.
        //
        // رقم فارسی است چون این رشته مستقیم نمایش داده می‌شود، نه از
        // مسیر قالب‌بندی عدد در رابط رد شود.
        dto.label?.trim() ||
          `سبد ${lines.length.toLocaleString('fa-IR')} قلم`,
        dto.customerId ?? null,
        JSON.stringify(lines),
        dto.note ?? null,
      ],
    );

    return { id, lineCount: lines.length };
  }

  /**
   * بازیابی سبد.
   *
   * قیمت‌ها **دوباره از سرور** گرفته می‌شوند، نه از آنچه ذخیره شده:
   * سبدی که یک ساعت معلق مانده نباید با قیمت دیروز حساب شود، و اگر
   * کالایی حذف یا غیرفعال شده باشد باید همان‌جا معلوم شود.
   */
  async resume(companyId: string, id: string) {
    const [parked] = await this.db.query<{
      id: string;
      lines: Line[];
      customerId: string | null;
      note: string | null;
    }>('SELECT * FROM "ParkedSale" WHERE id = $1 AND "companyId" = $2', [
      id,
      companyId,
    ]);

    if (!parked) throw new NotFoundException('سبد معلق یافت نشد');

    const ids = parked.lines.map((line) => line.productId);

    const products = await this.db.query<{
      id: string;
      name: string;
      unit: string;
      salePrice: string;
      status: string;
      isWeighed: boolean;
    }>(
      `SELECT id, name, unit, "salePrice", status, "isWeighed"
         FROM "Product" WHERE id = ANY($1) AND "companyId" = $2`,
      [ids, companyId],
    );

    const map = new Map(products.map((item) => [item.id, item]));

    const lines = parked.lines.map((line) => {
      const product = map.get(line.productId);

      return {
        productId: line.productId,
        quantity: Number(line.quantity),
        name: product?.name ?? line.name ?? '—',
        unit: product?.unit ?? '',
        price: Number(product?.salePrice ?? line.price ?? 0),
        isWeighed: product?.isWeighed ?? false,
        // کالایی که دیگر نیست یا غیرفعال شده، باید در صندوق دیده شود نه
        // اینکه بی‌سروصدا با قیمت صفر برگردد.
        unavailable: !product || product.status !== 'ACTIVE',
      };
    });

    await this.db.query('DELETE FROM "ParkedSale" WHERE id = $1', [id]);

    return { lines, customerId: parked.customerId, note: parked.note };
  }

  async remove(companyId: string, id: string) {
    const rows = await this.db.query<{ id: string }>(
      'DELETE FROM "ParkedSale" WHERE id = $1 AND "companyId" = $2 RETURNING id',
      [id, companyId],
    );

    if (!rows[0]) throw new NotFoundException('سبد معلق یافت نشد');
    return { id };
  }
}
