import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { formatJalali } from '../common/jalali';

/**
 * مغایرت‌گیری بانکی — تطبیقِ صورتحسابِ بانک با گردشِ خزانه.
 *
 * ---------- چرا لازم است ----------
 *
 * دفترِ ما و بانک همیشه فرق دارند: چکِ نقدنشده، کارمزدی که بانک برداشته
 * و ما ثبت نکرده‌ایم، واریزی که مشتری زده و خبر نداریم.  بدونِ
 * مغایرت‌گیری این تفاوت‌ها روی هم جمع می‌شوند تا جایی که معلوم نیست
 * کدامش عادی است و کدامش اشتباه — یا اختلاس.
 *
 * ---------- تصمیمِ اصلی: تطبیقِ مبهم انجام **نمی‌شود** ----------
 *
 * ⚠️ اگر یک سطرِ بانک با **بیش از یک** گردشِ خزانه بخواند، هیچ‌کدام
 *    انتخاب نمی‌شود.
 *
 *    تطبیقِ خودکارِ ساده اولین کاندید را برمی‌دارد.  وقتی دو پرداختِ
 *    هم‌مبلغ در یک روز هست — که در فروشگاه عادی است — نصفِ مواقع
 *    اشتباه جفت می‌کند.  نتیجه هم «تراز» است، چون هر دو مبلغ یکی‌اند؛
 *    فقط شرح و مرجعِ اشتباه به هم چسبیده‌اند و ماه‌ها بعد وقتی کسی
 *    دنبالِ یک تراکنش می‌گردد پیدا می‌شود.
 *
 *    یک تطبیقِ نکرده که آدم ببیند، از یک تطبیقِ غلط که کسی نبیند
 *    بهتر است.
 */

type Row = Record<string, unknown>;

/** پنجرهٔ تاریخِ تطبیقِ خودکار: بانک چند روز دیرتر ثبت می‌کند. */
const MATCH_WINDOW_DAYS = 3;

@Injectable()
export class ReconciliationService {
  constructor(private readonly db: DatabaseService) {}

  // ------------------------------------------------------- جلسه

  list(companyId: string, accountId?: string) {
    const values: unknown[] = [companyId];
    let filter = '';
    if (accountId) {
      values.push(accountId);
      filter = ` AND r."accountId" = $${values.length}`;
    }
    return this.db.query<Row>(
      `SELECT r.*, a.name AS "accountName", a."bankName"
         FROM "BankReconciliation" r
         JOIN "TreasuryAccount" a ON a.id = r."accountId"
        WHERE r."companyId" = $1${filter}
        ORDER BY r."statementDate" DESC`,
      values,
    );
  }

