import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { PostingService } from '../accounting/posting.service';
import { ACCOUNTS } from '../accounting/posting-rules';
import { applyStockDelta } from './inventory.service';

/**
 * کالای امانی.
 *
 * ---------- دو جهت که فقط اسمشان شبیه است ----------
 *
 *   OUT  داده‌ایم — مالِ ماست، جای دیگری است.
 *   IN   گرفته‌ایم — دستِ ماست، مالِ ما نیست.
 *
 * ---------- تلهٔ اصلی: امانی دادن فروش نیست ----------
 *
 * ⚠️ وسوسه‌انگیز است که خروجِ کالا را فروش ثبت کنیم؛ انبار خالی می‌شود و
 *    فاکتور صادر.  ولی تا امانت‌گیر نفروخته، نه درآمدی محقق شده و نه
 *    مالکیت منتقل.
 *
 *    ثبتِ زودهنگام یعنی درآمدِ امسال بالا و سالِ بعد پایین — و اگر کالا
 *    برگردد، یک فروشِ برگشتیِ ساختگی که هیچ‌وقت اتفاق نیفتاده.
 *
 *    پس سندِ خروج این است:
 *      بدهکار ۱۱۰۸ موجودی امانیِ نزد دیگران / بستانکار ۱۱۰۴ موجودی کالا
 *    دارایی جابه‌جا می‌شود، نه اینکه درآمد بسازد.
 *
 * ---------- تلهٔ قرینه: امانیِ گرفته‌شده دارایی ما نیست ----------
 *
 * ⚠️ این تنها جایی در این سامانه است که «هیچ سندی نمی‌خورد» **درست**
 *    است.
 *
 *    شش نشتِ خاموشی که این هفته بسته شد همه از نبودِ سند بودند؛ اینجا
 *    برعکس است: زدنِ سند یعنی دارایی‌ای که مالِ ما نیست در ترازنامه
 *    بنشیند.  کالای امانیِ گرفته‌شده به `Inventory` هم اضافه نمی‌شود.
 *
 * ⚠️ [به‌روزرسانی — مهاجرت ۰۸۷] **از صندوق فروخته می‌شود.**
 *
 *    یادداشتِ قبلی می‌گفت نمی‌شود، چون در `Inventory` نیست.  حالا
 *    `SalesService.drawFromConsignment` وقتی موجودیِ خودی کفاف نداد
 *    سراغِ امانی می‌رود و `SaleItem."consignmentItemId"` را پر می‌کند.
 *
 *    قاعده‌اش **همه یا هیچ** است: سطر یا کاملاً از انبار می‌آید یا
 *    کاملاً از امانی.  یک سطرِ فروش یک بهای تمام‌شده و یک مقصدِ
 *    حسابداری دارد؛ نصفه‌نصفه کردنش یعنی مرجوعی هیچ جوابِ درستی ندارد.
 *
 *    و بهای تمام‌شده‌اش در سندِ `ConsignmentInSettle` می‌خورد، نه در
 *    `SaleCogs` — وگرنه دو بار ثبت می‌شود و بستانکارش هم غلط است
 *    (`SaleCogs` موجودی کالا را می‌بندد، که ما هرگز نداشتیم).
 */

type Row = Record<string, unknown>;

@Injectable()
export class ConsignmentService {
  constructor(
    private readonly db: DatabaseService,
    private readonly posting: PostingService,
  ) {}

  // ------------------------------------------------------- خواندن

