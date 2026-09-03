import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { PostingService, PostingLine } from './posting.service';
import {
  addJalaliMonths,
  formatJalali,
  toJalali,
  toTehranDateString,
} from '../common/jalali';

/**
 * سندِ تکرارشونده — اجارهٔ ماهانه، استهلاک، حق بیمه.
 *
 * ---------- سه تصمیم ----------
 *
 * ۱) **توازن هنگامِ ذخیره سنجیده می‌شود، نه فقط هنگامِ صدور.**
 *
 *    ⚠️ الگویی که تراز نیست، هر ماه شکست می‌خورد — و همیشه در بدترین
 *       لحظه: وقتی حسابدار منتظرِ سند است.  یک بار اینجا گرفتنش،
 *       دوازده بار در سال از خطا جلوگیری می‌کند.
 *
 * ۲) **صدورِ دوباره برای یک دوره ممکن نیست.**
 *
 *    ⚠️ و این را قیدِ یکتای پایگاه‌داده تضمین می‌کند، نه یک `if`.
 *       `sourceId` برابرِ «شناسهٔ الگو + دورهٔ شمسی» است، پس دو بار زدنِ
 *       دکمه دو سندِ اجاره نمی‌سازد.
 *
 * ۳) **سررسید با ماهِ شمسی جلو می‌رود، نه با سی روز.**
 *
 *    ⚠️ سی روز روی هم جمع می‌شود: اجارهٔ اولِ فروردین به ۳۱ فروردین
 *       می‌رسد، بعد ۳۰ اردیبهشت، و تا پایانِ سال یک ماه دو سند می‌خورد
 *       و یکی هیچ.
 */

type Row = Record<string, unknown>;

const FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'YEARLY', 'MANUAL'];

/** چند ماهِ شمسی به سررسید افزوده می‌شود. */
const MONTHS_PER: Record<string, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
};

@Injectable()
export class JournalTemplateService {
  constructor(
    private readonly db: DatabaseService,
    private readonly posting: PostingService,
  ) {}

  list(companyId: string, onlyActive = true) {
    return this.db
      .query<Row>(
        `SELECT * FROM "JournalTemplate"
          WHERE "companyId" = $1 ${onlyActive ? 'AND "isActive"' : ''}
          ORDER BY "nextRunOn" NULLS LAST, title`,
        [companyId],
      )
      .then((rows) => rows.map((r) => this.decorate(r)));
  }

  /** الگوهایی که سررسیدشان رسیده — برای فیدِ هشدار. */
  async due(companyId: string, limit = 50) {
    const rows = await this.db.query<Row>(
      `SELECT * FROM "JournalTemplate"
        WHERE "companyId" = $1 AND "isActive"
          AND "nextRunOn" IS NOT NULL AND "nextRunOn" <= CURRENT_DATE
        ORDER BY "nextRunOn"
        LIMIT $2`,
      [companyId, limit],
    );
    return rows.map((r) => this.decorate(r));
  }

  async create(
    companyId: string,
    dto: {
      title?: string;
      description?: string;
      lines?: PostingLine[];
      frequency?: string;
      nextRunOn?: string;
    },
    userId?: string,
  ) {
    if (!dto?.title?.trim()) throw new BadRequestException('عنوان الزامی است');
    if (!dto?.description?.trim()) throw new BadRequestException('شرح سند الزامی است');

    const frequency = dto.frequency ?? 'MONTHLY';
    if (!FREQUENCIES.includes(frequency)) {
      throw new BadRequestException(
        `تناوب نامعتبر است. مقادیر مجاز: ${FREQUENCIES.join('، ')}`,
      );
    }
    if (frequency !== 'MANUAL' && !dto.nextRunOn) {
      throw new BadRequestException('برای الگوی زمان‌بندی‌شده، سررسید الزامی است');
    }

    this.assertBalanced(dto.lines);

    const rows = await this.db.query<Row>(
      `INSERT INTO "JournalTemplate"
         (id, "companyId", title, description, lines, frequency, "nextRunOn", "createdBy")
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8) RETURNING *`,
      [
        randomUUID(),
        companyId,
        dto.title.trim(),
        dto.description.trim(),
        JSON.stringify(dto.lines),
        frequency,
        dto.nextRunOn ?? null,
        userId ?? null,
      ],
    );
    return this.decorate(rows[0]);
  }

