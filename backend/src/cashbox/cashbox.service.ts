import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PostingService } from '../accounting/posting.service';
import { cashBoxMovementEntry } from '../accounting/posting-rules';

type CashBox = Record<string, unknown> & { id: string; balance: string };

/**
 * بابت‌های مجاز.
 *
 * ⚠️ باید با قیدِ `CashBoxTransaction_reason_check` در مهاجرت ۰۶۹ و با
 *    `cashBoxMovementEntry` یکی بماند.  هر بابتی که اینجا اضافه شود و
 *    طرفِ دومِ سند نداشته باشد، بی‌صدا به «سایر» می‌افتد.
 */
const REASONS = ['OWNER', 'BANK', 'ADJUST', 'OTHER'];

@Injectable()
export class CashBoxService {
  constructor(
    private readonly db: DatabaseService,
    private readonly posting: PostingService,
  ) {}

  /**
   * جابه‌جاییِ پول در صندوق — واریز یا برداشت.
   *
   * ⚠️ تا امروز این کار **هیچ ردی نمی‌گذاشت**.
   *
   *    فقط `balance` عوض می‌شد: نه سند دفترکل، نه سطرِ تراکنش.  یعنی
   *    نمی‌شد پرسید «سه‌شنبه چه کسی پنج میلیون برداشت؟»
   *
   *    و هیچ آزمونی نمی‌گرفتش، چون تراز آزمایشی **صفر می‌ماند**:
   *    وقتی اصلاً سندی زده نمی‌شود، چیزی هم نامتراز نمی‌شود.
   *
   * ⚠️ هر سه کار در **یک** تراکنش: موجودی، ردِ حسابرسی، و سند.
   *
   *    اگر سند جدا صادر می‌شد و شکست می‌خورد، پولی جابه‌جا می‌شد که
   *    دفتر از آن بی‌خبر است — همان چیزی که این اصلاح برای رفعش نوشته
   *    شده.  یا هر سه، یا هیچ‌کدام.
   */
  private async move(
    id: string,
    companyId: string,
    amount: number,
    type: 'DEPOSIT' | 'WITHDRAW',
    reason: string,
    note: string | null,
    userId: string | null,
  ) {
    if (!(amount > 0)) {
      throw new BadRequestException('مبلغ باید بزرگ‌تر از صفر باشد');
    }

    // ⚠️ «بابت» اجباری است چون طرفِ دومِ سند از آن می‌آید.
    //
    //    واریزِ مالک، انتقال از بانک و اصلاحِ شمارش سه سندِ متفاوت‌اند.
    //    حدس زدنش یعنی دفتری که تراز است و معنایش غلط — و آن بدتر از
    //    نامتراز بودن است، چون کسی شک نمی‌کند.
    if (!REASONS.includes(reason)) {
      throw new BadRequestException(
        `بابت نامعتبر است. مقادیر مجاز: ${REASONS.join('، ')}`,
      );
    }

    return this.db.transaction(async (tx) => {
      // ⚠️ شرطِ موجودی داخلِ خودِ UPDATE است تا دو برداشتِ هم‌زمان
      //    نتوانند هر دو «موجودی کافی» ببینند.
      //
      // ⚠️ و شرط برای **هر دو** حالت یکی است: `balance + delta >= 0`.
      //
      //    نسخهٔ اول شرط را فقط برای برداشت می‌گذاشت، پس در واریز
      //    پارامترِ `$1` بی‌استفاده می‌ماند و پستگرس نوعش را تشخیص
      //    نمی‌داد: «could not determine data type of parameter $1» —
      //    خطای ۵۰۰ که هیچ اشاره‌ای به علت ندارد.
      //
      //    با یک شرطِ واحد، واریز هم بی‌ضرر از آن رد می‌شود (مبلغ
      //    مثبت است) و پارامترِ بی‌استفاده‌ای نمی‌ماند.
      const delta = type === 'DEPOSIT' ? amount : -amount;

      const updated = await tx.query<CashBox>(
        `UPDATE "CashBox" SET balance = balance + $1::numeric, "updatedAt" = now()
          WHERE id = $2 AND "companyId" = $3
            AND (balance + $1::numeric) >= 0 RETURNING *`,
        [delta, id, companyId],
      );

      const box = updated.rows[0];
      if (!box) {
        const exists = await tx.query<{ id: string }>(
          'SELECT id FROM "CashBox" WHERE id = $1 AND "companyId" = $2',
          [id, companyId],
        );
        if (!exists.rows[0]) throw new NotFoundException('صندوق یافت نشد');
        throw new BadRequestException('موجودی صندوق کافی نیست');
      }

      // ⚠️ `sourceId` شناسهٔ **حرکت** است، نه صندوق.
      //
      //    `JournalEntry_source_key` عمداً یکتاست تا یک رویداد دو بار
      //    سند نخورد.  نسخهٔ اول شناسهٔ صندوق را می‌داد، پس دومین
      //    واریزِ همان صندوق ۴۰۹ می‌گرفت — «این مقدار قبلاً ثبت شده
      //    است»، پیامی که هیچ ربطی به صندوق ندارد و آدم دنبالِ
      //    اشتباهی می‌گردد.
      const movementId = randomUUID();

      const entry = await this.posting.postAuto(tx, companyId, {
        sourceType: 'CashBoxMovement',
        sourceId: movementId,
        description:
          type === 'DEPOSIT' ? 'واریز به صندوق' : 'برداشت از صندوق',
        userId,
        lines: cashBoxMovementEntry({ amount, type, reason }),
      });

      await tx.query(
        `INSERT INTO "CashBoxTransaction"
           (id, "companyId", "cashBoxId", type, amount, reason,
            "balanceAfter", note, "userId", "entryId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          movementId,
          companyId,
          box.id,
          type,
          amount,
          reason,
          box.balance,
          note,
          userId,
          entry?.id ?? null,
        ],
      );

      return box;
    });
  }

  async findAll(companyId: string) {
    return this.db.query(
      `SELECT b.*, (SELECT count(*)::int FROM "Payment" p WHERE p."cashBoxId" = b.id) AS "paymentCount"
       FROM "CashBox" b WHERE b."companyId" = $1 ORDER BY b."createdAt" DESC`,
      [companyId],
    );
  }

  async findOne(id: string, companyId: string) {
    const boxes = await this.db.query<CashBox>(
      'SELECT * FROM "CashBox" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!boxes[0]) throw new NotFoundException('صندوق یافت نشد');

    const payments = await this.db.query(
      'SELECT * FROM "Payment" WHERE "cashBoxId" = $1 ORDER BY "createdAt" DESC LIMIT 30',
      [id],
    );
    return { ...boxes[0], payments };
  }

  async create(companyId: string, data: { name: string; code: string; balance?: number }) {
    const boxes = await this.db.query<CashBox>(
      `INSERT INTO "CashBox" (id, "companyId", name, code, balance)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [randomUUID(), companyId, data.name, data.code, data.balance ?? 0],
    );
    return boxes[0];
  }

  /** واریز به صندوق.  «بابت» تعیین‌کنندهٔ طرفِ دومِ سند است. */
  async deposit(
    id: string,
    companyId: string,
    amount: number,
    reason = 'OTHER',
    note: string | null = null,
    userId: string | null = null,
  ) {
    return this.move(id, companyId, amount, 'DEPOSIT', reason, note, userId);
  }

  /** برداشت از صندوق. */
  async withdraw(
    id: string,
    companyId: string,
    amount: number,
    reason = 'OTHER',
    note: string | null = null,
    userId: string | null = null,
  ) {
    return this.move(id, companyId, amount, 'WITHDRAW', reason, note, userId);
  }

  /** ردِ حسابرسیِ یک صندوق — تازه‌ترین اول. */
  async transactions(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.db.query(
      `SELECT * FROM "CashBoxTransaction"
        WHERE "cashBoxId" = $1 AND "companyId" = $2
        ORDER BY "createdAt" DESC LIMIT 200`,
      [id, companyId],
    );
  }

  async remove(id: string, companyId: string) {
    const box = await this.findOne(id, companyId);
    await this.db.execute('DELETE FROM "CashBox" WHERE id = $1', [id]);
    return box;
  }
}