  async list(companyId: string, direction?: string, status?: string) {
    const values: unknown[] = [companyId];
    const where = [`c."companyId" = $1`];
    if (direction) { values.push(direction); where.push(`c.direction = $${values.length}`); }
    if (status)    { values.push(status);    where.push(`c.status = $${values.length}`); }

    return this.db.query<Row>(
      `SELECT c.*,
              btrim(concat_ws(' ', cu."firstName", cu."lastName")) AS "customerName",
              su.name AS "supplierName",
              (SELECT count(*) FROM "ConsignmentItem" i WHERE i."consignmentId" = c.id)::int
                AS "itemCount",
              (SELECT COALESCE(sum(i.quantity - i."settledQty" - i."returnedQty"), 0)
                 FROM "ConsignmentItem" i WHERE i."consignmentId" = c.id) AS "openQty"
         FROM "Consignment" c
         LEFT JOIN "Customer" cu ON cu.id = c."customerId"
         LEFT JOIN "Supplier" su ON su.id = c."supplierId"
        WHERE ${where.join(' AND ')}
        ORDER BY c."createdAt" DESC
        LIMIT 500`,
      values,
    );
  }

  async findOne(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      `SELECT c.*,
              btrim(concat_ws(' ', cu."firstName", cu."lastName")) AS "customerName",
              su.name AS "supplierName"
         FROM "Consignment" c
         LEFT JOIN "Customer" cu ON cu.id = c."customerId"
         LEFT JOIN "Supplier" su ON su.id = c."supplierId"
        WHERE c.id = $1 AND c."companyId" = $2`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('سند امانی یافت نشد');

    const items = await this.db.query<Row>(
      `SELECT i.*, p.name AS "productName", p.sku, p.unit,
              (i.quantity - i."settledQty" - i."returnedQty") AS "openQty"
         FROM "ConsignmentItem" i
         JOIN "Product" p ON p.id = i."productId"
        WHERE i."consignmentId" = $1
        ORDER BY p.name`,
      [id],
    );
    return { ...rows[0], items: items.map((i) => this.num(i)) };
  }

  // ------------------------------------------------------- ساخت

