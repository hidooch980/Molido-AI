import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { Params, setClause } from '../database/sql';
import { AuditTrailService } from '../audit-log/audit-trail.service';
import { parseDate } from '../common/date';

export type RationAccount = Record<string, unknown> & {
  id: string;
  nationalCode: string;
  balance: string;
  isActive: boolean;
};

export type RationTransaction = Record<string, unknown> & { id: string };

/** یک قلم سبد، برای محاسبهٔ سهم قابل پرداخت با کالابرگ. */
export type BasketLine = {
  productId: string;
  quantity: number;
};

export type EligibilityLine = {
  productId: string;
  name: string;
  quantity: number;
  /** قیمت مصوب کالابرگ؛ برابر قیمت فروش است اگر قیمت مصوب تعریف نشده باشد. */
  rationPrice: number;
  lineTotal: number;
};

export type Eligibility = {
  /** حداکثر مبلغی که این سبد می‌تواند از کالابرگ پرداخت شود. */
  eligibleTotal: number;
  lines: EligibilityLine[];
  /** اقلامی که مشمول کالابرگ نیستند و باید نقدی/کارتی پرداخت شوند. */
  excludedProductIds: string[];
};

const ACCOUNT_WRITABLE = [
  'holderName',
  'phone',
  'householdSize',
  'periodCode',
  'isActive',
  'note',
] as const;

/** کد ملی ایران: ده رقم. */
const NATIONAL_CODE_PATTERN = /^\d{10}$/;

/**
 * کالابرگ الکترونیکی
 *
 * دو قاعده که این را از یک کیف پول ساده جدا می‌کند و هر دو اینجا اعمال
 * می‌شوند:
 *
 *   ۱. فقط کالای مشمول (`isRationEligible`) با کالابرگ قابل خرید است.
 *   ۲. کالای مشمول با «قیمت مصوب» (`rationPrice`) حساب می‌شود، نه قیمت فروش.
 *
 * برداشت از اعتبار همیشه با شرط `balance >= amount` داخل خودِ `UPDATE` انجام
 * می‌شود، بنابراین دو صندوق هم‌زمان نمی‌توانند یک اعتبار را دوبار خرج کنند.
 */
