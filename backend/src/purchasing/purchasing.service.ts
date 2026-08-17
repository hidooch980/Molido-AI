import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { TelephonyService } from '../telephony/telephony.service';
import {
  groupBySupplier,
  pickWinners,
  summarize,
  type NeedLine,
  type Quote,
  brief,
} from './quote-rules';

type Row = Record<string, unknown>;

/**
 * مریم — منشی خرید.  استعلام قیمت از بنکدارها و عمده‌فروش‌ها.
 *
 * کاری که امروز دستی انجام می‌شود: انباردار می‌بیند برنج تمام شده، به
 * سه بنکدار زنگ می‌زند، قیمت‌ها را روی کاغذ می‌نویسد، مقایسه می‌کند،
 * و سفارش می‌دهد.
 *
 * سه چیز در این مسیر گم می‌شود و هر سه اینجا بسته می‌شوند:
 *   • قیمت‌های استعلام‌شده هیچ‌جا نمی‌مانند — ماه بعد دوباره زنگ.
 *   • معلوم نیست چرا از این یکی خریدیم؛ اگر گران بود کسی نمی‌فهمد.
 *   • کالایی که یادشان رفت، تا روز تمام شدنش پیدا نمی‌شود.
 */
@Injectable()
export class PurchasingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly telephony: TelephonyService,
  ) {}

  // ------------------------------------------------------- ساخت استعلام

  /**
   * کالاهایی که باید خریده شوند — پیشنهاد اولیهٔ مریم.
   *
   * مقدار پیشنهادی تا **دو برابر** حداقل موجودی پر می‌شود، نه تا خودِ
   * حداقل: خریدی که دقیقاً به مرز می‌رساند، فردا دوباره کم می‌آید و
   * یک دور تماس دیگر می‌خواهد.
   */
  async suggestions(companyId: string, warehouseId?: string) {
    return this.db.query<Row>(
      `SELECT p.id AS "productId",
              p.name AS "productName",
              p.unit,
              p."purchasePrice" AS "lastPrice",
              COALESCE(SUM(i.quantity), 0) AS "onHand",
              p."minStock",
              GREATEST(p."minStock" * 2 - COALESCE(SUM(i.quantity), 0), 1) AS "suggestQty",
              (SELECT COUNT(*) FROM "PurchaseItem" pi
                 JOIN "Purchase" pu ON pu.id = pi."purchaseId"
                WHERE pi."productId" = p.id AND pu."companyId" = $1) AS "purchaseCount"
         FROM "Product" p
         LEFT JOIN "Inventory" i ON i."productId" = p.id
              ${warehouseId ? 'AND i."warehouseId" = $2' : ''}
        WHERE p."companyId" = $1
          AND p.status = 'ACTIVE'
          AND p."trackInventory" = true
        GROUP BY p.id, p.name, p.unit, p."purchasePrice", p."minStock"
       HAVING COALESCE(SUM(i.quantity), 0) < p."minStock"
        ORDER BY (COALESCE(SUM(i.quantity), 0) / NULLIF(p."minStock", 0)) ASC`,
      warehouseId ? [companyId, warehouseId] : [companyId],
    );
  }

  async createInquiry(
    companyId: string,
    userId: string,
    dto: {
      title?: string;
      warehouseId?: string;
      note?: string;
      items: Array<{ productId: string; qty: number }>;
    },
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('استعلام بدون قلم معنا ندارد');
    }

    return this.db.transaction(async (tx) => {
      const seq = await tx.query<{ next: string }>(
        `SELECT COALESCE(MAX(SUBSTRING("inquiryNo" FROM '^INQ-([0-9]{1,6})$')::int), 0) + 1 AS next
           FROM "PurchaseInquiry" WHERE "companyId" = $1`,
        [companyId],
      );
      const inquiryNo = `INQ-${String(seq.rows[0]?.next ?? 1).padStart(5, '0')}`;

      const created = await tx.query<Row>(
        `INSERT INTO "PurchaseInquiry"
           (id, "companyId", "inquiryNo", title, "warehouseId", note, "createdBy")
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          randomUUID(),
          companyId,
          inquiryNo,
          dto.title?.trim() || null,
          dto.warehouseId ?? null,
          dto.note?.trim() || null,
          userId,
        ],
      );
      const inquiry = created.rows[0] as { id: string };

      for (const item of dto.items) {
        const qty = Number(item.qty);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new BadRequestException('مقدار هر قلم باید بزرگ‌تر از صفر باشد');
        }

        // آخرین قیمت خرید همین‌جا ثبت می‌شود، نه هنگام مقایسه: قیمت
        // کالا فردا عوض می‌شود و آن‌وقت معلوم نیست پیشنهاد بنکدار
        // نسبت به چه چیزی گران بود.
        const product = await tx.query<{ purchasePrice: string }>(
          'SELECT "purchasePrice" FROM "Product" WHERE id = $1 AND "companyId" = $2',
          [item.productId, companyId],
        );
        if (!product.rows[0]) throw new NotFoundException('کالا یافت نشد');

        await tx.query(
          `INSERT INTO "PurchaseInquiryItem" (id, "inquiryId", "productId", qty, "lastPrice")
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT ("inquiryId", "productId") DO UPDATE SET qty = EXCLUDED.qty`,
          [randomUUID(), inquiry.id, item.productId, qty, product.rows[0].purchasePrice],
        );
      }

      return this.detail(companyId, inquiry.id, tx);
    });
  }

  // ------------------------------------------------------------- تماس

  /**
   * فهرست تماس: کدام بنکدار برای کدام قلم.
   *
   * تأمین‌کننده‌هایی که قبلاً همین کالاها را داده‌اند اول می‌آیند —
   * زنگ زدن به کسی که این کالا را نمی‌فروشد، وقت هر دو طرف را می‌برد.
   */
  async callList(companyId: string, inquiryId: string) {
    const inquiry = await this.detail(companyId, inquiryId);
    const productIds = (inquiry.items as Array<{ productId: string }>).map((i) => i.productId);

    const suppliers = await this.db.query<Row>(
      `SELECT s.id, s.name, s.phone,
              COUNT(DISTINCT pi."productId") AS "knownProducts",
              MAX(pu."createdAt") AS "lastPurchase"
         FROM "Supplier" s
         LEFT JOIN "Purchase" pu ON pu."supplierId" = s.id AND pu."companyId" = $1
         LEFT JOIN "PurchaseItem" pi ON pi."purchaseId" = pu.id
              AND pi."productId" = ANY($2::text[])
        WHERE s."companyId" = $1 AND s."isActive" = true
        GROUP BY s.id, s.name, s.phone
        ORDER BY COUNT(DISTINCT pi."productId") DESC, MAX(pu."createdAt") DESC NULLS LAST`,
      [companyId, productIds],
    );

    const calls = await this.db.query<Row>(
      `SELECT * FROM "SupplierCall" WHERE "inquiryId" = $1`,
      [inquiryId],
    );

    return suppliers.map((s) => ({
      ...s,
      call: calls.find((c) => c.supplierId === s.id) ?? null,
    }));
  }

  /**
   * ثبت تماس و قیمت‌های گرفته‌شده.
   *
   * همین یک متد هم برای تماس دستی کار می‌کند و هم برای ویپ: تفاوتشان
   * فقط `channel` است.  یکی کردنشان عمدی است — دو مسیر جدا یعنی دو
   * جای متفاوت برای اشتباه، و قیمتی که در یکی ثبت می‌شود و در دیگری نه.
   */
  /**
   * شماره‌گیری با بنکدار از راه مرکز تلفن.
   *
   * ⚠️ شماره از **پایگاه داده** خوانده می‌شود، نه از درخواست.
   *
   *    ورودی `supplierId` است نه شمارهٔ تلفن.  اگر شماره را از بدنه
   *    می‌گرفتیم، هر کاربرِ واردشده می‌توانست سامانه را به یک
   *    شماره‌گیرِ انبوه بدل کند و تماس‌ها از خطِ خودِ فروشگاه بیرون
   *    برود.  محدود کردن به تأمین‌کنندگانِ ثبت‌شده این را از ریشه
   *    می‌بندد.
   *
   * تماس **ثبت نمی‌شود**: ثبت کارِ `recordCall` است و پس از مکالمه
   * انجام می‌شود.  شماره‌گیری فقط زنگ می‌زند.  اگر همین‌جا ثبت می‌شد،
   * هر بار که بنکدار برنمی‌داشت یک «تماس» در آمار می‌نشست.
   */
  async dialSupplier(
    companyId: string,
    inquiryId: string,
    supplierId: string,
    operatorExtension: string,
  ) {
    const rows = await this.db.query<{
      name: string;
      phone: string | null;
      inquiryNo: string;
    }>(
      `SELECT s.name, s.phone, i."inquiryNo"
         FROM "Supplier" s
         JOIN "PurchaseInquiry" i ON i.id = $2 AND i."companyId" = $1
        WHERE s.id = $3 AND s."companyId" = $1`,
      [companyId, inquiryId, supplierId],
    );

    const supplier = rows[0];
    if (!supplier) throw new NotFoundException('تأمین‌کننده یا استعلام یافت نشد');
    if (!supplier.phone) {
      throw new BadRequestException(`شمارهٔ «${supplier.name}» ثبت نشده است`);
    }

    const { channelId } = await this.telephony.originate({
      phone: supplier.phone,
      operatorExtension,
      supplierName: supplier.name,
      inquiryNo: supplier.inquiryNo,
    });

    return { channelId, supplierName: supplier.name, phone: supplier.phone };
  }

  async recordCall(
    companyId: string,
    inquiryId: string,
    dto: {
      supplierId: string;
      status?: string;
      channel?: string;
      note?: string;
      transcript?: string;
      durationSec?: number;
      quotes?: Array<{
        productId: string;
        unitPrice: number;
        availableQty?: number;
        leadDays?: number;
        note?: string;
      }>;
    },
  ) {
    const inquiry = await this.db.query<{ id: string; status: string }>(
      'SELECT id, status FROM "PurchaseInquiry" WHERE id = $1 AND "companyId" = $2',
      [inquiryId, companyId],
    );
    if (!inquiry[0]) throw new NotFoundException('استعلام یافت نشد');
    if (['ORDERED', 'CANCELLED'].includes(inquiry[0].status)) {
      throw new BadRequestException('این استعلام بسته شده است');
    }

    return this.db.transaction(async (tx) => {
      const supplier = await tx.query<{ id: string; phone: string | null }>(
        'SELECT id, phone FROM "Supplier" WHERE id = $1 AND "companyId" = $2',
        [dto.supplierId, companyId],
      );
      if (!supplier.rows[0]) throw new NotFoundException('تأمین‌کننده یافت نشد');

      const hasQuotes = Boolean(dto.quotes?.length);
      const status = dto.status ?? (hasQuotes ? 'QUOTED' : 'ANSWERED');

      // ⚠️ `ON CONFLICT` باید دقیقاً ستون‌های قید را نام ببرد.
      //
      // مهاجرت ۰۳۵ قید را از `(inquiryId, supplierId)` به
      // `(companyId, inquiryId, supplierId)` برد.  پستگرس برای شکل
      // قدیمی «no unique or exclusion constraint matching the ON
      // CONFLICT specification» می‌دهد و **کل تراکنش** برمی‌گردد — یعنی
      // ثبت تماس با بنکدار بی‌صدا شکست می‌خورد.
      const call = await tx.query<{ id: string }>(
        `INSERT INTO "SupplierCall"
           (id, "companyId", "inquiryId", "supplierId", status, channel, phone,
            transcript, "durationSec", note, "calledAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT ("companyId", "inquiryId", "supplierId") DO UPDATE
           SET status = EXCLUDED.status,
               channel = EXCLUDED.channel,
               transcript = COALESCE(EXCLUDED.transcript, "SupplierCall".transcript),
               "durationSec" = COALESCE(EXCLUDED."durationSec", "SupplierCall"."durationSec"),
               note = COALESCE(EXCLUDED.note, "SupplierCall".note),
               "calledAt" = now(),
               "updatedAt" = now()
         RETURNING id`,
        [
          randomUUID(),
          companyId,
          inquiryId,
          dto.supplierId,
          status,
          dto.channel ?? 'MANUAL',
          supplier.rows[0].phone,
          dto.transcript?.trim() || null,
          dto.durationSec ?? null,
          dto.note?.trim() || null,
        ],
      );
      const callId = call.rows[0].id;

      for (const quote of dto.quotes ?? []) {
        const price = Number(quote.unitPrice);
        if (!Number.isFinite(price) || price <= 0) {
          throw new BadRequestException('قیمت پیشنهادی باید بزرگ‌تر از صفر باشد');
        }

        // قلمی که در استعلام نیست، قیمتش هم جایی ندارد.  بنکداری که
        // قیمت کالای دیگری داده، پیشنهادش نباید در مقایسه بیاید.
        const inList = await tx.query<{ id: string }>(
          'SELECT id FROM "PurchaseInquiryItem" WHERE "inquiryId" = $1 AND "productId" = $2',
          [inquiryId, quote.productId],
        );
        if (!inList.rows[0]) {
          throw new BadRequestException('این کالا در فهرست استعلام نیست');
        }

        await tx.query(
          `INSERT INTO "SupplierQuote"
             (id, "companyId", "callId", "productId", "unitPrice", "availableQty", "leadDays", note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT ("companyId", "callId", "productId") DO UPDATE
             SET "unitPrice" = EXCLUDED."unitPrice",
                 "availableQty" = EXCLUDED."availableQty",
                 "leadDays" = EXCLUDED."leadDays",
                 note = EXCLUDED.note`,
          [
            randomUUID(),
            companyId,
            callId,
            quote.productId,
            price,
            quote.availableQty ?? null,
            quote.leadDays ?? null,
            quote.note?.trim() || null,
          ],
        );
      }

      // اولین تماس، استعلام را از پیش‌نویس درمی‌آورد: از این به بعد
      // اقلام نباید عوض شوند، چون بنکدار اول روی فهرست قدیمی قیمت داده.
      await tx.query(
        `UPDATE "PurchaseInquiry"
            SET status = CASE WHEN status = 'DRAFT' THEN 'CALLING' ELSE status END,
                "updatedAt" = now()
          WHERE id = $1`,
        [inquiryId],
      );

      return { callId, quotesRecorded: dto.quotes?.length ?? 0 };
    });
  }

  // -------------------------------------------------------- مقایسه

  /** مقایسهٔ پیشنهادها و پیشنهاد برنده برای هر قلم. */
  async compare(companyId: string, inquiryId: string) {
    const inquiry = await this.detail(companyId, inquiryId);

    const needs: NeedLine[] = (
      inquiry.items as Array<{
        productId: string;
        productName: string;
        qty: string;
        lastPrice: string | null;
      }>
    ).map((i) => ({
      productId: i.productId,
      productName: i.productName,
      qty: Number(i.qty),
      lastPrice: i.lastPrice === null ? null : Number(i.lastPrice),
    }));

    const rows = await this.db.query<{
      callId: string;
      supplierId: string;
      supplierName: string;
      productId: string;
      unitPrice: string;
      availableQty: string | null;
      leadDays: number | null;
    }>(
      `SELECT q."callId", c."supplierId", s.name AS "supplierName",
              q."productId", q."unitPrice", q."availableQty", q."leadDays"
         FROM "SupplierQuote" q
         JOIN "SupplierCall" c ON c.id = q."callId"
         JOIN "Supplier" s ON s.id = c."supplierId"
        WHERE c."inquiryId" = $1 AND c."companyId" = $2`,
      [inquiryId, companyId],
    );

    const quotes: Quote[] = rows.map((r) => ({
      callId: r.callId,
      supplierId: r.supplierId,
      supplierName: r.supplierName,
      productId: r.productId,
      unitPrice: Number(r.unitPrice),
      availableQty: r.availableQty === null ? null : Number(r.availableQty),
      leadDays: r.leadDays,
    }));

    const winners = pickWinners(needs, quotes);

    return {
      inquiry: { id: inquiry.id, inquiryNo: inquiry.inquiryNo, status: inquiry.status },
      winners,
      summary: summarize(winners),
      bySupplier: groupBySupplier(winners),
      // تحلیل مدیریتی کنار مقایسه می‌آید نه در مسیر جدا: مدیری که
      // باید دو صفحه باز کند تا تصمیم بگیرد، تصمیم نمی‌گیرد.
      brief: brief(needs, quotes, winners),
    };
  }

  // --------------------------------------------------------- سفارش

  /**
   * تبدیل برندگان به فاکتور خرید — یکی به ازای هر تأمین‌کننده.
   *
   * قیمت خرید کالا هم از همین‌جا به‌روز می‌شود: قیمتی که در مکالمه با
   * بنکدار توافق شده، همان است که باید در سامانه بنشیند.  بدون این،
   * فروشنده ماه‌ها با قیمت خریدِ قدیمی حاشیهٔ سود را غلط حساب می‌کند.
   */
  async order(companyId: string, userId: string, inquiryId: string) {
    const comparison = await this.compare(companyId, inquiryId);

    if (!comparison.bySupplier.length) {
      throw new BadRequestException('هیچ پیشنهادی برای سفارش وجود ندارد');
    }

    const inquiry = await this.db.query<{ status: string; warehouseId: string | null }>(
      'SELECT status, "warehouseId" FROM "PurchaseInquiry" WHERE id = $1 AND "companyId" = $2',
      [inquiryId, companyId],
    );
    if (!inquiry[0]) throw new NotFoundException('استعلام یافت نشد');
    if (inquiry[0].status === 'ORDERED') {
      throw new BadRequestException('برای این استعلام قبلاً سفارش ثبت شده است');
    }

    return this.db.transaction(async (tx) => {
      const purchaseIds: string[] = [];

      for (const group of comparison.bySupplier) {
        const seq = await tx.query<{ next: string }>(
          `SELECT COALESCE(MAX(SUBSTRING("purchaseNo" FROM '^PUR-([0-9]{1,6})$')::int), 0) + 1 AS next
             FROM "Purchase" WHERE "companyId" = $1`,
          [companyId],
        );
        const purchaseNo = `PUR-${String(seq.rows[0]?.next ?? 1).padStart(5, '0')}`;

        const purchase = await tx.query<{ id: string }>(
          `INSERT INTO "Purchase"
             (id, "companyId", "supplierId", "warehouseId", "purchaseNo", status,
              subtotal, discount, tax, total, note)
           VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, 0, 0, $6, $7)
           RETURNING id`,
          [
            randomUUID(),
            companyId,
            group.supplierId,
            inquiry[0].warehouseId,
            purchaseNo,
            group.total,
            `از استعلام ${comparison.inquiry.inquiryNo}`,
          ],
        );
        const purchaseId = purchase.rows[0].id;
        purchaseIds.push(purchaseId);

        for (const line of group.lines) {
          const price = line.quote!.unitPrice;

          await tx.query(
            `INSERT INTO "PurchaseItem"
               (id, "purchaseId", "productId", quantity, "purchasePrice", total)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [randomUUID(), purchaseId, line.productId, line.qty, price, price * line.qty],
          );

          // قیمت خرید کالا با قیمت توافق‌شده به‌روز می‌شود.
          //
          // این همان چیزی است که مکالمه با بنکدار تولید می‌کند و بدون
          // آن، حاشیهٔ سود ماه‌ها با عدد قدیمی حساب می‌شود.
          await tx.query(
            'UPDATE "Product" SET "purchasePrice" = $1, "updatedAt" = now() WHERE id = $2 AND "companyId" = $3',
            [price, line.productId, companyId],
          );

          // پیشنهاد برنده علامت می‌خورد: بعداً «چرا از این خریدیم»
          // پاسخ دارد.
          await tx.query(
            'UPDATE "SupplierQuote" SET "isSelected" = true WHERE "callId" = $1 AND "productId" = $2',
            [line.quote!.callId, line.productId],
          );
        }
      }

      await tx.query(
        `UPDATE "PurchaseInquiry"
            SET status = 'ORDERED', "purchaseId" = $2, "updatedAt" = now()
          WHERE id = $1`,
        [inquiryId, purchaseIds[0]],
      );

      return {
        ordered: purchaseIds.length,
        purchaseIds,
        total: comparison.summary.total,
        uncovered: comparison.summary.uncovered,
      };
    });
  }

  // -------------------------------------------------------- خواندن

  async list(companyId: string, status?: string) {
    const params: unknown[] = [companyId];
    let where = '"companyId" = $1';
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }

    return this.db.query<Row>(
      `SELECT i.*,
              (SELECT COUNT(*) FROM "PurchaseInquiryItem" WHERE "inquiryId" = i.id) AS "itemCount",
              (SELECT COUNT(*) FROM "SupplierCall" WHERE "inquiryId" = i.id) AS "callCount",
              (SELECT COUNT(*) FROM "SupplierCall"
                WHERE "inquiryId" = i.id AND status = 'QUOTED') AS "quotedCount"
         FROM "PurchaseInquiry" i
        WHERE ${where}
        ORDER BY i."createdAt" DESC
        LIMIT 200`,
      params,
    );
  }

  async detail(
    companyId: string,
    inquiryId: string,
    tx?: { query: DatabaseService['query'] },
  ): Promise<Row & { id: string; inquiryNo: string; status: string; items: Row[] }> {
    const run = tx ?? this.db;

    const rows = await run.query<Row>(
      'SELECT * FROM "PurchaseInquiry" WHERE id = $1 AND "companyId" = $2',
      [inquiryId, companyId],
    );
    const inquiry = (Array.isArray(rows) ? rows : (rows as { rows: Row[] }).rows)[0];
    if (!inquiry) throw new NotFoundException('استعلام یافت نشد');

    const itemRows = await run.query<Row>(
      `SELECT it.*, p.name AS "productName", p.unit
         FROM "PurchaseInquiryItem" it
         JOIN "Product" p ON p.id = it."productId"
        WHERE it."inquiryId" = $1
        ORDER BY p.name`,
      [inquiryId],
    );

    return {
      ...inquiry,
      items: Array.isArray(itemRows) ? itemRows : (itemRows as { rows: Row[] }).rows,
    } as Row & { id: string; inquiryNo: string; status: string; items: Row[] };
  }

  /** تاریخچهٔ قیمت یک کالا نزد تأمین‌کننده‌های مختلف. */
  /**
   * کارنامهٔ بنکداران — مقایسه در طول زمان، نه در یک استعلام.
   *
   * `compare` می‌گوید در **این** استعلام چه کسی ارزان‌تر بود.  ولی
   * مدیری که می‌خواهد بداند «با کدام بنکدار کار کنم» به چیز دیگری
   * نیاز دارد: چه کسی همیشه ارزان‌تر است، چه کسی جواب می‌دهد، و چه
   * کسی سرِ وقت می‌رساند.
   *
   * چهار عدد که هرکدام تصمیم متفاوتی را روشن می‌کنند:
   *
   *   `answerRate`  چند درصد تماس‌ها به قیمت رسید.  بنکداری که جواب
   *                 نمی‌دهد، وقتِ مریم را می‌گیرد.
   *   `winRate`     چند درصد قیمت‌هایش برنده شد.  صفر یعنی همیشه
   *                 گران‌تر است و زنگ زدنش فایده ندارد.
   *   `avgGapPct`   به‌طور میانگین چقدر از ارزان‌ترین قیمتِ همان قلم
   *                 دورتر بوده.  عددِ اصلیِ «گران یا ارزان».
   *   `avgLeadDays` میانگین روز تحویل.  ارزانی که دیر می‌رساند، برای
   *                 قفسهٔ خالی جواب نیست.
   */
  async supplierScorecard(companyId: string, days = 180) {
    const since = new Date(Date.now() - days * 86_400_000);

    const rows = await this.db.query<{
      supplierId: string;
      supplierName: string;
      phone: string | null;
      calls: string;
      answered: string;
      quoteCount: string;
      wins: string;
      avgLeadDays: string | null;
      avgGapPct: string | null;
    }>(
      `WITH q AS (
         SELECT c."supplierId", q."productId", q."callId",
                q."unitPrice", q."isSelected", q."leadDays",
                -- ارزان‌ترین قیمتِ همین قلم در همین استعلام: مبنای
                -- «چقدر گران‌تر بود».  مقایسه با میانگینِ کل غلط است،
                -- چون قیمت‌ها در طول ماه‌ها بالا می‌روند.
                MIN(q."unitPrice") OVER (PARTITION BY c."inquiryId", q."productId")
                  AS "bestOfLine"
           FROM "SupplierQuote" q
           JOIN "SupplierCall" c ON c.id = q."callId"
          WHERE q."companyId" = $1 AND q."createdAt" >= $2
       )
       SELECT s.id AS "supplierId", s.name AS "supplierName", s.phone,
              count(DISTINCT c.id)::text AS calls,
              count(DISTINCT c.id) FILTER (
                WHERE c.status IN ('ANSWERED','QUOTED'))::text AS answered,
              count(q."callId")::text AS "quoteCount",
              count(*) FILTER (WHERE q."isSelected")::text AS wins,
              avg(q."leadDays")::text AS "avgLeadDays",
              -- درصد فاصله از بهترین قیمتِ همان سطر
              avg(
                CASE WHEN q."bestOfLine" > 0
                     THEN (q."unitPrice" - q."bestOfLine") / q."bestOfLine" * 100
                END
              )::text AS "avgGapPct"
         FROM "Supplier" s
         JOIN "SupplierCall" c ON c."supplierId" = s.id AND c."companyId" = $1
         LEFT JOIN q ON q."callId" = c.id
        WHERE s."companyId" = $1 AND c."calledAt" >= $2
        GROUP BY s.id, s.name, s.phone
        ORDER BY s.name`,
      [companyId, since],
    );

    const pct = (part: number, whole: number) =>
      whole > 0 ? Math.round((part / whole) * 100) : null;

    // ⚠️ «برد» یعنی از او خریده شد، نه اینکه در مقایسه ارزان‌تر بود.
    //
    //    `isSelected` هنگام ثبت سفارش تنظیم می‌شود.  پس تا وقتی
    //    سفارشی ثبت نشده، همه صفر برد دارند — و «۰٪ برد» یعنی «همیشه
    //    بازنده»، در حالی که واقعیت «هنوز خریدی نشده» است.
    //
    //    دو حالت کاملاً متفاوت که یک عدد نشان می‌دادند.  وقتی هیچ
    //    سفارشی در بازه نبوده، سنجه تعریف‌نشده است نه صفر.
    const anyOrdered = rows.some((r) => Number(r.wins) > 0);

    return rows.map((r) => {
      const calls = Number(r.calls);
      const answered = Number(r.answered);
      const quoteCount = Number(r.quoteCount);
      const wins = Number(r.wins);

      return {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        phone: r.phone,
        calls,
        answered,
        quoteCount,
        wins,
        answerRate: pct(answered, calls),
        // نسبت برد روی **قیمت‌های داده‌شده** حساب می‌شود نه تماس‌ها:
        // بنکداری که یک بار قیمت داد و برد، ۱۰۰٪ است — و همین درست
        // است، چون سنجه دربارهٔ قیمت اوست نه در دسترس بودنش.
        winRate: anyOrdered ? pct(wins, quoteCount) : null,
        avgGapPct: r.avgGapPct === null ? null : Math.round(Number(r.avgGapPct) * 10) / 10,
        avgLeadDays: r.avgLeadDays === null ? null : Math.round(Number(r.avgLeadDays)),
        days,
      };
    });
  }

  async priceHistory(companyId: string, productId: string) {
    return this.db.query<Row>(
      `SELECT q."unitPrice", q."availableQty", q."leadDays", q."isSelected", q."createdAt",
              s.name AS "supplierName", i."inquiryNo"
         FROM "SupplierQuote" q
         JOIN "SupplierCall" c ON c.id = q."callId"
         JOIN "Supplier" s ON s.id = c."supplierId"
         JOIN "PurchaseInquiry" i ON i.id = c."inquiryId"
        WHERE q."companyId" = $1 AND q."productId" = $2
        ORDER BY q."createdAt" DESC
        LIMIT 100`,
      [companyId, productId],
    );
  }
}
