import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Params, setClause } from '../database/sql';
import { PostingService } from '../accounting/posting.service';
import { treasuryMovementEntry } from '../accounting/posting-rules';

/**
 * بابت‌های مجاز — همان‌ها که صندوق دارد، عمداً.
 *
 * ⚠️ دو واژگانِ متفاوت برای یک مفهوم یعنی گزارشی که نمی‌تواند هر دو را
 *    کنار هم بگذارد.
 */
// FEE = کارمزد بانک؛ به حسابِ اختصاصیِ ۵۲۰۷ می‌رود نه «سایر هزینه‌ها».
const REASONS = ['OWNER', 'BANK', 'ADJUST', 'FEE', 'OTHER'];

type Account = Record<string, unknown> & { id: string; name: string; balance: string };
type Transaction = Record<string, unknown> & { id: string };

const ACCOUNT_WRITABLE = [
  'name',
  'type',
  'bankName',
  'accountNo',
  'iban',
  'isActive',
  'note',
] as const;

@Injectable()
export class TreasuryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly posting: PostingService,
  ) {}

  // ---------- حساب‌ها ----------

  async findAllAccounts(companyId: string) {
    return this.db.query<Account>(
      'SELECT * FROM "TreasuryAccount" WHERE "companyId" = $1 ORDER BY "createdAt" DESC',
      [companyId],
    );
  }

  private async requireAccount(id: string, companyId: string): Promise<Account> {
    const rows = await this.db.query<Account>(
      'SELECT * FROM "TreasuryAccount" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('حساب خزانه یافت نشد');
    return rows[0];
  }

  async findOneAccount(id: string, companyId: string) {
    const account = await this.requireAccount(id, companyId);
    const transactions = await this.db.query<Transaction>(
      'SELECT * FROM "TreasuryTransaction" WHERE "accountId" = $1 ORDER BY date DESC LIMIT 20',
      [id],
    );
    return { ...account, transactions };
  }

  async createAccount(
    companyId: string,
    data: {
      name: string;
      type?: string;
      bankName?: string;
      accountNo?: string;
      iban?: string;
      openingBalance?: number;
      note?: string;
    },
  ) {
    const rows = await this.db.query<Account>(
      `INSERT INTO "TreasuryAccount"
         (id, "companyId", name, type, "bankName", "accountNo", iban, balance, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        randomUUID(),
        companyId,
        data.name,
        data.type ?? 'BANK',
        data.bankName ?? null,
        data.accountNo ?? null,
        data.iban ?? null,
        data.openingBalance ?? 0,
        data.note ?? null,
      ],
    );
    return rows[0];
  }

  async updateAccount(id: string, companyId: string, data: object) {
    await this.requireAccount(id, companyId);

    const params = new Params();
    const assignments = setClause(ACCOUNT_WRITABLE, data, params);
    if (!assignments) return this.requireAccount(id, companyId);

    const rows = await this.db.query<Account>(
      `UPDATE "TreasuryAccount" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  // ---------- تراکنش‌ها ----------

  async findTransactions(companyId: string, options?: { accountId?: string; type?: string }) {
    const params = new Params();
    const conditions = [`t."companyId" = ${params.next(companyId)}`];
    if (options?.accountId) conditions.push(`t."accountId" = ${params.next(options.accountId)}`);
    if (options?.type) conditions.push(`t.type = ${params.next(options.type)}`);

    return this.db.query<Transaction>(
      `SELECT t.*, a.name AS "accountName", a.type AS "accountType"
       FROM "TreasuryTransaction" t JOIN "TreasuryAccount" a ON a.id = t."accountId"
       WHERE ${conditions.join(' AND ')} ORDER BY t.date DESC LIMIT 200`,
      params.values,
    );
  }

  async createTransaction(
    companyId: string,
    data: {
      accountId: string;
      type: string;
      amount: number;
      reference?: string;
      description?: string;
      date?: string;
      reason?: string;
    },
  ) {
    const amount = Number(data.amount);
    const delta = data.type === 'DEPOSIT' ? amount : -amount;

    // ⚠️ «بابت» طرفِ دومِ سند را تعیین می‌کند و حدس‌زدنی نیست.
    //
    //    واریزِ مالک، جابه‌جایی با بانک و اصلاحِ شمارش سه سندِ متفاوت‌اند.
    //    یکی گرفتنشان یعنی دفتری که تراز است و معنایش غلط.
    const reason = String(data.reason ?? 'OTHER');
    if (!REASONS.includes(reason)) {
      throw new BadRequestException(
        `بابت نامعتبر است. مقادیر مجاز: ${REASONS.join('، ')}`,
      );
    }

    return this.db.transaction(async (tx) => {
      // The balance guard rides along with the UPDATE so two concurrent
      // withdrawals cannot both see sufficient funds.
      const updated = await tx.query<Account>(
        `UPDATE "TreasuryAccount" SET balance = balance + $1, "updatedAt" = now()
         WHERE id = $2 AND "companyId" = $3 AND (balance + $1) >= 0 RETURNING *`,
        [delta, data.accountId, companyId],
      );

      if (!updated.rows[0]) {
        const exists = await tx.query<{ id: string }>(
          'SELECT id FROM "TreasuryAccount" WHERE id = $1 AND "companyId" = $2',
          [data.accountId, companyId],
        );
        if (!exists.rows[0]) throw new NotFoundException('حساب خزانه یافت نشد');
        throw new BadRequestException('موجودی حساب کافی نیست');
      }

      // ⚠️ سند در **همان** تراکنش صادر می‌شود.
      //
      //    اگر جدا بود و شکست می‌خورد، پولی جابه‌جا می‌شد که دفتر از
      //    آن بی‌خبر است — دقیقاً همان چیزی که این اصلاح برای رفعش
      //    نوشته شده.  یا هر دو، یا هیچ‌کدام.
      //
      // ⚠️ `sourceId` شناسهٔ **حرکت** است نه حساب: `JournalEntry_source_key`
      //    یکتاست و با شناسهٔ حساب، دومین واریزِ همان حساب ۴۰۹ می‌گرفت.
      const movementId = randomUUID();

      await this.posting.postAuto(tx, companyId, {
        sourceType: 'TreasuryMovement',
        sourceId: movementId,
        description:
          data.type === 'DEPOSIT' ? 'واریز به خزانه' : 'برداشت از خزانه',
        userId: null,
        entryDate: data.date ? new Date(data.date) : new Date(),
        lines: treasuryMovementEntry({
          amount,
          type: data.type,
          reason,
          accountType: String(updated.rows[0].type ?? 'BANK'),
        }),
      });

      const created = await tx.query<Transaction>(
        `INSERT INTO "TreasuryTransaction"
           (id, "companyId", "accountId", type, amount, reference, description, date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          movementId,
          companyId,
          data.accountId,
          data.type,
          amount,
          data.reference ?? null,
          data.description ?? null,
          data.date ? new Date(data.date) : new Date(),
        ],
      );
      return created.rows[0];
    });
  }

  async transfer(
    companyId: string,
    data: {
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      description?: string;
    },
  ) {
    if (data.fromAccountId === data.toAccountId) {
      throw new BadRequestException('حساب مبدأ و مقصد نباید یکسان باشند');
    }

    const amount = Number(data.amount);
    const [from, to] = await Promise.all([
      this.requireAccount(data.fromAccountId, companyId),
      this.requireAccount(data.toAccountId, companyId),
    ]);
    const description = data.description ?? `انتقال از ${from.name} به ${to.name}`;

    return this.db.transaction(async (tx) => {
      const debited = await tx.query<{ id: string }>(
        `UPDATE "TreasuryAccount" SET balance = balance - $1, "updatedAt" = now()
         WHERE id = $2 AND balance >= $1 RETURNING id`,
        [amount, from.id],
      );
      if (!debited.rows[0]) throw new BadRequestException('موجودی حساب کافی نیست');

      await tx.query(
        'UPDATE "TreasuryAccount" SET balance = balance + $1, "updatedAt" = now() WHERE id = $2',
        [amount, to.id],
      );

      const outTx = await tx.query<Transaction>(
        `INSERT INTO "TreasuryTransaction"
           (id, "companyId", "accountId", type, amount, description)
         VALUES ($1, $2, $3, 'TRANSFER_OUT', $4, $5) RETURNING *`,
        [randomUUID(), companyId, from.id, amount, description],
      );

      const inTx = await tx.query<Transaction>(
        `INSERT INTO "TreasuryTransaction"
           (id, "companyId", "accountId", type, amount, description, reference)
         VALUES ($1, $2, $3, 'TRANSFER_IN', $4, $5, $6) RETURNING *`,
        [randomUUID(), companyId, to.id, amount, description, outTx.rows[0].id],
      );

      return { out: outTx.rows[0], in: inTx.rows[0] };
    });
  }

  // ---------- آمار ----------

  async stats(companyId: string) {
    const [totals, recentTransactions] = await Promise.all([
      this.db.query<{ type: string; count: string; balance: string }>(
        `SELECT type, count(*)::text AS count, COALESCE(sum(balance), 0)::text AS balance
         FROM "TreasuryAccount" WHERE "companyId" = $1 AND "isActive" = true GROUP BY type`,
        [companyId],
      ),
      this.db.query<Transaction>(
        `SELECT t.*, a.name AS "accountName" FROM "TreasuryTransaction" t
         JOIN "TreasuryAccount" a ON a.id = t."accountId"
         WHERE t."companyId" = $1 ORDER BY t.date DESC LIMIT 10`,
        [companyId],
      ),
    ]);

    const byType: Record<string, number> = {};
    let accountsCount = 0;
    let totalBalance = 0;
    for (const row of totals) {
      byType[row.type] = Number(row.balance);
      accountsCount += Number(row.count);
      totalBalance += Number(row.balance);
    }

    return { accountsCount, totalBalance, byType, recentTransactions };
  }
}