@Injectable()
export class RationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditTrailService,
  ) {}

  // ---------- حساب‌ها ----------

  async findAll(companyId: string, options?: { search?: string; limit?: number }) {
    const params = new Params();
    const conditions = [`"companyId" = ${params.next(companyId)}`];
    if (options?.search) {
      const term = params.next(`%${options.search}%`);
      conditions.push(`("nationalCode" ILIKE ${term} OR "holderName" ILIKE ${term})`);
    }
    const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 500) : 100;

    return this.db.query<RationAccount>(
      `SELECT * FROM "RationAccount" WHERE ${conditions.join(' AND ')}
       ORDER BY "createdAt" DESC LIMIT ${params.next(limit)}`,
      params.values,
    );
  }

  async findOne(companyId: string, id: string) {
    const rows = await this.db.query<RationAccount>(
      'SELECT * FROM "RationAccount" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('حساب کالابرگ یافت نشد');

    const transactions = await this.db.query<RationTransaction>(
      'SELECT * FROM "RationTransaction" WHERE "accountId" = $1 ORDER BY "createdAt" DESC LIMIT 50',
      [id],
    );
    return { ...rows[0], transactions };
  }

  /** جستجو با کد ملی — مسیر اصلی صندوق. */
  async findByNationalCode(companyId: string, nationalCode: string) {
    const code = (nationalCode ?? '').trim();
    if (!NATIONAL_CODE_PATTERN.test(code)) {
      throw new BadRequestException('کد ملی باید ۱۰ رقم باشد');
    }

    const rows = await this.db.query<RationAccount>(
      'SELECT * FROM "RationAccount" WHERE "companyId" = $1 AND "nationalCode" = $2',
      [companyId, code],
    );
    if (!rows[0]) throw new NotFoundException('حساب کالابرگ برای این کد ملی یافت نشد');
    return rows[0];
  }

  async create(
    companyId: string,
    data: {
      nationalCode: string;
      holderName?: string;
      phone?: string;
      householdSize?: number;
      periodCode?: string;
      note?: string;
    },
  ) {
    const code = (data.nationalCode ?? '').trim();
    if (!NATIONAL_CODE_PATTERN.test(code)) {
      throw new BadRequestException('کد ملی باید ۱۰ رقم باشد');
    }

    try {
      const rows = await this.db.query<RationAccount>(
        `INSERT INTO "RationAccount"
           (id, "companyId", "nationalCode", "holderName", phone, "householdSize", "periodCode", note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          randomUUID(),
          companyId,
          code,
          data.holderName ?? null,
          data.phone ?? null,
          data.householdSize ?? 1,
          data.periodCode ?? null,
          data.note ?? null,
        ],
      );
      return rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('برای این کد ملی حساب کالابرگ وجود دارد');
      }
      throw error;
    }
  }

  async update(companyId: string, id: string, data: object) {
    await this.findOne(companyId, id);

    const params = new Params();
    const assignments = setClause(ACCOUNT_WRITABLE, data, params);
    if (!assignments) return this.findOne(companyId, id);

    const rows = await this.db.query<RationAccount>(
      `UPDATE "RationAccount" SET ${assignments}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  /**
   * شارژ اعتبار دوره‌ای.
   *
   * قید یکتای جزئی روی (accountId, periodCode) شارژ دوبارهٔ یک دوره را در سطح
   * دیتابیس می‌بندد؛ اجرای دوبارهٔ یک فایل تخصیص، اعتبار را دو برابر نمی‌کند.
   */
  async allocate(
    companyId: string,
    id: string,
    data: { amount: number; periodCode: string; reference?: string; userId?: string },
  ) {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('مبلغ تخصیص باید بزرگ‌تر از صفر باشد');
    }
    if (!data.periodCode) {
      throw new BadRequestException('کد دوره الزامی است');
    }

    return this.db.transaction(async (tx) => {
      const updated = await tx.query<RationAccount>(
        `UPDATE "RationAccount"
         SET balance = balance + $1, "periodCode" = $2, "updatedAt" = now()
         WHERE id = $3 AND "companyId" = $4 AND "isActive" = true RETURNING *`,
        [amount, data.periodCode, id, companyId],
      );
      if (!updated.rows[0]) {
        throw new NotFoundException('حساب کالابرگ فعال یافت نشد');
      }

      try {
        await tx.query(
          `INSERT INTO "RationTransaction"
             (id, "companyId", "accountId", type, amount, "periodCode", reference)
           VALUES ($1, $2, $3, 'ALLOCATE', $4, $5, $6)`,
          [randomUUID(), companyId, id, amount, data.periodCode, data.reference ?? null],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new ConflictException('اعتبار این دوره قبلاً تخصیص یافته است');
        }
        throw error;
      }

      await this.audit.recordIn(tx, companyId, {
        entity: 'RationAccount',
        entityId: id,
        action: 'ALLOCATED',
        userId: data.userId,
        newValue: { amount, periodCode: data.periodCode },
      });

      return updated.rows[0];
    });
  }

  // ---------- محاسبهٔ سهم کالابرگ ----------

  /**
   * مشخص می‌کند چه مقدار از سبد با کالابرگ قابل پرداخت است.
   *
   * قیمت از دیتابیس خوانده می‌شود، نه از ورودی صندوق: قیمت مصوب نباید از سمت
   * کلاینت قابل تعیین باشد.
   */
  async eligibility(companyId: string, basket: BasketLine[]): Promise<Eligibility> {
    const productIds = basket.map((line) => line.productId);
    if (!productIds.length) {
      return { eligibleTotal: 0, lines: [], excludedProductIds: [] };
    }

    const products = await this.db.query<{
      id: string;
      name: string;
      salePrice: string;
      rationPrice: string | null;
      isRationEligible: boolean;
    }>(
      `SELECT id, name, "salePrice", "rationPrice", "isRationEligible"
       FROM "Product" WHERE id = ANY($1) AND "companyId" = $2`,
      [productIds, companyId],
    );
    const byId = new Map(products.map((product) => [product.id, product]));

    const lines: EligibilityLine[] = [];
    const excludedProductIds: string[] = [];
    let eligibleTotal = 0;

    for (const line of basket) {
      const product = byId.get(line.productId);

      if (!product || !product.isRationEligible) {
        excludedProductIds.push(line.productId);
        continue;
      }

      const rationPrice = Number(product.rationPrice ?? product.salePrice);
      const lineTotal = Math.round(rationPrice * line.quantity * 100) / 100;

      lines.push({
        productId: product.id,
        name: product.name,
        quantity: line.quantity,
        rationPrice,
        lineTotal,
      });
      eligibleTotal += lineTotal;
    }

    return {
      eligibleTotal: Math.round(eligibleTotal * 100) / 100,
      lines,
      excludedProductIds,
    };
  }

  // ---------- برداشت و برگشت ----------

  /**
   * برداشت از اعتبار بابت یک فاکتور.  داخل تراکنش فروش صدا زده می‌شود تا اگر
   * ثبت فاکتور شکست بخورد، اعتبار هم برنگردد نیمه‌کاره.
   */
  async spendIn(
    tx: PoolClient,
    companyId: string,
    accountId: string,
    amount: number,
    saleId: string,
  ): Promise<void> {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('مبلغ کالابرگ باید بزرگ‌تر از صفر باشد');
    }

    // شرط موجودی داخل خود UPDATE است تا دو صندوق هم‌زمان نتوانند یک اعتبار را
    // دوبار خرج کنند.
    const debited = await tx.query<{ id: string; balance: string }>(
      `UPDATE "RationAccount" SET balance = balance - $1, "updatedAt" = now()
       WHERE id = $2 AND "companyId" = $3 AND "isActive" = true AND balance >= $1
       RETURNING id, balance`,
      [amount, accountId, companyId],
    );

    if (!debited.rows[0]) {
      const existing = await tx.query<{ balance: string; isActive: boolean }>(
        'SELECT balance, "isActive" FROM "RationAccount" WHERE id = $1 AND "companyId" = $2',
        [accountId, companyId],
      );
      if (!existing.rows[0]) throw new NotFoundException('حساب کالابرگ یافت نشد');
      if (!existing.rows[0].isActive) {
        throw new BadRequestException('حساب کالابرگ غیرفعال است');
      }
      throw new BadRequestException(
        `اعتبار کالابرگ کافی نیست (مانده: ${Number(existing.rows[0].balance)})`,
      );
    }

    await tx.query(
      `INSERT INTO "RationTransaction" (id, "companyId", "accountId", type, amount, "saleId")
       VALUES ($1, $2, $3, 'SPEND', $4, $5)`,
      [randomUUID(), companyId, accountId, amount, saleId],
    );
  }

  /** برگشت اعتبار هنگام لغو فاکتور. */
  async reverseIn(tx: PoolClient, companyId: string, saleId: string): Promise<void> {
    const spent = await tx.query<{ accountId: string; amount: string }>(
      `SELECT "accountId", amount FROM "RationTransaction"
       WHERE "saleId" = $1 AND type = 'SPEND'`,
      [saleId],
    );
    const transaction = spent.rows[0];
    if (!transaction) return;

    const already = await tx.query<{ id: string }>(
      `SELECT id FROM "RationTransaction" WHERE "saleId" = $1 AND type = 'REVERSE'`,
      [saleId],
    );
    if (already.rows[0]) return;

    await tx.query(
      `UPDATE "RationAccount" SET balance = balance + $1, "updatedAt" = now() WHERE id = $2`,
      [transaction.amount, transaction.accountId],
    );

    await tx.query(
      `INSERT INTO "RationTransaction" (id, "companyId", "accountId", type, amount, "saleId", note)
       VALUES ($1, $2, $3, 'REVERSE', $4, $5, 'برگشت بابت لغو فاکتور')`,
      [randomUUID(), companyId, transaction.accountId, transaction.amount, saleId],
    );
  }

  // ---------- گزارش ----------

  /** مبنای تسویه با سامانهٔ ملی: مصرف کالابرگ در یک بازه. */
  async settlementReport(companyId: string, from?: string, to?: string) {
    const params = new Params();
    const conditions = [
      `t."companyId" = ${params.next(companyId)}`,
      `t.type IN ('SPEND', 'REVERSE')`,
    ];
    if (from) conditions.push(`t."createdAt" >= ${params.next(parseDate(from, "از تاریخ"))}`);
    if (to) conditions.push(`t."createdAt" <= ${params.next(parseDate(to, "تا تاریخ"))}`);

    const rows = await this.db.query<{ type: string; count: string; amount: string }>(
      `SELECT t.type, count(*)::text AS count, COALESCE(sum(t.amount), 0)::text AS amount
       FROM "RationTransaction" t WHERE ${conditions.join(' AND ')} GROUP BY t.type`,
      params.values,
    );

    let spent = 0;
    let reversed = 0;
    let transactions = 0;
    for (const row of rows) {
      transactions += Number(row.count);
      if (row.type === 'SPEND') spent = Number(row.amount);
      if (row.type === 'REVERSE') reversed = Number(row.amount);
    }

    const accounts = await this.db.query<{ count: string; balance: string }>(
      `SELECT count(*)::text AS count, COALESCE(sum(balance), 0)::text AS balance
       FROM "RationAccount" WHERE "companyId" = $1 AND "isActive" = true`,
      [companyId],
    );

    return {
      transactions,
      spent,
      reversed,
      net: spent - reversed,
      activeAccounts: Number(accounts[0]?.count ?? 0),
      outstandingBalance: Number(accounts[0]?.balance ?? 0),
    };
  }
}