  async create(
    companyId: string,
    dto: { accountId?: string; statementDate?: string; statementBalance?: number; note?: string },
  ) {
    if (!dto?.accountId) throw new BadRequestException('حساب بانکی الزامی است');
    if (!dto?.statementDate) throw new BadRequestException('تاریخ صورتحساب الزامی است');
    const balance = Number(dto.statementBalance);
    if (!Number.isFinite(balance)) {
      throw new BadRequestException('ماندهٔ صورتحساب باید عدد باشد');
    }

    const account = await this.db.query<{ id: string }>(
      `SELECT id FROM "TreasuryAccount" WHERE id = $1 AND "companyId" = $2`,
      [dto.accountId, companyId],
    );
    if (!account[0]) throw new NotFoundException('حساب بانکی یافت نشد');

    try {
      const rows = await this.db.query<Row>(
        `INSERT INTO "BankReconciliation"
           (id, "companyId", "accountId", "statementDate", "statementBalance", note)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [randomUUID(), companyId, dto.accountId, dto.statementDate, balance, dto.note ?? null],
      );
      return rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestException(
          'برای این حساب و این تاریخ، مغایرت‌گیری از قبل باز شده است',
        );
      }
      throw error;
    }
  }

  // ------------------------------------------------------- سطرهای بانک

  /**
   * افزودنِ سطرهای صورتحساب.
   *
   * ⚠️ همه در یک تراکنش.  نیمی از صورتحساب بدتر از هیچ‌چیز است: تراز
   *    نمی‌شود و معلوم هم نیست چون بقیه‌اش نیامده یا چون واقعاً مغایرت
   *    دارد.
   */
  async addLines(
    companyId: string,
    reconciliationId: string,
    lines: Array<{ occurredAt?: string; amount?: number; reference?: string; description?: string }>,
  ) {
    if (!Array.isArray(lines) || !lines.length) {
      throw new BadRequestException('حداقل یک سطر لازم است');
    }

    const rec = await this.open(companyId, reconciliationId);

    return this.db.transaction(async (tx) => {
      let added = 0;
      for (const [i, line] of lines.entries()) {
        const amount = Number(line?.amount);
        if (!line?.occurredAt) {
          throw new BadRequestException(`سطر ${i + 1}: تاریخ ندارد`);
        }
        if (!Number.isFinite(amount) || amount === 0) {
          throw new BadRequestException(`سطر ${i + 1}: مبلغ باید عددِ غیرصفر باشد`);
        }
        await tx.query(
          `INSERT INTO "BankStatementLine"
             (id, "companyId", "reconciliationId", "occurredAt", amount, reference, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            randomUUID(),
            companyId,
            rec.id,
            line.occurredAt,
            amount,
            line.reference ?? null,
            line.description ?? null,
          ],
        );
        added += 1;
      }
      return { reconciliationId: rec.id, added };
    });
  }

  // ------------------------------------------------------- تطبیق

  /**
   * تطبیقِ خودکار — فقط جایی که **یک** کاندید هست.
   *
   * معیار: مبلغِ برابر، و تاریخ در پنجرهٔ چند روزه.  مرجعِ برابر امتیازِ
   * جدا ندارد چون بانک‌ها آن را دستکاری می‌کنند.
   */
  async autoMatch(companyId: string, reconciliationId: string) {
    const rec = await this.open(companyId, reconciliationId);

    return this.db.transaction(async (tx) => {
      const unmatched = await tx.query<{ id: string; occurredAt: string; amount: string }>(
        `SELECT id, "occurredAt", amount FROM "BankStatementLine"
          WHERE "reconciliationId" = $1 AND "matchedTxId" IS NULL
          ORDER BY "occurredAt", id`,
        [rec.id],
      );

      let matched = 0;
      let ambiguous = 0;

      for (const line of unmatched.rows) {
        const candidates = await tx.query<{ id: string }>(
          `SELECT t.id FROM "TreasuryTransaction" t
            WHERE t."companyId" = $1
              AND t."accountId" = $2
              AND t.amount = $3
              AND t.date::date BETWEEN $4::date - $5::int AND $4::date + $5::int
              AND NOT EXISTS (
                SELECT 1 FROM "BankStatementLine" b WHERE b."matchedTxId" = t.id
              )
            LIMIT 2`,
          [companyId, rec.accountId, line.amount, line.occurredAt, MATCH_WINDOW_DAYS],
        );

        // ⚠️ دو کاندید یعنی دست نگه دار — نه «اولی را بردار».
        if (candidates.rows.length !== 1) {
          if (candidates.rows.length > 1) ambiguous += 1;
          continue;
        }

        await tx.query(
          `UPDATE "BankStatementLine"
              SET "matchedTxId" = $1, "matchedAt" = now(), "matchMethod" = 'AUTO'
            WHERE id = $2`,
          [candidates.rows[0].id, line.id],
        );
        matched += 1;
      }

      return { matched, ambiguous, remaining: unmatched.rows.length - matched };
    });
  }

  /** تطبیقِ دستی — برای همان مواردی که خودکار عمداً رد کرد. */
  async match(companyId: string, lineId: string, transactionId: string) {
    const lines = await this.db.query<{ id: string; reconciliationId: string }>(
      `SELECT l.id, l."reconciliationId" FROM "BankStatementLine" l
         JOIN "BankReconciliation" r ON r.id = l."reconciliationId"
        WHERE l.id = $1 AND l."companyId" = $2 AND r.status = 'OPEN'`,
      [lineId, companyId],
    );
    if (!lines[0]) throw new NotFoundException('سطر یافت نشد یا مغایرت‌گیری بسته است');

    try {
      const rows = await this.db.query<Row>(
        `UPDATE "BankStatementLine"
            SET "matchedTxId" = $1, "matchedAt" = now(), "matchMethod" = 'MANUAL'
          WHERE id = $2 RETURNING *`,
        [transactionId, lineId],
      );
      return rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestException('این گردش از قبل به سطرِ دیگری تطبیق خورده است');
      }
      throw error;
    }
  }

  async unmatch(companyId: string, lineId: string) {
    const rows = await this.db.query<Row>(
      `UPDATE "BankStatementLine"
          SET "matchedTxId" = NULL, "matchedAt" = NULL, "matchMethod" = NULL
        WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      [lineId, companyId],
    );
    if (!rows[0]) throw new NotFoundException('سطر یافت نشد');
    return rows[0];
  }

  // ------------------------------------------------------- خلاصه

  /**
   * خلاصهٔ مغایرت.
   *
   * ⚠️ «اختلاف» تنها عددی است که اهمیت دارد، و باید **صفر** شود.
   *
   *    ماندهٔ دفتر + واریزی‌های در راه − برداشت‌های در راه = ماندهٔ بانک.
   *    هر چه غیر این باشد یعنی چیزی هست که هنوز توضیح داده نشده.
   */
  async summary(companyId: string, reconciliationId: string) {
    const recs = await this.db.query<Row>(
      `SELECT r.*, a.name AS "accountName" FROM "BankReconciliation" r
         JOIN "TreasuryAccount" a ON a.id = r."accountId"
        WHERE r.id = $1 AND r."companyId" = $2`,
      [reconciliationId, companyId],
    );
    const rec = recs[0];
    if (!rec) throw new NotFoundException('مغایرت‌گیری یافت نشد');

    // ماندهٔ دفتر تا تاریخِ صورتحساب — از گردش، نه از ستونِ balance که
    // ماندهٔ **امروز** است.
    const book = await this.db.query<{ net: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS net
         FROM "TreasuryTransaction"
        WHERE "companyId" = $1 AND "accountId" = $2 AND date::date <= $3`,
      [companyId, rec.accountId, rec.statementDate],
    );

    const lines = await this.db.query<Row>(
      `SELECT l.*, t.description AS "txDescription", t.date AS "txDate"
         FROM "BankStatementLine" l
         LEFT JOIN "TreasuryTransaction" t ON t.id = l."matchedTxId"
        WHERE l."reconciliationId" = $1
        ORDER BY l."occurredAt", l.id`,
      [reconciliationId],
    );

    // گردشِ دفتری که هیچ سطرِ بانکی نگرفته — «در راه».
    const unmatchedBook = await this.db.query<Row>(
      `SELECT t.id, t.date, t.amount, t.description, t.reference
         FROM "TreasuryTransaction" t
        WHERE t."companyId" = $1 AND t."accountId" = $2
          AND t.date::date <= $3
          AND NOT EXISTS (
            SELECT 1 FROM "BankStatementLine" b
             WHERE b."matchedTxId" = t.id AND b."reconciliationId" = $4
          )
        ORDER BY t.date`,
      [companyId, rec.accountId, rec.statementDate, reconciliationId],
    );

    const bookBalance = Number(book[0]?.net ?? 0);
    const statementBalance = Number(rec.statementBalance);
    const inTransit = unmatchedBook.reduce((a, t) => a + Number(t.amount), 0);
    const unmatchedBankTotal = lines
      .filter((l) => !l.matchedTxId)
      .reduce((a, l) => a + Number(l.amount), 0);

    // ⚠️ فرمولِ اول این‌همان‌گویی بود و هیچ‌وقت چیزی را نمی‌گرفت.
    //
    //    نوشته بودم `bookBalance - inTransit + unmatchedBankTotal`.  ولی
    //    `bookBalance - inTransit` بنا به تعریف برابرِ جمعِ گردشِ
    //    تطبیق‌خورده است، و آن هم برابرِ جمعِ سطرهای تطبیق‌خوردهٔ بانک.
    //    پس کلِ عبارت همیشه برابرِ **جمعِ سطرهای بانک** درمی‌آمد و
    //    اختلاف فقط وقتی صفر نبود که کاربر ماندهٔ صورتحساب را با جمعِ
    //    سطرها ناسازگار وارد کرده باشد.  یعنی نگهبانی که هیچ مغایرتی
    //    را نمی‌گرفت — و آزمون هم سبز می‌داد.
    //
    // ⚠️ فرمولِ درست، هر دو سو را **جدا** تعدیل می‌کند:
    //
    //      ماندهٔ تعدیل‌شدهٔ بانک = ماندهٔ صورتحساب + اقلامِ در راه
    //      ماندهٔ تعدیل‌شدهٔ دفتر = ماندهٔ دفتر + اقلامِ بانکیِ ثبت‌نشده
    //
    //    «در راه» یعنی آنچه در دفتر هست و بانک هنوز ندیده (چکِ نقدنشده،
    //    واریزِ در راه) — علامت‌دار، پس همان جمعِ گردشِ تطبیق‌نخوردهٔ دفتر.
    //    «اقلامِ بانکیِ ثبت‌نشده» یعنی کارمزد و سودی که بانک زده و ما ثبت
    //    نکرده‌ایم.
    //
    //    این دو مستقل‌اند: یکی از عددِ واردشدهٔ کاربر می‌آید و دیگری از
    //    دفتر.  برابر شدنشان یعنی همه‌چیز توضیح داده شده.
    const adjustedBank = statementBalance + inTransit;
    const adjustedBook = bookBalance + unmatchedBankTotal;
    const difference = adjustedBank - adjustedBook;

    return {
      reconciliation: {
        ...rec,
        statementBalance,
        statementDateJalali: formatJalali(new Date(rec.statementDate as string)),
      },
      bookBalance,
      statementBalance,
      inTransit,
      unmatchedBankTotal,
      adjustedBank,
      adjustedBook,
      difference: Number(difference.toFixed(2)),
      isBalanced: Math.abs(difference) < 0.005,
      lines: lines.map((l) => ({
        ...l,
        amount: Number(l.amount),
        occurredAtJalali: formatJalali(new Date(l.occurredAt as string)),
      })),
      unmatchedBook: unmatchedBook.map((t) => ({ ...t, amount: Number(t.amount) })),
    };
  }

  /**
   * بستنِ مغایرت‌گیری.
   *
   * ⚠️ فقط وقتی اختلاف صفر است.
   *
   *    مغایرت‌گیریِ نابرابر که بسته شود، از مغایرت‌گیریِ نکرده بدتر است:
   *    امضایی پای چیزی می‌گذارد که تراز نیست، و دفعهٔ بعد کسی به آن
   *    تاریخ به‌عنوان نقطهٔ درست تکیه می‌کند.
   */
  async complete(companyId: string, reconciliationId: string, userId?: string) {
    const s = await this.summary(companyId, reconciliationId);
    if ((s.reconciliation as Row).status === 'COMPLETED') {
      throw new BadRequestException('این مغایرت‌گیری از قبل بسته شده است');
    }
    if (!s.isBalanced) {
      throw new BadRequestException(
        `اختلاف ${s.difference} است؛ تا صفر نشود بسته نمی‌شود`,
      );
    }

    const rows = await this.db.query<Row>(
      `UPDATE "BankReconciliation"
          SET status = 'COMPLETED', "completedAt" = now(), "completedBy" = $1,
              "updatedAt" = now()
        WHERE id = $2 AND "companyId" = $3 RETURNING *`,
      [userId ?? null, reconciliationId, companyId],
    );
    return rows[0];
  }

  // ------------------------------------------------------- کمکی

  /** جلسهٔ **باز** — هر تغییری فقط روی جلسهٔ باز مجاز است. */
  private async open(companyId: string, id: string) {
    const rows = await this.db.query<{ id: string; accountId: string; status: string }>(
      `SELECT id, "accountId", status FROM "BankReconciliation"
        WHERE id = $1 AND "companyId" = $2`,
      [id, companyId],
    );
    const rec = rows[0];
    if (!rec) throw new NotFoundException('مغایرت‌گیری یافت نشد');
    if (rec.status !== 'OPEN') {
      throw new BadRequestException('این مغایرت‌گیری بسته شده و تغییر نمی‌کند');
    }
    return rec;
  }
}
