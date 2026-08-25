import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { DatabaseService } from '../database/database.service';

type LineRow = {
  id: string;
  title: string;
  amount: string;
  allocated: string | null;
  committed: string;
  spent: string | null;
};

/**
 * تعهد بودجه — بینِ تخصیص و هزینهٔ قطعی.
 *
 * ⚠️ چرا این لایه لازم است؟
 *
 *    قراردادی که امضا شده ولی فاکتورش نیامده، پولِ در دسترس نیست —
 *    ولی در `spent` هم نمی‌نشیند.  بدونِ تعهد، مدیر رقمی می‌بیند که
 *    آزاد نیست و دوباره خرجش می‌کند.
 *
 *    در بخش خصوصی این اشتباهِ پرهزینه است؛ در دستگاه دولتی تخلف.
 *
 * ⚠️ کنترلِ سقف **سخت** است، نه هشدار.
 *
 *    هشدار را می‌شود نادیده گرفت و همیشه گرفته می‌شود.  اگر تعهد از
 *    اعتبار رد شود، درخواست رد می‌شود — مثل قیدِ موجودیِ صندوق در
 *    `Receipt`.
 */
@Injectable()
export class BudgetCommitmentService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * مبنای اعتبار: تخصیص اگر آمده، وگرنه مصوب.
   *
   * ⚠️ مصوب یعنی «اجازه داده شده»، تخصیص یعنی «پول آزاد شده».  ملاکِ
   *    خرج کردن دومی است — و تا نیامده، اولی موقتاً جایش می‌نشیند.
   */
  private base(line: LineRow): number {
    return line.allocated !== null && line.allocated !== undefined
      ? Number(line.allocated)
      : Number(line.amount);
  }

  /** اعتبارِ آزاد = مبنا − تعهدِ باز − هزینهٔ قطعی. */
  private available(line: LineRow): number {
    return (
      this.base(line) - Number(line.committed ?? 0) - Number(line.spent ?? 0)
    );
  }

  /** وضعیتِ یک ردیف — برای نمایش و بررسی. */
  async status(companyId: string, budgetLineId: string) {
    const line = await this.loadLine(companyId, budgetLineId);
    return {
      id: line.id,
      title: line.title,
      approved: Number(line.amount),
      allocated: line.allocated === null ? null : Number(line.allocated),
      committed: Number(line.committed ?? 0),
      spent: Number(line.spent ?? 0),
      available: this.available(line),
    };
  }

  private async loadLine(companyId: string, id: string): Promise<LineRow> {
    // ⚠️ `companyId` از راه `Budget` می‌آید: `BudgetLine` خودش ستونِ
    //    شرکت ندارد، پس بدونِ این پیوند هر شرکتی ردیفِ دیگری را
    //    می‌دید.
    const rows = await this.db.query<LineRow>(
      `SELECT l.id, l.title, l.amount, l."allocated", l."committed", l.spent
         FROM "BudgetLine" l
         JOIN "Budget" b ON b.id = l."budgetId"
        WHERE l.id = $1 AND b."companyId" = $2`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('ردیف بودجه یافت نشد');
    return rows[0];
  }

  /**
   * ثبت تعهد.
   *
   * ⚠️ همه‌چیز در یک تراکنش با `FOR UPDATE`.
   *
   *    بدونِ قفل، دو تعهدِ هم‌زمان هر دو اعتبارِ آزاد را کافی می‌دیدند
   *    و مجموعشان از سقف رد می‌شد — بی‌آنکه هیچ‌کدام خطا بگیرند.
   */
  async commit(
    companyId: string,
    budgetLineId: string,
    input: {
      amount: number;
      sourceType: string;
      sourceId?: string | null;
      note?: string;
      userId?: string | null;
    },
  ) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('مبلغ تعهد باید بزرگ‌تر از صفر باشد');
    }

    return this.db.transaction(async (tx) => {
      const locked = await tx.query<LineRow>(
        `SELECT l.id, l.title, l.amount, l."allocated", l."committed", l.spent
           FROM "BudgetLine" l
           JOIN "Budget" b ON b.id = l."budgetId"
          WHERE l.id = $1 AND b."companyId" = $2
          FOR UPDATE OF l`,
        [budgetLineId, companyId],
      );
      const line = locked.rows[0];
      if (!line) throw new NotFoundException('ردیف بودجه یافت نشد');

      const available = this.available(line);
      if (amount > available) {
        // ⚠️ پیام رقم را می‌گوید.  «اعتبار کافی نیست» تنها، کاربر را
        //    وادار می‌کند عددها را دستی جمع بزند تا بفهمد چقدر کم
        //    دارد.
        throw new BadRequestException(
          `اعتبار کافی نیست — آزاد: ${available.toLocaleString('fa-IR')}، درخواست: ${amount.toLocaleString('fa-IR')}`,
        );
      }

      if (input.sourceId) {
        const dup = await tx.query<{ id: string }>(
          `SELECT id FROM "BudgetCommitment"
            WHERE "companyId" = $1 AND "sourceType" = $2
              AND "sourceId" = $3 AND status = 'OPEN'`,
          [companyId, input.sourceType, input.sourceId],
        );
        if (dup.rows[0]) {
          throw new ConflictException('برای این سند تعهدِ باز وجود دارد');
        }
      }

      const id = randomUUID();
      await tx.query(
        `INSERT INTO "BudgetCommitment"
           (id, "companyId", "budgetLineId", "sourceType", "sourceId",
            amount, note, "userId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          companyId,
          budgetLineId,
          input.sourceType,
          input.sourceId ?? null,
          amount,
          input.note ?? null,
          input.userId ?? null,
        ],
      );

      await tx.query(
        `UPDATE "BudgetLine"
            SET "committed" = "committed" + $1::numeric, "updatedAt" = now()
          WHERE id = $2`,
        [amount, budgetLineId],
      );

      return { id, committed: amount, available: available - amount };
    });
  }

  /**
   * قطعی کردنِ تعهد — تعهد به هزینه تبدیل می‌شود.
   *
   * ⚠️ مبلغِ قطعی می‌تواند **کمتر** از تعهد باشد.
   *
   *    قرارداد صد میلیونی که نودمیلیون فاکتور خورد، ده میلیونش باید
   *    آزاد شود نه اینکه به‌عنوان هزینه بنشیند.  بیشتر بودن ولی
   *    پذیرفته نیست: آن یعنی قرارداد از سقف رد شده و باید تعهدِ تازه
   *    بگیرد.
   */
  async settle(companyId: string, commitmentId: string, actualAmount?: number) {
    return this.db.transaction(async (tx) => {
      const rows = await tx.query<{
        id: string;
        budgetLineId: string;
        amount: string;
        status: string;
      }>(
        `SELECT id, "budgetLineId", amount, status
           FROM "BudgetCommitment"
          WHERE id = $1 AND "companyId" = $2
          FOR UPDATE`,
        [commitmentId, companyId],
      );
      const c = rows.rows[0];
      if (!c) throw new NotFoundException('تعهد یافت نشد');
      if (c.status !== 'OPEN') {
        throw new BadRequestException('این تعهد پیش از این بسته شده است');
      }

      const committed = Number(c.amount);
      const actual =
        actualAmount === undefined || actualAmount === null
          ? committed
          : Number(actualAmount);

      if (!Number.isFinite(actual) || actual < 0) {
        throw new BadRequestException('مبلغ قطعی نامعتبر است');
      }
      if (actual > committed) {
        throw new BadRequestException(
          'مبلغ قطعی از تعهد بیشتر است؛ برای مازاد تعهد تازه ثبت کنید',
        );
      }

      await tx.query(
        `UPDATE "BudgetCommitment"
            SET status = 'SETTLED', amount = $1::numeric, "settledAt" = now()
          WHERE id = $2`,
        [actual, commitmentId],
      );

      // تعهد به‌اندازهٔ **تعهدِ اولیه** آزاد می‌شود و هزینه به‌اندازهٔ
      // مبلغِ قطعی می‌نشیند؛ تفاوتشان خودبه‌خود به اعتبارِ آزاد برمی‌گردد.
      await tx.query(
        `UPDATE "BudgetLine"
            SET "committed" = "committed" - $1::numeric,
                spent = COALESCE(spent, 0) + $2::numeric,
                "updatedAt" = now()
          WHERE id = $3`,
        [committed, actual, c.budgetLineId],
      );

      return { ok: true, settled: actual, released: committed - actual };
    });
  }

  /** آزادسازی — قرارداد لغو شد و اعتبار برمی‌گردد. */
  async release(companyId: string, commitmentId: string) {
    return this.db.transaction(async (tx) => {
      const rows = await tx.query<{
        budgetLineId: string;
        amount: string;
        status: string;
      }>(
        `SELECT "budgetLineId", amount, status FROM "BudgetCommitment"
          WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
        [commitmentId, companyId],
      );
      const c = rows.rows[0];
      if (!c) throw new NotFoundException('تعهد یافت نشد');
      if (c.status !== 'OPEN') {
        throw new BadRequestException('این تعهد پیش از این بسته شده است');
      }

      await tx.query(
        `UPDATE "BudgetCommitment" SET status = 'RELEASED', "settledAt" = now()
          WHERE id = $1`,
        [commitmentId],
      );
      await tx.query(
        `UPDATE "BudgetLine"
            SET "committed" = "committed" - $1::numeric, "updatedAt" = now()
          WHERE id = $2`,
        [Number(c.amount), c.budgetLineId],
      );

      return { ok: true, released: Number(c.amount) };
    });
  }

  /** دفترِ تعهدهای یک ردیف. */
  async ledger(companyId: string, budgetLineId: string) {
    await this.loadLine(companyId, budgetLineId);
    return this.db.query(
      `SELECT id, "sourceType", "sourceId", amount, status, note,
              "createdAt", "settledAt"
         FROM "BudgetCommitment"
        WHERE "companyId" = $1 AND "budgetLineId" = $2
        ORDER BY "createdAt" DESC`,
      [companyId, budgetLineId],
    );
  }
}
