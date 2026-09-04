import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';

/** یک قلم سند: یا بدهکار است یا بستانکار، نه هر دو. */
export type PostingLine = {
  /** کد حساب — نه شناسه؛ فراخوان نباید شناسهٔ داخلی را بداند. */
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
};

export type PostingInput = {
  /** سند مبنا: 'Sale' | 'Purchase' | 'Receipt' | 'Expense' | 'PayrollSlip' */
  sourceType: string;
  sourceId?: string | null;
  description: string;
  lines: PostingLine[];
  entryDate?: Date;
  userId?: string | null;
  /** فقط برای سند اختتامیه — ببینید postIn. */
  allowClosedYear?: boolean;
};

export type JournalEntry = Record<string, unknown> & { id: string; entryNo: string };

/** گروه‌هایی که مانده‌شان با بدهکار افزایش می‌یابد. */
const DEBIT_NATURE = ['ASSET', 'EXPENSE'];

/**
 * صدور سند حسابداری
 *
 * نقطهٔ واحد ثبت در دفتر کل، با همان الگوی `RevenueService`: هر زیرسیستمی که
 * رویداد مالی دارد از اینجا سند می‌زند و هیچ‌جای دیگری مستقیم در
 * `JournalEntry` نمی‌نویسد.
 *
 * توازن سند و بستهٔ بودن سال مالی در سطح دیتابیس اعمال می‌شوند (تریگرهای
 * `007_general_ledger.sql`)، بنابراین این سرویس تنها لایهٔ راحتی است نه تنها
 * خط دفاع.
 */