  async create(
    companyId: string,
    dto: {
      direction?: string;
      customerId?: string;
      supplierId?: string;
      warehouseId?: string;
      note?: string;
      items?: Array<{ productId?: string; quantity?: number; unitPrice?: number }>;
    },
    userId?: string,
  ) {
    const direction = dto?.direction;
    if (direction !== 'OUT' && direction !== 'IN') {
      throw new BadRequestException('جهت باید OUT یا IN باشد');
    }
    if (direction === 'OUT' && !dto.customerId) {
      throw new BadRequestException('برای امانیِ داده‌شده، مشتری الزامی است');
    }
    if (direction === 'IN' && !dto.supplierId) {
      throw new BadRequestException('برای امانیِ گرفته‌شده، تأمین‌کننده الزامی است');
    }
    if (direction === 'OUT' && !dto.warehouseId) {
      throw new BadRequestException('برای امانیِ داده‌شده، انبار الزامی است');
    }
    if (!Array.isArray(dto.items) || !dto.items.length) {
      throw new BadRequestException('حداقل یک قلم لازم است');
    }
    for (const [i, item] of dto.items.entries()) {
      if (!item?.productId) throw new BadRequestException(`قلم ${i + 1}: کالا ندارد`);
      const q = Number(item.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        throw new BadRequestException(`قلم ${i + 1}: مقدار باید بزرگ‌تر از صفر باشد`);
      }
    }

    return this.db.transaction(async (tx) => {
      const id = randomUUID();
      const docNo = await this.nextNo(tx, companyId, direction);

      await tx.query(
        `INSERT INTO "Consignment"
           (id, "companyId", direction, "docNo", "customerId", "supplierId",
            "warehouseId", note, "userId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          id, companyId, direction, docNo,
          direction === 'OUT' ? dto.customerId : null,
          direction === 'IN' ? dto.supplierId : null,
          direction === 'OUT' ? dto.warehouseId : null,
          dto.note ?? null, userId ?? null,
        ],
      );

      let totalCost = 0;

      for (const item of dto.items!) {
        const qty = Number(item.quantity);
        let unitCost: number | null = null;

        if (direction === 'OUT') {
          // ⚠️ بها **پیش از** خروج خوانده می‌شود.
          //    پس از کم شدنِ موجودی، میانگین همان است ولی خواندنش بعد از
          //    تغییر، به فرضِ نانوشته تکیه می‌کند.
          const inv = await tx.query<{ avgCost: string | null }>(
            `SELECT "avgCost" FROM "Inventory"
              WHERE "warehouseId" = $1 AND "productId" = $2`,
            [dto.warehouseId, item.productId],
          );
          unitCost = inv.rows[0]?.avgCost != null ? Number(inv.rows[0].avgCost) : null;

          const moved = await applyStockDelta(
            tx,
            dto.warehouseId!,
            item.productId!,
            -qty,
            {
              companyId,
              // ⚠️ `TRANSFER_OUT` نه `ADJUST`: کالا جابه‌جا می‌شود، نه
              //    اینکه شمارش اصلاح شود.  در کاردکس این تفاوت همان
              //    چیزی است که «کجا رفت» را پاسخ می‌دهد.
              reason: 'TRANSFER_OUT',
              userId: userId ?? null,
              refType: 'Consignment',
              refId: id,
              note: `امانی ${docNo}`,
            },
          );
          if (!moved) {
            throw new BadRequestException(
              `موجودی کافی نیست برای کالای ${item.productId}`,
            );
          }
          totalCost += (unitCost ?? 0) * qty;
        }

        await tx.query(
          `INSERT INTO "ConsignmentItem"
             (id, "companyId", "consignmentId", "productId", quantity, "unitPrice", "unitCost")
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            randomUUID(), companyId, id, item.productId, qty,
            Number(item.unitPrice ?? 0), unitCost,
          ],
        );
      }

      // ⚠️ سند فقط برای OUT، و فقط جابه‌جاییِ دارایی — نه درآمد.
      //
      //    برای IN عمداً هیچ سندی نمی‌خورد: کالا مالِ ما نیست و ثبتش
      //    ترازنامه را با دارایی‌ای که نداریم متورم می‌کند.
      if (direction === 'OUT' && totalCost > 0.005) {
        await this.posting.postIn(tx, companyId, {
          sourceType: 'ConsignmentOut',
          sourceId: id,
          description: `خروج امانی ${docNo}`,
          userId: userId ?? null,
          lines: [
            {
              accountCode: ACCOUNTS.consignedInventory,
              debit: totalCost,
              description: 'موجودی امانی نزد دیگران',
            },
            {
              accountCode: ACCOUNTS.inventory,
              credit: totalCost,
              description: 'خروج از انبار',
            },
          ],
        });
      }

      return { id, docNo, direction, itemCount: dto.items!.length };
    });
  }

  // ------------------------------------------------------- تسویه و برگشت

  /**
   * تسویه — امانت‌گیر فروخته، یا ما امانیِ گرفته‌شده را فروخته‌ایم.
   *
   * ⚠️ **اینجاست که درآمد محقق می‌شود، نه هنگام خروج.**
   */
  settle(companyId: string, itemId: string, qty?: number, userId?: string) {
    return this.move(companyId, itemId, qty, 'SETTLE', userId);
  }

  /** برگشت — کالای نفروخته برمی‌گردد. */
  returnItem(companyId: string, itemId: string, qty?: number, userId?: string) {
    return this.move(companyId, itemId, qty, 'RETURN', userId);
  }

  private async move(
    companyId: string,
    itemId: string,
    rawQty: number | undefined,
    kind: 'SETTLE' | 'RETURN',
    userId?: string,
  ) {
    const qty = Number(rawQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new BadRequestException('مقدار باید بزرگ‌تر از صفر باشد');
    }

    return this.db.transaction(async (tx) => {
      // ⚠️ قفلِ سطر پیش از خواندنِ مانده — وگرنه دو تسویهٔ هم‌زمان هر دو
      //    مجاز می‌شوند.  قیدِ پایگاه‌داده هم پشتش هست، ولی پیامِ خطا
      //    این‌جا قابلِ فهم‌تر است.
      const rows = await tx.query<{
        id: string;
        consignmentId: string;
        productId: string;
        quantity: string;
        settledQty: string;
        returnedQty: string;
        unitCost: string | null;
        unitPrice: string;
        direction: string;
        warehouseId: string | null;
        docNo: string;
      }>(
        `SELECT i.*, c.direction, c."warehouseId", c."docNo"
           FROM "ConsignmentItem" i
           JOIN "Consignment" c ON c.id = i."consignmentId"
          WHERE i.id = $1 AND i."companyId" = $2
          FOR UPDATE OF i`,
        [itemId, companyId],
      );
      const item = rows.rows[0];
      if (!item) throw new NotFoundException('قلم امانی یافت نشد');

      const open =
        Number(item.quantity) - Number(item.settledQty) - Number(item.returnedQty);
      if (qty > open + 0.0005) {
        throw new BadRequestException(`ماندهٔ امانی ${open} است و کفاف ${qty} را نمی‌دهد`);
      }

      const column = kind === 'SETTLE' ? 'settledQty' : 'returnedQty';
      await tx.query(
        `UPDATE "ConsignmentItem"
            SET "${column}" = "${column}" + $1, "updatedAt" = now()
          WHERE id = $2`,
        [qty, itemId],
      );

      const unitCost = item.unitCost != null ? Number(item.unitCost) : 0;
      const cost = unitCost * qty;
      const revenue = Number(item.unitPrice) * qty;

      if (item.direction === 'OUT' && kind === 'RETURN') {
        // کالا به انبار برمی‌گردد، با همان بهایی که رفته بود.
        await applyStockDelta(
          tx, item.warehouseId!, item.productId, qty,
          {
            companyId, reason: 'TRANSFER_IN', userId: userId ?? null,
            refType: 'Consignment', refId: item.consignmentId,
            note: `برگشت امانی ${item.docNo}`,
          },
          item.unitCost != null ? unitCost : null,
        );
        if (cost > 0.005) {
          await this.posting.postIn(tx, companyId, {
            sourceType: 'ConsignmentReturn',
            sourceId: `${itemId}:${Date.now()}`,
            description: `برگشت امانی ${item.docNo}`,
            userId: userId ?? null,
            lines: [
              { accountCode: ACCOUNTS.inventory, debit: cost, description: 'برگشت به انبار' },
              {
                accountCode: ACCOUNTS.consignedInventory,
                credit: cost,
                description: 'کاهش امانی نزد دیگران',
              },
            ],
          });
        }
      }

      if (item.direction === 'OUT' && kind === 'SETTLE') {
        // ⚠️ اینجا فروش محقق می‌شود: طلب و درآمد، و جدا بهای تمام‌شده.
        const lines: Array<{
          accountCode: string;
          debit?: number;
          credit?: number;
          description: string;
        }> = [
          { accountCode: ACCOUNTS.receivable, debit: revenue, description: 'طلب از امانت‌گیر' },
          { accountCode: ACCOUNTS.salesRevenue, credit: revenue, description: 'فروش امانی' },
        ];
        if (cost > 0.005) {
          lines.push(
            { accountCode: ACCOUNTS.cogs, debit: cost, description: 'بهای تمام‌شدهٔ امانی' },
            {
              accountCode: ACCOUNTS.consignedInventory,
              credit: cost,
              description: 'کاهش امانی نزد دیگران',
            },
          );
        }
        if (revenue > 0.005 || cost > 0.005) {
          await this.posting.postIn(tx, companyId, {
            sourceType: 'ConsignmentSettle',
            sourceId: `${itemId}:${Date.now()}`,
            description: `تسویهٔ امانی ${item.docNo}`,
            userId: userId ?? null,
            lines,
          });
        }
      }

      if (item.direction === 'IN' && kind === 'SETTLE') {
        // ⚠️ امانیِ گرفته‌شده: با تسویه **بدهی** به مالک ایجاد می‌شود.
        //    درآمدش از مسیرِ فروشِ عادی می‌آید، نه از این‌جا.
        if (revenue > 0.005) {
          await this.posting.postIn(tx, companyId, {
            sourceType: 'ConsignmentInSettle',
            sourceId: `${itemId}:${Date.now()}`,
            description: `تسویهٔ امانیِ گرفته‌شده ${item.docNo}`,
            userId: userId ?? null,
            lines: [
              { accountCode: ACCOUNTS.cogs, debit: revenue, description: 'بهای کالای امانی' },
              { accountCode: ACCOUNTS.payable, credit: revenue, description: 'بدهی به مالک امانی' },
            ],
          });
        }
      }

      // بستنِ خودکار وقتی چیزی باقی نمانده.
      await tx.query(
        `UPDATE "Consignment" SET status = 'CLOSED', "updatedAt" = now()
          WHERE id = $1 AND NOT EXISTS (
            SELECT 1 FROM "ConsignmentItem"
             WHERE "consignmentId" = $1
               AND quantity - "settledQty" - "returnedQty" > 0.0005
          )`,
        [item.consignmentId],
      );

      return { itemId, kind, qty, remaining: open - qty };
    });
  }

  /**
   * گزارشِ باز — «کالای ما کجاست» و «کالای دیگران دستِ ما چیست».
   *
   * ⚠️ این تنها جایی است که امانیِ گرفته‌شده دیده می‌شود، چون در
   *    `Inventory` نیست.  بدونِ این گزارش، عملاً وجود ندارد.
   */
  async openReport(companyId: string) {
    const rows = await this.db.query<Row>(
      `SELECT c.direction, c."docNo",
              btrim(concat_ws(' ', cu."firstName", cu."lastName")) AS "customerName",
              su.name AS "supplierName",
              p.name AS "productName", p.sku,
              (i.quantity - i."settledQty" - i."returnedQty") AS "openQty",
              i."unitPrice", i."unitCost", c."createdAt"
         FROM "ConsignmentItem" i
         JOIN "Consignment" c ON c.id = i."consignmentId"
         JOIN "Product" p ON p.id = i."productId"
         LEFT JOIN "Customer" cu ON cu.id = c."customerId"
         LEFT JOIN "Supplier" su ON su.id = c."supplierId"
        WHERE i."companyId" = $1
          AND i.quantity - i."settledQty" - i."returnedQty" > 0.0005
        ORDER BY c.direction, c."createdAt"`,
      [companyId],
    );

    const items = rows.map((r) => this.num(r));
    return {
      out: items.filter((i) => i.direction === 'OUT'),
      in: items.filter((i) => i.direction === 'IN'),
      // ارزشِ کالای خودمان که جای دیگری است — همان ماندهٔ حساب ۱۱۰۸.
      outValue: items
        .filter((i) => i.direction === 'OUT')
        .reduce((a, i) => a + Number(i.openQty) * Number(i.unitCost ?? 0), 0),
    };
  }

  // ------------------------------------------------------- کمکی

  private async nextNo(tx: { query: Function }, companyId: string, direction: string) {
    const prefix = direction === 'OUT' ? 'AMO' : 'AMI';
    const rows = await tx.query(
      `SELECT COUNT(*)::int AS n FROM "Consignment"
        WHERE "companyId" = $1 AND direction = $2`,
      [companyId, direction],
    );
    return `${prefix}-${String((rows.rows[0]?.n ?? 0) + 1).padStart(5, '0')}`;
  }

  /** `NUMERIC` رشته برمی‌گردد؛ همان تلهٔ همیشگی. */
  private num(row: Row): Row {
    const out: Row = { ...row };
    for (const k of ['quantity', 'settledQty', 'returnedQty', 'openQty', 'unitPrice', 'unitCost']) {
      if (out[k] !== undefined && out[k] !== null) out[k] = Number(out[k]);
    }
    return out;
  }
}
