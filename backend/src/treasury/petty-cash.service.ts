import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { PostingService } from '../accounting/posting.service';
import { ACCOUNTS } from '../accounting/posting-rules';
import { formatJalali } from '../common/jalali';

/**
 * تنخواه گردان.
 *
 * صندوقِ کوچکی که دستِ یک نفر است تا خرج‌های خرد را بدونِ چرخهٔ خرید
 * انجام دهد: کرایه، نان، تعمیرِ فوری.
 *
 * ---------- سه چیزی که این را از «یک صندوقِ دیگر» جدا می‌کند ----------
 *
 * صندوق **جای پول** است؛ تنخواه **مسئولیتِ یک شخص**.  پس سقف دارد،
 * تنخواه‌دار دارد، و باید تسویه شود.
 *
 * ---------- ماندهٔ ذخیره‌نشده ----------
 *
 * ⚠️ مانده ستون ندارد و از سطرها حساب می‌شود.
 *
 *    `CashBox` ستونِ `balance` دارد و آن‌جا درست است: صندوقِ فروشگاه
 *    هزاران تراکنش در روز دارد.  تنخواه ماهی چند سطر دارد؛ ستونِ مانده
 *    آن‌جا فقط یک راهِ تازه برای واگرایی است.  با محاسبه از سطرها،
 *    «مانده غلط است» ممکن نیست.
 *
 * ---------- سندِ حسابداری ----------
 *
 * ⚠️ هر گردش سند می‌خورد، و در **همان تراکنش**.
 *
 *    این هفته شش نشتِ خاموشِ حسابداری بسته شد که همه‌شان یک ریشه
 *    داشتند: پولی جابه‌جا شد و هیچ سندی نوشته نشد.  ترازِ کل صفر ماند
 *    و هیچ‌کس نفهمید.  تنخواه هم پول است.
 */

type Row = Record<string, unknown>;

/** تنخواه چه حسابی را در سمتِ دیگر می‌زند. */
const SOURCE_ACCOUNTS: Record<string, string> = {
  CASH: ACCOUNTS.cash,
  BANK: ACCOUNTS.bank,
};

@Injectable()
export class PettyCashService {
  constructor(
    private readonly db: DatabaseService,
    private readonly posting: PostingService,
  ) {}

  // ------------------------------------------------------- صندوق‌ها

  async list(companyId: string) {
    const funds = await this.db.query<Row>(
      `SELECT f.*, u."firstName" AS "custodianFirstName", u."lastName" AS "custodianLastName"
         FROM "PettyCash" f
         LEFT JOIN "User" u ON u.id = f."custodianId"
        WHERE f."companyId" = $1
        ORDER BY f."createdAt"`,
      [companyId],
    );

    // ماندهٔ همه در یک رفت‌وبرگشت، نه یکی‌یکی.
    const balances = await this.db.query<{ pettyCashId: string; net: string }>(
      `SELECT "pettyCashId",
              SUM(CASE WHEN type = 'SPEND' OR type = 'RETURN' THEN -amount ELSE amount END) AS net
         FROM "PettyCashTransaction"
        WHERE "companyId" = $1
        GROUP BY "pettyCashId"`,
      [companyId],
    );
    const byId = new Map(balances.map((b) => [b.pettyCashId, Number(b.net)]));

    return funds.map((f) => ({
      ...f,
      ceiling: f.ceiling === null ? null : Number(f.ceiling),
      balance: byId.get(f.id as string) ?? 0,
    }));
  }

