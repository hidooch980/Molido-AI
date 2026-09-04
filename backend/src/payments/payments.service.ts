import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PostingService } from '../accounting/posting.service';
import { collectionEntry } from '../accounting/posting-rules';

type Payment = Record<string, unknown> & { id: string };

/** A payment belongs to the company that owns either its sale or its cash box. */
const COMPANY_SCOPE = `(
  EXISTS (SELECT 1 FROM "Sale" s WHERE s.id = p."saleId" AND s."companyId" = $1)
  OR EXISTS (SELECT 1 FROM "CashBox" c WHERE c.id = p."cashBoxId" AND c."companyId" = $1)
)`;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly posting: PostingService,
  ) {}

  async findAll(companyId: string, saleId?: string) {
    const values: unknown[] = [companyId];
    let where = COMPANY_SCOPE;
    if (saleId) {
      values.push(saleId);
      where += ` AND p."saleId" = $${values.length}`;
    }
    return this.db.query<Payment>(
      `SELECT p.*, s."invoiceNo", s.total AS "saleTotal", c.name AS "cashBoxName", c.code AS "cashBoxCode"
       FROM "Payment" p
       LEFT JOIN "Sale" s ON s.id = p."saleId"
       LEFT JOIN "CashBox" c ON c.id = p."cashBoxId"
       WHERE ${where} ORDER BY p."createdAt" DESC`,
      values,
    );
  }

  async findOne(id: string, companyId: string) {
    const payments = await this.db.query<Payment>(
      `SELECT p.*, row_to_json(s.*) AS sale, row_to_json(c.*) AS "cashBox"
       FROM "Payment" p
       LEFT JOIN "Sale" s ON s.id = p."saleId"
       LEFT JOIN "CashBox" c ON c.id = p."cashBoxId"
       WHERE p.id = $2 AND ${COMPANY_SCOPE}`,
      [companyId, id],
    );
    if (!payments[0]) throw new NotFoundException('پرداخت یافت نشد');
    return payments[0];
  }

  /**
   * ثبت پرداخت برای فاکتور فروش + به‌روزرسانی وضعیت فاکتور و صندوق.
   * The sale row is locked for the duration so two concurrent payments cannot
   * both pass the remaining-balance check.
   */
  async create(
    companyId: string,
    data: {
      saleId: string;
      amount: number;
      method?: string;
      cashBoxId?: string;
      referenceNo?: string;
      note?: string;
    },
  ) {
    if (data.amount <= 0) {
      throw new BadRequestException('مبلغ پرداخت باید بزرگ‌تر از صفر باشد');
    }

    return this.db.transaction(async (tx) => {
      const sales = await tx.query<{ id: string; status: string; total: string }>(
        'SELECT id, status, total FROM "Sale" WHERE id = $1 AND "companyId" = $2 FOR UPDATE',
        [data.saleId, companyId],
      );
      const sale = sales.rows[0];
      if (!sale) throw new NotFoundException('فاکتور فروش یافت نشد');
      if (sale.status === 'CANCELLED') {
        throw new BadRequestException('فاکتور لغوشده قابل پرداخت نیست');
      }

      const paid = await tx.query<{ sum: string }>(
        `SELECT COALESCE(sum(amount), 0)::text AS sum FROM "Payment"
         WHERE "saleId" = $1 AND status = 'COMPLETED'`,
        [sale.id],
      );
      const paidSoFar = Number(paid.rows[0]?.sum ?? 0);
      const remaining = Number(sale.total) - paidSoFar;

      if (data.amount > remaining) {
        throw new BadRequestException(
          `مبلغ پرداخت بیشتر از مانده فاکتور (${remaining}) است`,
        );
      }

      const payment = await tx.query<Payment>(
        `INSERT INTO "Payment" (id, "saleId", "cashBoxId", method, status, amount, "referenceNo", note)
         VALUES ($1, $2, $3, $4, 'COMPLETED', $5, $6, $7) RETURNING *`,
        [
          randomUUID(),
          data.saleId,
          data.cashBoxId ?? null,
          data.method ?? 'CASH',
          data.amount,
          data.referenceNo ?? null,
          data.note ?? null,
        ],
      );

      if (data.cashBoxId) {
        await tx.query(
          'UPDATE "CashBox" SET balance = balance + $1, "updatedAt" = now() WHERE id = $2',
          [data.amount, data.cashBoxId],
        );
      }

      // ⚠️ **سند، در همان تراکنش.**
      //
      //    تا امروز این وصول هیچ سندی نمی‌زد.  اندازه‌گیری شد: پرداختِ
      //    ۱۰۰٬۰۰۰ موجودیِ صندوق را بالا برد و ۱۱۰۱ و ۱۱۰۳ هر دو صفر
      //    تکان خوردند.
      //
      //    نتیجه‌اش این بود که فاکتور بدهی می‌ساخت (فروش سند می‌زند:
      //    دریافتنی بدهکار) ولی وصولش آن بدهی را پاک نمی‌کرد.  مشتری
      //    در دفتر برای همیشه بدهکار می‌ماند و ماندهٔ مطالبات بی‌پایان
      //    بالا می‌رفت — در حالی که پول در صندوق بود.
      //
      //    و هیچ آزمونی نمی‌گرفتش، چون **تراز آزمایشی صفر می‌ماند**:
      //    وقتی اصلاً سندی زده نمی‌شود، چیزی هم نامتراز نمی‌شود.
      //
      // ⚠️ `collectionEntry` از قبل وجود داشت و `payInstallment` از آن
      //    استفاده می‌کرد.  فقط اینجا وصل نشده بود.
      await this.posting.postAuto(tx, companyId, {
        sourceType: 'SalePayment',
        sourceId: String(payment.rows[0].id),
        description: `وصول فاکتور ${sale.id}`,
        lines: collectionEntry({
          amount: data.amount,
          method: data.method ?? 'CASH',
          description: 'وصول از مشتری',
        }),
      });

      await tx.query('UPDATE "Sale" SET status = $1, "updatedAt" = now() WHERE id = $2', [
        paidSoFar + data.amount >= Number(sale.total) ? 'PAID' : 'PARTIAL',
        sale.id,
      ]);

      return payment.rows[0];
    });
  }
}
