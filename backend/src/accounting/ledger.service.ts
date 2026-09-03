import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Params } from '../database/sql';
import { PostingService } from './posting.service';
import { ACCOUNTS } from './posting-rules';

export type FiscalYear = Record<string, unknown> & { id: string; status: string };

/** گروه‌هایی که در ترازنامه می‌آیند؛ بقیه در صورت سود و زیان. */
const BALANCE_SHEET_TYPES = ['ASSET', 'LIABILITY', 'EQUITY'];

/**
 * دفتر کل — گزارش‌گیری و مدیریت سال مالی
 *
 * صدور سند در `PostingService` است؛ اینجا فقط خوانده می‌شود.  همهٔ گزارش‌ها از
 * `JournalLine` می‌آیند نه از ستون `balance`، چون مانده یک میان‌بر برای نمایش
 * سریع است و منبع حقیقت، اقلام سند است.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly db: DatabaseService,
    private readonly posting: PostingService,
  ) {}

  // ---------- سال مالی ----------

  async fiscalYears(companyId: string) {
    return this.db.query<FiscalYear>(
      'SELECT * FROM "FiscalYear" WHERE "companyId" = $1 ORDER BY "startsOn" DESC',
      [companyId],
    );
  }

  async createFiscalYear(
    companyId: string,
    data: { code: string; startsOn: string; endsOn: string; note?: string },
  ) {
    if (!data.code || !data.startsOn || !data.endsOn) {
      throw new BadRequestException('کد، تاریخ شروع و پایان سال مالی الزامی است');
    }

    try {
      const rows = await this.db.query<FiscalYear>(
        `INSERT INTO "FiscalYear" (id, "companyId", code, "startsOn", "endsOn", note)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [randomUUID(), companyId, data.code, data.startsOn, data.endsOn, data.note ?? null],
      );
      return rows[0];
    } catch (error) {
      const code = (error as { code?: string }).code;
      // 23P01 نقض قید EXCLUDE — بازه با سال دیگری هم‌پوشانی دارد
      if (code === '23P01') {
        throw new BadRequestException('بازهٔ این سال مالی با سال دیگری هم‌پوشانی دارد');
      }
      if (code === '23505') {
        throw new BadRequestException('سال مالی با این کد وجود دارد');
      }
      throw error;
    }
  }

  /**
   * بستن سال مالی.
   *
   * پس از بستن، تریگر دیتابیس مانع ثبت هر سند تازه در آن سال می‌شود.
   */
  /**
   * بستن سال مالی — با سند اختتامیه، نه فقط تغییر یک پرچم.
   *
   * پیش از این فقط وضعیت به CLOSED تغییر می‌کرد.  یعنی حساب‌های موقت
   * (درآمد و هزینه) هرگز صفر نمی‌شدند و صورت سود و زیانِ سال بعد، سود همهٔ
   * سال‌های قبل را هم نشان می‌داد.  سود انباشته هم هیچ‌وقت پر نمی‌شد.
   *
   * سند اختتامیه: هر حساب درآمد بدهکار و هر حساب هزینه بستانکار می‌شود تا
   * مانده‌شان صفر شود، و تفاوت — یعنی سود یا زیان سال — به «سود و زیان
   * انباشته» منتقل می‌شود.
   *
   * دو محافظ:
   *   • سند پیش‌نویس نباید باقی مانده باشد؛ وگرنه پس از بستن سال، تأییدش
   *     غیرممکن می‌شود و در هیچ صورت مالی‌ای دیده نمی‌شود.
   *   • کل کار در یک تراکنش است: یا سند صادر و سال بسته می‌شود، یا هیچ‌کدام.
   */
  async closeFiscalYear(companyId: string, id: string, userId?: string) {
    return this.db.transaction(async (tx) => {
      const years = await tx.query<{
        id: string;
        code: string;
        status: string;
        startsOn: string;
        endsOn: string;
      }>(
        `SELECT id, code, status, "startsOn", "endsOn" FROM "FiscalYear"
          WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
        [id, companyId],
      );

      const year = years.rows[0];
      if (!year) throw new NotFoundException('سال مالی یافت نشد');
      if (year.status === 'CLOSED') {
        throw new BadRequestException('این سال مالی قبلاً بسته شده است');
      }

      const drafts = await tx.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM "JournalEntry"
          WHERE "companyId" = $1 AND "fiscalYearId" = $2 AND status = 'DRAFT'`,
        [companyId, id],
      );

      if (Number(drafts.rows[0]?.count ?? 0) > 0) {
        throw new BadRequestException(
          `${drafts.rows[0].count} سند پیش‌نویس باقی مانده است؛ پیش از بستن سال تعیین تکلیف کنید`,
        );
      }

      // مانده حساب‌های موقت در بازهٔ همین سال.  مبنا اقلام سند است نه ستون
      // balance، چون balance مانده تجمعی همهٔ سال‌هاست.
      const balances = await tx.query<{
        code: string;
        type: string;
        net: string;
      }>(
        `SELECT a.code, a.type,
                COALESCE(SUM(l.debit),0) - COALESCE(SUM(l.credit),0) AS net
           FROM "JournalLine" l
           JOIN "JournalEntry" e ON e.id = l."entryId"
           JOIN "Account" a ON a.id = l."accountId"
          WHERE e."companyId" = $1 AND e."fiscalYearId" = $2
            AND e.status <> 'DRAFT'
            AND a.type IN ('REVENUE','EXPENSE')
          GROUP BY a.code, a.type
         HAVING COALESCE(SUM(l.debit),0) - COALESCE(SUM(l.credit),0) <> 0`,
        [companyId, id],
      );

      const lines: Array<{
        accountCode: string;
        debit?: number;
        credit?: number;
        description: string;
      }> = [];

      let netIncome = 0;

      for (const row of balances.rows) {
        const net = Number(row.net);

        // خنثی کردن مانده: مانده بستانکار (منفی) بدهکار می‌شود و برعکس.
        if (net < 0) {
          lines.push({
            accountCode: row.code,
            debit: -net,
            description: 'بستن حساب موقت',
          });
        } else {
          lines.push({
            accountCode: row.code,
            credit: net,
            description: 'بستن حساب موقت',
          });
        }

        // درآمد مانده بستانکار دارد (منفی) و هزینه بدهکار (مثبت)؛
        // سود = درآمد − هزینه = −(مجموع خالص).
        netIncome -= net;
      }

      if (!lines.length) {
        // سالی بدون هیچ فعالیتی؛ فقط بسته می‌شود.
        const closed = await tx.query<FiscalYear>(
          `UPDATE "FiscalYear" SET status = 'CLOSED', "closedAt" = now(),
                  "updatedAt" = now()
            WHERE id = $1 RETURNING *`,
          [id],
        );
        return { ...closed.rows[0], netIncome: 0, entryNo: null };
      }

      lines.push({
        accountCode: ACCOUNTS.retainedEarnings,
        ...(netIncome >= 0 ? { credit: netIncome } : { debit: -netIncome }),
        description: netIncome >= 0 ? 'سود سال جاری' : 'زیان سال جاری',
      });

      // تاریخ سند آخرین روز سال است، پس داخل همان سال می‌افتد.
      // `allowClosedYear` لازم نیست چون سال هنوز باز است — بستن پس از
      // صدور سند انجام می‌شود.
      const entry = await this.posting.postIn(tx, companyId, {
        sourceType: 'FiscalYearClose',
        sourceId: id,
        description: `سند اختتامیه سال مالی ${year.code}`,
        userId: userId ?? null,
        entryDate: new Date(year.endsOn),
        lines,
      });

      const closed = await tx.query<FiscalYear>(
        `UPDATE "FiscalYear" SET status = 'CLOSED', "closedAt" = now(),
                "updatedAt" = now()
          WHERE id = $1 RETURNING *`,
        [id],
      );

      return {
        ...closed.rows[0],
        netIncome,
        entryNo: entry.entryNo,
        closedAccounts: balances.rows.length,
      };
    });
  }

  /**
   * سند افتتاحیه — انتقال ماندهٔ حساب‌های دائم به سال نو.
   *
   * ---------- چرا لازم است ----------
   *
   * `closeFiscalYear` حساب‌های **موقت** (درآمد و هزینه) را صفر می‌کند.
   * حساب‌های **دائم** (دارایی، بدهی، سرمایه) دست‌نخورده می‌مانند — که
   * درست است، ولی کافی نیست.
   *
   * `trialBalance` بر اساس `entryDate` فیلتر می‌کند.  پس ترازِ آزمایشیِ
   * سالِ نو فقط گردشِ همان سال را می‌بیند و نقد و موجودی و بدهی با
   * ماندهٔ **صفر** شروع می‌شوند.  ترازنامهٔ `asOf` درست است، ولی تراز
   * آزمایشیِ سال با آن نمی‌خواند و دفاترِ قانونیِ سال نو بدونِ مانده باز
   * می‌شوند.
   *
   * این خطا چیزی نمی‌شکند و پیامی نمی‌دهد؛ فقط دو گزارش با هم نمی‌خوانند
   * و کسی سالِ بعد دنبالِ علتش می‌گردد.
   *
   * ---------- سه محافظ ----------
   *
   * • سالِ پیشین باید **بسته** باشد.  وگرنه ماندهٔ منتقل‌شده هنوز
   *   می‌تواند تغییر کند و افتتاحیه با واقعیت فاصله می‌گیرد.
   * • سندِ افتتاحیهٔ تکراری ممکن نیست — قیدِ یکتای
   *   `JournalEntry_source_key` روی (sourceType, sourceId) این را تضمین
   *   می‌کند، نه یک `if` که می‌شود دورش زد.
   * • مبنا اقلامِ سند است تا **پایانِ سالِ پیشین**، نه ستونِ `balance`:
   *   `balance` ماندهٔ تجمعیِ امروز است و اگر سالِ نو گردش داشته باشد،
   *   افتتاحیه آن را هم می‌آورد و دوباره می‌شمارد.
   */
  async openFiscalYear(companyId: string, id: string, userId?: string) {
    return this.db.transaction(async (tx) => {
      const years = await tx.query<{
        id: string;
        code: string;
        status: string;
        startsOn: string;
      }>(
        `SELECT id, code, status, "startsOn" FROM "FiscalYear"
          WHERE id = $1 AND "companyId" = $2`,
        [id, companyId],
      );
      const year = years.rows[0];
      if (!year) throw new NotFoundException('سال مالی یافت نشد');
      if (year.status === 'CLOSED') {
        throw new BadRequestException('سال مالی بسته است');
      }

      // سالِ بلافاصله پیش از این.
      const prevRows = await tx.query<{ id: string; code: string; status: string; endsOn: string }>(
        `SELECT id, code, status, "endsOn" FROM "FiscalYear"
          WHERE "companyId" = $1 AND "endsOn" < $2
          ORDER BY "endsOn" DESC LIMIT 1`,
        [companyId, year.startsOn],
      );
      const prev = prevRows.rows[0];
      if (!prev) {
        throw new BadRequestException(
          'سال مالی پیشینی وجود ندارد؛ افتتاحیه فقط ماندهٔ سال قبل را منتقل می‌کند',
        );
      }
      if (prev.status !== 'CLOSED') {
        throw new BadRequestException(
          `ابتدا سال مالی ${prev.code} را ببندید؛ تا وقتی باز است ماندهٔ آن قطعی نیست`,
        );
      }

      const balances = await tx.query<{ code: string; net: string }>(
        `SELECT a.code,
                COALESCE(SUM(l.debit),0) - COALESCE(SUM(l.credit),0) AS net
           FROM "JournalLine" l
           JOIN "JournalEntry" e ON e.id = l."entryId"
           JOIN "Account" a ON a.id = l."accountId"
          WHERE e."companyId" = $1
            AND e.status <> 'DRAFT'
            AND e."entryDate" <= $2
            AND a.type IN ('ASSET','LIABILITY','EQUITY')
          GROUP BY a.code
         HAVING COALESCE(SUM(l.debit),0) - COALESCE(SUM(l.credit),0) <> 0`,
        [companyId, prev.endsOn],
      );

      if (!balances.rows.length) {
        return { fiscalYear: year, entryNo: null, accounts: 0, message: 'ماندهٔ قابل انتقالی نبود' };
      }

      const lines: Array<{
        accountCode: string;
        debit?: number;
        credit?: number;
        description: string;
      }> = balances.rows.map((row) => {
        const net = Number(row.net);
        return {
          accountCode: row.code,
          ...(net > 0 ? { debit: net } : { credit: -net }),
          description: 'افتتاحیه',
        };
      });

      // ⚠️ سنجشِ توازن **پیش از** ثبت.
      //
      //    اگر دفترِ سال قبل تراز باشد این جمع صفر است.  اگر نباشد،
      //    `postIn` سندِ نامتراز را رد می‌کند — ولی با پیامی که به
      //    افتتاحیه اشاره می‌کند، نه به علتِ واقعی که در سالِ گذشته است.
      const drift = lines.reduce((a, l) => a + (l.debit ?? 0) - (l.credit ?? 0), 0);
      if (Math.abs(drift) > 0.005) {
        throw new BadRequestException(
          `دفترِ سال ${prev.code} تراز نیست (اختلاف ${drift}); افتتاحیه صادر نشد`,
        );
      }

      const entry = await this.posting.postIn(tx, companyId, {
        sourceType: 'FiscalYearOpen',
        sourceId: id,
        description: `سند افتتاحیه سال مالی ${year.code}`,
        userId: userId ?? null,
        entryDate: new Date(year.startsOn),
        lines,
      });

      return {
        fiscalYear: year,
        entryNo: entry.entryNo,
        accounts: lines.length,
        carriedFrom: prev.code,
      };
    });
  }

  // ---------- اسناد ----------

  async entries(
    companyId: string,
    options?: {
      from?: string;
      to?: string;
      sourceType?: string;
      accountCode?: string;
      limit?: number;
    },
  ) {
    const params = new Params();
    const conditions = [`e."companyId" = ${params.next(companyId)}`];
    if (options?.from) conditions.push(`e."entryDate" >= ${params.next(options.from)}`);
    if (options?.to) conditions.push(`e."entryDate" <= ${params.next(options.to)}`);
    if (options?.sourceType) {
      conditions.push(`e."sourceType" = ${params.next(options.sourceType)}`);
    }
    if (options?.accountCode) {
      conditions.push(
        `EXISTS (SELECT 1 FROM "JournalLine" l JOIN "Account" a ON a.id = l."accountId"
                 WHERE l."entryId" = e.id AND a.code = ${params.next(options.accountCode)})`,
      );
    }

    const limit = options?.limit && options.limit > 0 ? Math.min(options.limit, 500) : 100;

    return this.db.query(
      `SELECT e.*,
              COALESCE((SELECT sum(l.debit) FROM "JournalLine" l WHERE l."entryId" = e.id), 0)
                AS "totalDebit"
       FROM "JournalEntry" e
       WHERE ${conditions.join(' AND ')}
       ORDER BY e."entryDate" DESC, e."entryNo" DESC LIMIT ${params.next(limit)}`,
      params.values,
    );
  }

  async entry(companyId: string, id: string) {
    const entries = await this.db.query<Record<string, unknown> & { id: string }>(
      'SELECT * FROM "JournalEntry" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!entries[0]) throw new NotFoundException('سند یافت نشد');

    const lines = await this.db.query(
      `SELECT l.*, a.code AS "accountCode", a.name AS "accountName", a.type AS "accountType"
       FROM "JournalLine" l JOIN "Account" a ON a.id = l."accountId"
       WHERE l."entryId" = $1 ORDER BY l."lineNo"`,
      [id],
    );

    return { ...entries[0], lines };
  }

  // ---------- گزارش‌ها ----------

  /** تراز آزمایشی: گردش و ماندهٔ هر حساب در یک بازه. */
  async trialBalance(companyId: string, from?: string, to?: string) {
    const params = new Params();
    // پیش‌نویس کنار گذاشته می‌شود، ولی سند خنثی‌شده می‌ماند: اقلام آن واقعی‌اند
    // و سند معکوس دقیقاً همان‌ها را خنثی می‌کند.  اگر سند خنثی‌شده حذف شود،
    // اثر برگشت دو بار اعمال می‌گردد.
    const conditions = [`e."companyId" = ${params.next(companyId)}`, `e.status <> 'DRAFT'`];
    if (from) conditions.push(`e."entryDate" >= ${params.next(from)}`);
    if (to) conditions.push(`e."entryDate" <= ${params.next(to)}`);

    const rows = await this.db.query<{
      code: string;
      name: string;
      type: string;
      debit: string;
      credit: string;
    }>(
      `SELECT a.code, a.name, a.type,
              COALESCE(sum(l.debit), 0)::text AS debit,
              COALESCE(sum(l.credit), 0)::text AS credit
       FROM "JournalLine" l
       JOIN "JournalEntry" e ON e.id = l."entryId"
       JOIN "Account" a ON a.id = l."accountId"
       WHERE ${conditions.join(' AND ')}
       GROUP BY a.code, a.name, a.type
       HAVING sum(l.debit) <> 0 OR sum(l.credit) <> 0
       ORDER BY a.code`,
      params.values,
    );

    const accounts = rows.map((row) => {
      const debit = Number(row.debit);
      const credit = Number(row.credit);
      const net = debit - credit;

      return {
        code: row.code,
        name: row.name,
        type: row.type,
        debit,
        credit,
        // ماندهٔ بدهکار و بستانکار جدا، همان‌طور که در تراز چاپ می‌شود
        balanceDebit: net > 0 ? net : 0,
        balanceCredit: net < 0 ? -net : 0,
      };
    });

    const totals = accounts.reduce(
      (sum, account) => ({
        debit: sum.debit + account.debit,
        credit: sum.credit + account.credit,
        balanceDebit: sum.balanceDebit + account.balanceDebit,
        balanceCredit: sum.balanceCredit + account.balanceCredit,
      }),
      { debit: 0, credit: 0, balanceDebit: 0, balanceCredit: 0 },
    );

    return {
      accounts,
      totals,
      // اگر این false شود یعنی جایی مستقیم در دفتر نوشته شده است
      balanced: Math.abs(totals.debit - totals.credit) < 0.005,
    };
  }

  /** دفتر معین یک حساب: گردش سطر به سطر با ماندهٔ تجمعی. */
  async accountLedger(
    companyId: string,
    accountCode: string,
    options?: { from?: string; to?: string },
  ) {
    const accounts = await this.db.query<{ id: string; name: string; type: string }>(
      'SELECT id, name, type FROM "Account" WHERE "companyId" = $1 AND code = $2',
      [companyId, accountCode],
    );
    const account = accounts[0];
    if (!account) throw new NotFoundException('حساب یافت نشد');

    const debitNature = ['ASSET', 'EXPENSE'].includes(account.type);

    const params = new Params();
    const conditions = [
      `e."companyId" = ${params.next(companyId)}`,
      `l."accountId" = ${params.next(account.id)}`,
      // سند خنثی‌شده می‌ماند؛ سند معکوس آن را در همین دفتر خنثی می‌کند
      `e.status <> 'DRAFT'`,
    ];

    // ماندهٔ ابتدای دوره: هرچه پیش از تاریخ شروع ثبت شده است
    let opening = 0;
    if (options?.from) {
      const before = await this.db.query<{ debit: string; credit: string }>(
        `SELECT COALESCE(sum(l.debit), 0)::text AS debit,
                COALESCE(sum(l.credit), 0)::text AS credit
         FROM "JournalLine" l JOIN "JournalEntry" e ON e.id = l."entryId"
         WHERE e."companyId" = $1 AND l."accountId" = $2
           AND e.status <> 'DRAFT' AND e."entryDate" < $3`,
        [companyId, account.id, options.from],
      );
      const net = Number(before[0]?.debit ?? 0) - Number(before[0]?.credit ?? 0);
      opening = debitNature ? net : -net;
      conditions.push(`e."entryDate" >= ${params.next(options.from)}`);
    }
    if (options?.to) conditions.push(`e."entryDate" <= ${params.next(options.to)}`);

    const rows = await this.db.query<{
      entryNo: string;
      entryDate: Date;
      description: string | null;
      lineDescription: string | null;
      debit: string;
      credit: string;
    }>(
      `SELECT e."entryNo", e."entryDate", e.description,
              l.description AS "lineDescription", l.debit, l.credit
       FROM "JournalLine" l JOIN "JournalEntry" e ON e.id = l."entryId"
       WHERE ${conditions.join(' AND ')}
       ORDER BY e."entryDate", e."entryNo"`,
      params.values,
    );

    let running = opening;
    const movements = rows.map((row) => {
      const debit = Number(row.debit);
      const credit = Number(row.credit);
      running += debitNature ? debit - credit : credit - debit;

      return {
        entryNo: row.entryNo,
        entryDate: row.entryDate,
        description: row.lineDescription ?? row.description,
        debit,
        credit,
        balance: Math.round(running * 100) / 100,
      };
    });

    return {
      account: { code: accountCode, name: account.name, type: account.type },
      opening,
      closing: Math.round(running * 100) / 100,
      movements,
    };
  }

  /** صورت سود و زیان: درآمد منهای هزینه. */
  async incomeStatement(companyId: string, from?: string, to?: string) {
    const trial = await this.trialBalance(companyId, from, to);

    const revenue = trial.accounts.filter((account) => account.type === 'REVENUE');
    const expense = trial.accounts.filter((account) => account.type === 'EXPENSE');

    // درآمد ماهیت بستانکار دارد، هزینه بدهکار
    const totalRevenue = revenue.reduce((sum, a) => sum + a.credit - a.debit, 0);
    const totalExpense = expense.reduce((sum, a) => sum + a.debit - a.credit, 0);

    return {
      revenue: revenue.map((a) => ({ ...a, amount: a.credit - a.debit })),
      expense: expense.map((a) => ({ ...a, amount: a.debit - a.credit })),
      totalRevenue,
      totalExpense,
      netIncome: totalRevenue - totalExpense,
    };
  }

  /** ترازنامه: دارایی = بدهی + سرمایه + سود انباشتهٔ دوره. */
  async balanceSheet(companyId: string, asOf?: string) {
    const trial = await this.trialBalance(companyId, undefined, asOf);

    const pick = (type: string) =>
      trial.accounts
        .filter((account) => account.type === type)
        .map((account) => ({
          ...account,
          amount:
            type === 'ASSET'
              ? account.debit - account.credit
              : account.credit - account.debit,
        }));

    const assets = pick('ASSET');
    const liabilities = pick('LIABILITY');
    const equity = pick('EQUITY');

    const totalAssets = assets.reduce((sum, a) => sum + a.amount, 0);
    const totalLiabilities = liabilities.reduce((sum, a) => sum + a.amount, 0);
    const totalEquity = equity.reduce((sum, a) => sum + a.amount, 0);

    // سود دوره هنوز به سرمایه منتقل نشده، پس جداگانه می‌آید تا تراز برقرار شود
    const income = await this.incomeStatement(companyId, undefined, asOf);

    return {
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      netIncome: income.netIncome,
      // اگر برقرار نباشد، جایی سند نامتوازن یا دستکاری‌شده است
      balanced:
        Math.abs(totalAssets - (totalLiabilities + totalEquity + income.netIncome)) < 0.005,
      excluded: trial.accounts.filter(
        (account) => !BALANCE_SHEET_TYPES.includes(account.type),
      ).length,
    };
  }
}