@Injectable()
export class PostingService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * سند را داخل یک تراکنش موجود صادر می‌کند.
   *
   * عمداً `tx` می‌گیرد: سند باید با همان تراکنشی که فاکتور را ثبت می‌کند
   * commit یا rollback شود، وگرنه دفتر و عملیات از هم جدا می‌افتند.
   */
  async postIn(
    tx: PoolClient,
    companyId: string,
    input: PostingInput,
  ): Promise<JournalEntry> {
    if (!input.lines?.length) {
      throw new BadRequestException('سند بدون قلم قابل صدور نیست');
    }

    const entryDate = input.entryDate ?? new Date();

    // ۱ — سال مالی روز سند
    // تاریخ صریحاً به date تبدیل می‌شود؛ در BETWEEN هر دو طرف پارامترند و
    // PostgreSQL بدون cast نمی‌تواند نوع را استنتاج کند.
    const years = await tx.query<{ id: string; status: string }>(
      `SELECT id, status FROM "FiscalYear"
       WHERE "companyId" = $1 AND "startsOn" <= $2::date AND "endsOn" >= $2::date`,
      [companyId, entryDate.toISOString().slice(0, 10)],
    );
    if (!years.rows[0]) {
      throw new BadRequestException(
        `برای تاریخ ${entryDate.toISOString().slice(0, 10)} سال مالی تعریف نشده است`,
      );
    }

    // سال بسته‌شده دیگر سند نمی‌پذیرد.  بدون این محافظ، یک فروش با تاریخ
    // گذشته پس از بستن سال، صورت‌های مالیِ نهایی‌شده را بی‌سروصدا عوض
    // می‌کند — و اختلافش فقط سال بعد در تراز دیده می‌شود.
    //
    // سند اختتامیه خودش استثناست: با `allowClosedYear` صادر می‌شود، چون
    // دقیقاً در همان لحظه‌ای زده می‌شود که سال بسته می‌شود.
    if (years.rows[0].status === 'CLOSED' && !input.allowClosedYear) {
      throw new BadRequestException(
        'سال مالی بسته شده است و سند جدید نمی‌پذیرد',
      );
    }

    // ۲ — نگاشت کد حساب به شناسه؛ فراخوان کد می‌دهد، نه شناسهٔ داخلی
    const codes = [...new Set(input.lines.map((line) => line.accountCode))];
    const accounts = await tx.query<{ id: string; code: string; isPostable: boolean }>(
      `SELECT id, code, "isPostable" FROM "Account"
       WHERE "companyId" = $1 AND code = ANY($2)`,
      [companyId, codes],
    );

    const byCode = new Map(accounts.rows.map((account) => [account.code, account]));
    const missing = codes.filter((code) => !byCode.has(code));
    if (missing.length) {
      throw new NotFoundException(`حساب یافت نشد: ${missing.join('، ')}`);
    }

    const notPostable = accounts.rows.filter((account) => !account.isPostable);
    if (notPostable.length) {
      throw new BadRequestException(
        `به حساب کل نمی‌توان سند زد: ${notPostable.map((a) => a.code).join('، ')}`,
      );
    }

    // ۳ — توازن؛ تریگر دیتابیس هم می‌گیرد، ولی خطای اینجا گویاتر است
    const totals = input.lines.reduce(
      (sum, line) => ({
        debit: sum.debit + Number(line.debit ?? 0),
        credit: sum.credit + Number(line.credit ?? 0),
      }),
      { debit: 0, credit: 0 },
    );

    if (Math.abs(totals.debit - totals.credit) > 0.004) {
      throw new BadRequestException(
        `سند متوازن نیست: بدهکار ${totals.debit} در برابر بستانکار ${totals.credit}`,
      );
    }
    if (totals.debit === 0) {
      throw new BadRequestException('سند با مبلغ صفر قابل صدور نیست');
    }

    // ۴ — سند
    const entryNo = await this.nextEntryNo(tx, companyId);

    const created = await tx.query<JournalEntry>(
      `INSERT INTO "JournalEntry"
         (id, "companyId", "fiscalYearId", "entryNo", "entryDate",
          "sourceType", "sourceId", description, status, "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'POSTED', $9) RETURNING *`,
      [
        randomUUID(),
        companyId,
        years.rows[0].id,
        entryNo,
        entryDate,
        input.sourceType,
        input.sourceId ?? null,
        input.description,
        input.userId ?? null,
      ],
    );
    const entry = created.rows[0];

    // ۵ — اقلام، و به‌روزرسانی ماندهٔ حساب‌ها
    let lineNo = 1;
    for (const line of input.lines) {
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);
      if ((debit === 0) === (credit === 0)) {
        throw new BadRequestException(
          `هر قلم سند باید دقیقاً یک طرف داشته باشد (حساب ${line.accountCode})`,
        );
      }

      const account = byCode.get(line.accountCode)!;

      await tx.query(
        `INSERT INTO "JournalLine"
           (id, "entryId", "accountId", "lineNo", debit, credit, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), entry.id, account.id, lineNo, debit, credit, line.description ?? null],
      );

      await this.applyToBalance(tx, account.id, debit, credit);
      lineNo += 1;
    }

    return entry;
  }

  /** صدور سند مستقل، وقتی تراکنش بازی در کار نیست. */
  async post(companyId: string, input: PostingInput): Promise<JournalEntry> {
    return this.db.transaction((tx) => this.postIn(tx, companyId, input));
  }

  /**
   * صدور سند خودکار برای یک رویداد عملیاتی.
   *
   * اگر حسابداری شرکت روشن نباشد هیچ کاری نمی‌کند و `null` برمی‌گرداند —
   * شرکتی که هنوز کدینگ حساب ندارد نباید نتواند بفروشد.  ولی وقتی روشن شد،
   * شکست صدور سند یک خطای واقعی است و تراکنش را برمی‌گرداند: دفتر و عملیات
   * هرگز نباید از هم جدا بیفتند.
   */
  async postAuto(
    tx: PoolClient,
    companyId: string,
    input: PostingInput,
  ): Promise<JournalEntry | null> {
    if (!input.lines?.length) return null;

    const enabled = await tx.query<{ ledgerEnabled: boolean }>(
      'SELECT "ledgerEnabled" FROM "Company" WHERE id = $1',
      [companyId],
    );
    if (!enabled.rows[0]?.ledgerEnabled) return null;

    return this.postIn(tx, companyId, input);
  }

  /**
   * خنثی کردن سند با سند معکوس.
   *
   * سند قطعی هرگز حذف یا ویرایش نمی‌شود — این قاعدهٔ پایه‌ای حسابداری است.
   * به‌جای آن سندی با جهت معکوس صادر می‌شود تا رد حسابرسی دست‌نخورده بماند.
   */
  async reverse(companyId: string, entryId: string, reason?: string) {
    return this.db.transaction(async (tx) => {
      const entries = await tx.query<
        JournalEntry & { status: string; sourceType: string; entryDate: Date }
      >(
        'SELECT * FROM "JournalEntry" WHERE id = $1 AND "companyId" = $2 FOR UPDATE',
        [entryId, companyId],
      );
      const original = entries.rows[0];
      if (!original) throw new NotFoundException('سند یافت نشد');
      if (original.status === 'REVERSED') {
        throw new BadRequestException('این سند قبلاً خنثی شده است');
      }

      const lines = await tx.query<{
        code: string;
        debit: string;
        credit: string;
        description: string | null;
      }>(
        `SELECT a.code, l.debit, l.credit, l.description
         FROM "JournalLine" l JOIN "Account" a ON a.id = l."accountId"
         WHERE l."entryId" = $1 ORDER BY l."lineNo"`,
        [entryId],
      );

      // بدهکار و بستانکار جای خود را عوض می‌کنند
      const reversal = await this.postIn(tx, companyId, {
        sourceType: 'REVERSAL',
        sourceId: entryId,
        description: reason ?? `برگشت سند ${original.entryNo}`,
        lines: lines.rows.map((line) => ({
          accountCode: line.code,
          debit: Number(line.credit),
          credit: Number(line.debit),
          description: line.description ?? undefined,
        })),
      });

      await tx.query(
        `UPDATE "JournalEntry" SET status = 'REVERSED', "reversedById" = $1,
                                   "updatedAt" = now()
         WHERE id = $2`,
        [reversal.id, entryId],
      );

      return reversal;
    });
  }

  /**
   * خنثی کردن سند یک مدرک عملیاتی، داخل تراکنش خودِ آن عملیات.
   *
   * وقتی فاکتوری لغو می‌شود، سندش هم باید همان‌جا برگردد.  اگر سندی برای آن
   * مدرک وجود نداشته باشد — مثلاً حسابداری هنگام ثبت خاموش بوده — بی‌صدا رد
   * می‌شود.
   */
  async reverseBySourceIn(
    tx: PoolClient,
    companyId: string,
    sourceType: string,
    sourceId: string,
  ): Promise<void> {
    const entries = await tx.query<{ id: string; entryNo: string }>(
      `SELECT id, "entryNo" FROM "JournalEntry"
       WHERE "companyId" = $1 AND "sourceType" = $2 AND "sourceId" = $3
         AND status <> 'REVERSED'`,
      [companyId, sourceType, sourceId],
    );
    const original = entries.rows[0];
    if (!original) return;

    const lines = await tx.query<{
      code: string;
      debit: string;
      credit: string;
      description: string | null;
    }>(
      `SELECT a.code, l.debit, l.credit, l.description
       FROM "JournalLine" l JOIN "Account" a ON a.id = l."accountId"
       WHERE l."entryId" = $1 ORDER BY l."lineNo"`,
      [original.id],
    );

    const reversal = await this.postIn(tx, companyId, {
      sourceType: 'REVERSAL',
      sourceId: original.id,
      description: `برگشت سند ${original.entryNo}`,
      // بدهکار و بستانکار جای خود را عوض می‌کنند
      lines: lines.rows.map((line) => ({
        accountCode: line.code,
        debit: Number(line.credit),
        credit: Number(line.debit),
        description: line.description ?? undefined,
      })),
    });

    await tx.query(
      `UPDATE "JournalEntry" SET status = 'REVERSED', "reversedById" = $1, "updatedAt" = now()
       WHERE id = $2`,
      [reversal.id, original.id],
    );
  }

  // ---------- کمکی ----------

  /**
   * ماندهٔ حساب را بر اساس ماهیتش تغییر می‌دهد.
   *
   * دارایی و هزینه با بدهکار زیاد می‌شوند؛ بدهی، سرمایه و درآمد با بستانکار.
   * محاسبه در خود SQL انجام می‌شود تا دو سند هم‌زمان ماندهٔ هم را پاک نکنند.
   */
  private async applyToBalance(
    tx: PoolClient,
    accountId: string,
    debit: number,
    credit: number,
  ): Promise<void> {
    // پارامترها صریحاً numeric می‌شوند؛ در عبارت `$2 - $3` هر دو طرف پارامترند
    // و PostgreSQL نمی‌تواند تشخیص دهد کدام عملگر تفریق را صدا بزند.
    await tx.query(
      `UPDATE "Account"
       SET balance = balance + CASE WHEN type = ANY($1)
                                    THEN $2::numeric - $3::numeric
                                    ELSE $3::numeric - $2::numeric END,
           "updatedAt" = now()
       WHERE id = $4`,
      [DEBIT_NATURE, debit, credit, accountId],
    );
  }

  /**
   * شمارهٔ سند بعدی.
   *
   * از بیشترین شمارهٔ موجود مشتق می‌شود و قید یکتای
   * `(companyId, entryNo)` تضمین می‌کند دو سند هم‌زمان یک شماره نگیرند؛
   * در آن حالت تراکنش دوم شکست می‌خورد و دوباره تلاش می‌شود.
   */
  private async nextEntryNo(tx: PoolClient, companyId: string): Promise<string> {
    const rows = await tx.query<{ next: string }>(
      `SELECT COALESCE(max(("entryNo")::bigint), 0) + 1 AS next
       FROM "JournalEntry"
       WHERE "companyId" = $1 AND "entryNo" ~ '^[0-9]+$'`,
      [companyId],
    );

    return String(rows.rows[0]?.next ?? 1);
  }
}