  async create(
    companyId: string,
    dto: { name?: string; custodianId?: string; ceiling?: number; note?: string },
  ) {
    if (!dto?.name?.trim()) throw new BadRequestException('نام تنخواه الزامی است');
    if (dto.ceiling !== undefined && dto.ceiling !== null && Number(dto.ceiling) <= 0) {
      throw new BadRequestException('سقف تنخواه باید بزرگ‌تر از صفر باشد');
    }

    const rows = await this.db.query<Row>(
      `INSERT INTO "PettyCash" (id, "companyId", name, "custodianId", ceiling, note)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        randomUUID(),
        companyId,
        dto.name.trim(),
        dto.custodianId ?? null,
        dto.ceiling ?? null,
        dto.note ?? null,
      ],
    );
    return rows[0];
  }

  // ------------------------------------------------------- گردش

  /** شارژِ تنخواه از صندوق یا بانک. */
  charge(
    companyId: string,
    fundId: string,
    dto: { amount?: number; description?: string; source?: string },
    userId?: string,
  ) {
    return this.move(companyId, fundId, 'CHARGE', dto, userId);
  }

  /** خرجِ تنخواه‌دار. */
  spend(
    companyId: string,
    fundId: string,
    dto: { amount?: number; description?: string; account?: string },
    userId?: string,
  ) {
    return this.move(companyId, fundId, 'SPEND', dto, userId);
  }

  /** برگرداندنِ ماندهٔ استفاده‌نشده به صندوق. */
  settle(
    companyId: string,
    fundId: string,
    dto: { amount?: number; description?: string; source?: string },
    userId?: string,
  ) {
    return this.move(companyId, fundId, 'RETURN', dto, userId);
  }

  private async move(
    companyId: string,
    fundId: string,
    type: 'CHARGE' | 'SPEND' | 'RETURN',
    dto: { amount?: number; description?: string; source?: string; account?: string },
    userId?: string,
  ) {
    const amount = Number(dto?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('مبلغ باید عددی بزرگ‌تر از صفر باشد');
    }
    if (!dto?.description?.trim()) {
      throw new BadRequestException('شرح الزامی است');
    }

    return this.db.transaction(async (tx) => {
      // ⚠️ قفلِ سطرِ صندوق پیش از خواندنِ مانده.
      //
      //    بدونِ آن، دو خرجِ هم‌زمان هر دو ماندهٔ قبل از خودشان را
      //    می‌بینند و هر دو مجاز می‌شوند — و تنخواه منفی می‌شود بدونِ
      //    اینکه هیچ‌کدام خطا داده باشد.
      const funds = await tx.query<{
        id: string;
        name: string;
        ceiling: string | null;
        isActive: boolean;
      }>(
        `SELECT id, name, ceiling, "isActive" FROM "PettyCash"
          WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
        [fundId, companyId],
      );
      const fund = funds.rows[0];
      if (!fund) throw new NotFoundException('تنخواه یافت نشد');
      if (!fund.isActive) throw new BadRequestException('این تنخواه غیرفعال است');

      const balanceRows = await tx.query<{ net: string }>(
        `SELECT COALESCE(SUM(
                  CASE WHEN type IN ('SPEND','RETURN') THEN -amount ELSE amount END
                ), 0) AS net
           FROM "PettyCashTransaction" WHERE "pettyCashId" = $1`,
        [fundId],
      );
      const balance = Number(balanceRows.rows[0]?.net ?? 0);

      if (type === 'CHARGE') {
        const ceiling = fund.ceiling === null ? null : Number(fund.ceiling);
        if (ceiling !== null && balance + amount > ceiling) {
          throw new BadRequestException(
            `سقف تنخواه ${ceiling} است؛ مانده ${balance} و شارژ ${amount} از آن می‌گذرد`,
          );
        }
      } else if (amount > balance) {
        // ⚠️ خرج و برگشت هر دو از مانده کم می‌کنند، پس هر دو محدودند.
        //    تنخواهِ منفی یعنی پولی خرج شده که وجود نداشته.
        throw new BadRequestException(
          `مانده تنخواه ${balance} است و کفاف ${amount} را نمی‌دهد`,
        );
      }

      const pettyAccount = '1107';
      const other =
        type === 'SPEND'
          ? (dto.account ?? ACCOUNTS.otherExpense)
          : (SOURCE_ACCOUNTS[dto.source ?? 'CASH'] ?? ACCOUNTS.cash);

      // CHARGE  بدهکار تنخواه / بستانکار صندوق
      // SPEND   بدهکار هزینه  / بستانکار تنخواه
      // RETURN  بدهکار صندوق  / بستانکار تنخواه
      const lines =
        type === 'CHARGE'
          ? [
              { accountCode: pettyAccount, debit: amount, description: dto.description! },
              { accountCode: other, credit: amount, description: dto.description! },
            ]
          : [
              { accountCode: other, debit: amount, description: dto.description! },
              { accountCode: pettyAccount, credit: amount, description: dto.description! },
            ];

      const txId = randomUUID();
      const entry = await this.posting.postIn(tx, companyId, {
        sourceType: `PettyCash${type}`,
        sourceId: txId,
        description: `${this.label(type)} تنخواه ${fund.name} — ${dto.description}`,
        userId: userId ?? null,
        lines,
      });

      const inserted = await tx.query<Row>(
        `INSERT INTO "PettyCashTransaction"
           (id, "companyId", "pettyCashId", type, amount, description, "entryId", "userId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [txId, companyId, fundId, type, amount, dto.description!.trim(), entry.id, userId ?? null],
      );

      const row = inserted.rows[0];
      const delta = type === 'CHARGE' ? amount : -amount;
      return {
        ...row,
        amount: Number(row.amount),
        entryNo: entry.entryNo,
        balanceAfter: balance + delta,
      };
    });
  }

  private label(type: string) {
    return type === 'CHARGE' ? 'شارژ' : type === 'SPEND' ? 'خرج' : 'برگشت';
  }

  // ------------------------------------------------------- صورت وضعیت

  /** گردشِ تنخواه با ماندهٔ جاری — همان منطقِ صورت وضعیت مشتری. */
  async statement(companyId: string, fundId: string, from?: string, to?: string) {
    const funds = await this.db.query<Row>(
      `SELECT * FROM "PettyCash" WHERE id = $1 AND "companyId" = $2`,
      [fundId, companyId],
    );
    if (!funds[0]) throw new NotFoundException('تنخواه یافت نشد');

    const opening = from
      ? await this.db.query<{ net: string }>(
          `SELECT COALESCE(SUM(
                    CASE WHEN type IN ('SPEND','RETURN') THEN -amount ELSE amount END
                  ), 0)::text AS net
             FROM "PettyCashTransaction"
            WHERE "pettyCashId" = $1 AND "occurredAt" < $2`,
          [fundId, from],
        )
      : [{ net: '0' }];

    const values: unknown[] = [fundId];
    const where: string[] = [];
    if (from) { values.push(from); where.push(`"occurredAt" >= $${values.length}`); }
    if (to)   { values.push(to);   where.push(`"occurredAt" <= $${values.length}`); }

    const rows = await this.db.query<Row>(
      `SELECT id, type, amount, description, "entryId", "occurredAt"
         FROM "PettyCashTransaction"
        WHERE "pettyCashId" = $1${where.length ? ' AND ' + where.join(' AND ') : ''}
        ORDER BY "occurredAt", id`,
      values,
    );

    let balance = Number(opening[0]?.net ?? 0);
    const lines: Array<Row & { type: string; amount: number; balance: number }> =
      rows.map((r) => {
      const amount = Number(r.amount);
      const delta = r.type === 'CHARGE' ? amount : -amount;
      balance += delta;
      return {
        ...r,
        type: String(r.type),
        amount,
        occurredAtJalali: formatJalali(new Date(r.occurredAt as string)),
        balance,
      };
    });

    return {
      fund: funds[0],
      openingBalance: Number(opening[0]?.net ?? 0),
      lines,
      totals: {
        charged: lines.filter((l) => l.type === 'CHARGE').reduce((a, l) => a + l.amount, 0),
        spent: lines.filter((l) => l.type === 'SPEND').reduce((a, l) => a + l.amount, 0),
        returned: lines.filter((l) => l.type === 'RETURN').reduce((a, l) => a + l.amount, 0),
        closingBalance: balance,
      },
    };
  }
}