  async setActive(companyId: string, id: string, isActive: boolean) {
    const rows = await this.db.query<Row>(
      `UPDATE "JournalTemplate" SET "isActive" = $1, "updatedAt" = now()
        WHERE id = $2 AND "companyId" = $3 RETURNING *`,
      [isActive, id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('الگو یافت نشد');
    return this.decorate(rows[0]);
  }

  /**
   * صدورِ سند از الگو.
   *
   * ⚠️ تاریخِ سند پیش‌فرضش `nextRunOn` است، نه امروز.
   *
   *    اگر حسابدار سندِ مهر را در آبان بزند، باید در **مهر** بنشیند —
   *    وگرنه هزینهٔ مهر در آبان دیده می‌شود و هر دو ماه غلط می‌شوند.
   */
  async generate(companyId: string, id: string, dto?: { entryDate?: string }, userId?: string) {
    const rows = await this.db.query<{
      id: string;
      title: string;
      description: string;
      lines: PostingLine[];
      frequency: string;
      nextRunOn: string | null;
      isActive: boolean;
    }>(
      `SELECT * FROM "JournalTemplate" WHERE id = $1 AND "companyId" = $2`,
      [id, companyId],
    );
    const tpl = rows[0];
    if (!tpl) throw new NotFoundException('الگو یافت نشد');
    if (!tpl.isActive) throw new BadRequestException('این الگو غیرفعال است');

    const entryDate = dto?.entryDate
      ? new Date(dto.entryDate)
      : tpl.nextRunOn
        ? new Date(tpl.nextRunOn)
        : new Date();
    if (Number.isNaN(entryDate.getTime())) {
      throw new BadRequestException('تاریخ سند معتبر نیست');
    }

    // ⚠️ کلیدِ دوره از تقویمِ **شمسی** ساخته می‌شود.
    //    با ماهِ میلادی، سندِ اسفند و فروردین می‌توانستند یک کلید بگیرند.
    const { jy, jm } = toJalali(entryDate);
    const period = `${jy}-${String(jm).padStart(2, '0')}`;

    return this.db.transaction(async (tx) => {
      let entry;
      try {
        entry = await this.posting.postIn(tx, companyId, {
          sourceType: 'RecurringEntry',
          // یکتاییِ «الگو × دوره» را پایگاه‌داده تضمین می‌کند.
          sourceId: `${tpl.id}:${period}`,
          description: `${tpl.description} — ${period}`,
          userId: userId ?? null,
          entryDate,
          lines: tpl.lines,
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new BadRequestException(
            `سندِ این الگو برای دورهٔ ${period} قبلاً صادر شده است`,
          );
        }
        throw error;
      }

      // سررسیدِ بعدی با ماهِ شمسی جلو می‌رود.
      const step = MONTHS_PER[tpl.frequency];
      const nextRun = step ? toTehranDateString(addJalaliMonths(entryDate, step)) : null;

      const updated = await tx.query<Row>(
        `UPDATE "JournalTemplate"
            SET "lastRunOn" = $1, "nextRunOn" = COALESCE($2, "nextRunOn"),
                "updatedAt" = now()
          WHERE id = $3 RETURNING *`,
        [toTehranDateString(entryDate), nextRun, tpl.id],
      );

      return {
        template: this.decorate(updated.rows[0]),
        entryNo: entry.entryNo,
        period,
      };
    });
  }

  /**
   * ⚠️ توازن **و** درستیِ شکلِ اقلام، هر دو اینجا سنجیده می‌شوند.
   *
   *    `postIn` هم توازن را می‌سنجد، ولی آن‌جا دیر است: خطا وقتی بیرون
   *    می‌آید که کاربر ماه‌ها بعد منتظرِ سند است و نمی‌داند الگو از
   *    اول خراب بوده.
   */
  private assertBalanced(lines?: PostingLine[]) {
    if (!Array.isArray(lines) || lines.length < 2) {
      throw new BadRequestException('الگو باید دستِ‌کم دو قلم داشته باشد');
    }

    let debit = 0;
    let credit = 0;
    for (const [i, line] of lines.entries()) {
      if (!line?.accountCode) {
        throw new BadRequestException(`قلم ${i + 1}: کد حساب ندارد`);
      }
      const d = Number(line.debit ?? 0);
      const c = Number(line.credit ?? 0);
      if (!Number.isFinite(d) || !Number.isFinite(c) || d < 0 || c < 0) {
        throw new BadRequestException(`قلم ${i + 1}: مبلغ نامعتبر است`);
      }
      // ⚠️ قلمی که هم بدهکار و هم بستانکار دارد، معنایش روشن نیست.
      if (d > 0 && c > 0) {
        throw new BadRequestException(`قلم ${i + 1}: هم بدهکار و هم بستانکار دارد`);
      }
      if (d === 0 && c === 0) {
        throw new BadRequestException(`قلم ${i + 1}: مبلغ صفر است`);
      }
      debit += d;
      credit += c;
    }

    if (Math.abs(debit - credit) > 0.005) {
      throw new BadRequestException(
        `الگو تراز نیست: بدهکار ${debit} و بستانکار ${credit}`,
      );
    }
  }

  private decorate(row: Row): Row {
    if (!row) return row;
    return {
      ...row,
      nextRunOnJalali: row.nextRunOn ? formatJalali(new Date(row.nextRunOn as string)) : null,
      lastRunOnJalali: row.lastRunOn ? formatJalali(new Date(row.lastRunOn as string)) : null,
      isDue:
        Boolean(row.isActive) &&
        Boolean(row.nextRunOn) &&
        new Date(row.nextRunOn as string).getTime() <= Date.now(),
    };
  }
}


