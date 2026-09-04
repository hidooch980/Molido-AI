import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { amountInWords } from '../common/number-words';
import { formatJalali } from '../common/jalali';

/**
 * چاپ چک.
 *
 * ---------- مسئله «کجا» است، نه «چه چیزی» ----------
 *
 * برگهٔ چکِ هر بانک چیدمانِ خودش را دارد.  متن همیشه یکی است — تاریخ،
 * مبلغ، در وجه، حروف — ولی جای فیزیکی‌شان چند میلی‌متر فرق دارد، و چند
 * میلی‌متر یعنی چاپ روی خط.
 *
 * ⚠️ پس این سرویس **تصویر نمی‌سازد**؛ داده و مختصات می‌دهد.
 *
 *    ساختنِ PDF در بک‌اند یعنی هر تنظیمِ چند میلی‌متری یک استقرار
 *    می‌خواهد.  با دادنِ مختصات، کاربر همان‌جا در مرورگر جابه‌جا می‌کند
 *    و تا وقتی درست ننشسته، چاپ نمی‌زند.
 *
 * ---------- مبلغ به حروف ----------
 *
 * ⚠️ روی چک اجباری است و دلیلش فنی است: رقمِ ۱۰۰٬۰۰۰ را می‌شود با یک
 *    صفر به ۱٬۰۰۰٬۰۰۰ تبدیل کرد؛ «صد هزار» را نمی‌شود.  حروف رقم را
 *    قفل می‌کند.
 */

type Row = Record<string, unknown>;

/** میدان‌هایی که سامانه می‌شناسد و مقدار می‌سازد. */
const KNOWN_FIELDS = [
  'date',
  'amountDigits',
  'amountWords',
  'payee',
  'note',
] as const;

/**
 * چیدمانِ پیش‌فرض — چکِ صیادیِ متعارف، به میلی‌متر.
 *
 * ⚠️ این اعداد **نقطهٔ شروع‌اند، نه حقیقت**.  کاربر باید یک چکِ باطله
 *    چاپ کند و تنظیمشان کند؛ هیچ چیدمانِ پیش‌فرضی روی همهٔ چاپگرها
 *    درست نمی‌نشیند.
 */
const DEFAULT_FIELDS = {
  date: { x: 132, y: 16, size: 11 },
  amountDigits: { x: 120, y: 34, size: 12 },
  amountWords: { x: 28, y: 46, size: 11 },
  payee: { x: 40, y: 28, size: 11 },
  note: { x: 28, y: 60, size: 9 },
};

@Injectable()
export class ChequePrintService {
  constructor(private readonly db: DatabaseService) {}

  // ------------------------------------------------------- الگوها

  list(companyId: string) {
    return this.db.query<Row>(
      `SELECT * FROM "ChequePrintTemplate" WHERE "companyId" = $1
        ORDER BY "isDefault" DESC, name`,
      [companyId],
    );
  }

  async create(
    companyId: string,
    dto: {
      name?: string;
      bankName?: string;
      widthMm?: number;
      heightMm?: number;
      fields?: Record<string, { x?: number; y?: number; size?: number }>;
      isDefault?: boolean;
    },
  ) {
    const name = dto?.name?.trim();
    if (!name) throw new BadRequestException('نام الگو الزامی است');

    const fields = dto.fields ?? DEFAULT_FIELDS;
    this.assertFields(fields, Number(dto.widthMm ?? 175), Number(dto.heightMm ?? 80));

    return this.db.transaction(async (tx) => {
      // ⚠️ پیش‌فرضِ قبلی برداشته می‌شود پیش از نشاندنِ تازه.
      //    قیدِ یکتا وگرنه درج را رد می‌کند — و کاربر پیامی می‌گیرد که
      //    ربطی به کارش ندارد.
      if (dto.isDefault) {
        await tx.query(
          `UPDATE "ChequePrintTemplate" SET "isDefault" = false, "updatedAt" = now()
            WHERE "companyId" = $1 AND "isDefault"`,
          [companyId],
        );
      }

      const rows = await tx.query<Row>(
        `INSERT INTO "ChequePrintTemplate"
           (id, "companyId", name, "bankName", "widthMm", "heightMm", fields, "isDefault")
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8) RETURNING *`,
        [
          randomUUID(), companyId, name, dto.bankName ?? null,
          dto.widthMm ?? 175, dto.heightMm ?? 80,
          JSON.stringify(fields), Boolean(dto.isDefault),
        ],
      );
      return rows.rows[0];
    });
  }

  async update(
    companyId: string,
    id: string,
    dto: {
      name?: string;
      bankName?: string;
      widthMm?: number;
      heightMm?: number;
      fields?: Record<string, { x?: number; y?: number; size?: number }>;
    },
  ) {
    const existing = await this.db.query<{
      widthMm: string;
      heightMm: string;
    }>(
      `SELECT "widthMm", "heightMm" FROM "ChequePrintTemplate"
        WHERE id = $1 AND "companyId" = $2`,
      [id, companyId],
    );
    if (!existing[0]) throw new NotFoundException('الگو یافت نشد');

    const width = Number(dto.widthMm ?? existing[0].widthMm);
    const height = Number(dto.heightMm ?? existing[0].heightMm);
    if (dto.fields) this.assertFields(dto.fields, width, height);

    const rows = await this.db.query<Row>(
      `UPDATE "ChequePrintTemplate"
          SET name = COALESCE($1, name),
              "bankName" = COALESCE($2, "bankName"),
              "widthMm" = $3, "heightMm" = $4,
              fields = COALESCE($5::jsonb, fields),
              "updatedAt" = now()
        WHERE id = $6 AND "companyId" = $7 RETURNING *`,
      [
        dto.name?.trim() ?? null, dto.bankName ?? null, width, height,
        dto.fields ? JSON.stringify(dto.fields) : null, id, companyId,
      ],
    );
    return rows[0];
  }

  // ------------------------------------------------------- بارِ چاپ

  /**
   * دادهٔ چاپِ یک چک: مقدارِ هر میدان، به‌همراه مختصاتش.
   *
   * ⚠️ چکِ **صادرشده** چاپ می‌شود، نه دریافتی.
   *
   *    چکِ دریافتی را طرفِ مقابل نوشته و چاپش بی‌معنی است؛ درخواستش
   *    معمولاً یعنی کاربر جای نوع را اشتباه گرفته، و بهتر است همان‌جا
   *    بفهمد تا اینکه یک برگهٔ چکِ خام هدر برود.
   */
  async payload(companyId: string, chequeId: string, templateId?: string) {
    const cheques = await this.db.query<{
      id: string;
      chequeNo: string;
      bankName: string | null;
      dueDate: string;
      amount: string;
      type: string;
      ownerName: string | null;
      note: string | null;
    }>(
      `SELECT * FROM "Cheque" WHERE id = $1 AND "companyId" = $2`,
      [chequeId, companyId],
    );
    const cheque = cheques[0];
    if (!cheque) throw new NotFoundException('چک یافت نشد');
    if (cheque.type !== 'ISSUED') {
      throw new BadRequestException(
        'فقط چکِ صادرشده چاپ می‌شود؛ چکِ دریافتی را طرفِ مقابل نوشته است',
      );
    }

    const template = await this.pickTemplate(companyId, templateId);

    const amount = Number(cheque.amount);
    // ⚠️ مبلغ باید عددِ صحیح باشد؛ ریالِ اعشاری روی چک وجود ندارد.
    const rial = Math.round(amount);

    const values: Record<string, string> = {
      date: formatJalali(new Date(cheque.dueDate)),
      amountDigits: rial.toLocaleString('en-US'),
      amountWords: amountInWords(rial),
      payee: cheque.ownerName ?? '',
      note: cheque.note ?? '',
    };

    const fields = (template.fields ?? {}) as Record<
      string,
      { x?: number; y?: number; size?: number }
    >;

    // ⚠️ فقط میدان‌هایی که هم مختصات دارند و هم مقدار.
    //    میدانِ بی‌مختصات جایی چاپ نمی‌شود و میدانِ خالی فقط جوهر
    //    مصرف می‌کند.
    const placed = KNOWN_FIELDS.filter((k) => fields[k] && values[k]).map((k) => ({
      field: k,
      value: values[k],
      x: Number(fields[k].x ?? 0),
      y: Number(fields[k].y ?? 0),
      size: Number(fields[k].size ?? 10),
    }));

    return {
      cheque: {
        id: cheque.id,
        chequeNo: cheque.chequeNo,
        bankName: cheque.bankName,
        amount: rial,
        dueDateJalali: values.date,
      },
      template: {
        id: template.id,
        name: template.name,
        widthMm: Number(template.widthMm),
        heightMm: Number(template.heightMm),
      },
      fields: placed,
      // برای اینکه رابط بتواند هشدار دهد به‌جای اینکه بی‌صدا نچاپد.
      missing: KNOWN_FIELDS.filter((k) => values[k] && !fields[k]),
    };
  }

  // ------------------------------------------------------- کمکی

  private async pickTemplate(companyId: string, templateId?: string) {
    if (templateId) {
      const rows = await this.db.query<Row>(
        `SELECT * FROM "ChequePrintTemplate" WHERE id = $1 AND "companyId" = $2`,
        [templateId, companyId],
      );
      if (!rows[0]) throw new NotFoundException('الگوی چاپ یافت نشد');
      return rows[0] as Row & { id: string; name: string; fields: unknown };
    }

    const rows = await this.db.query<Row>(
      `SELECT * FROM "ChequePrintTemplate"
        WHERE "companyId" = $1 AND "isDefault" LIMIT 1`,
      [companyId],
    );
    if (!rows[0]) {
      throw new NotFoundException(
        'الگوی چاپِ پیش‌فرض تعریف نشده است؛ ابتدا یک الگو بسازید',
      );
    }
    return rows[0] as Row & { id: string; name: string; fields: unknown };
  }

  /**
   * ⚠️ مختصات باید **داخلِ برگه** باشد.
   *
   *    مختصاتِ بیرون از کاغذ خطا نمی‌دهد؛ فقط چیزی چاپ نمی‌شود.  کاربر
   *    یک برگهٔ چکِ خام را هدر می‌دهد و نمی‌فهمد چرا خالی درآمد.
   */
  private assertFields(
    fields: Record<string, { x?: number; y?: number; size?: number }>,
    widthMm: number,
    heightMm: number,
  ) {
    for (const [key, pos] of Object.entries(fields)) {
      if (!(KNOWN_FIELDS as readonly string[]).includes(key)) {
        throw new BadRequestException(
          `میدانِ ناشناخته «${key}». مقادیر مجاز: ${KNOWN_FIELDS.join('، ')}`,
        );
      }
      const x = Number(pos?.x);
      const y = Number(pos?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new BadRequestException(`میدان «${key}»: مختصات عددی نیست`);
      }
      if (x < 0 || y < 0 || x > widthMm || y > heightMm) {
        throw new BadRequestException(
          `میدان «${key}» بیرونِ برگه است (${x}×${y} روی ${widthMm}×${heightMm})`,
        );
      }
      const size = Number(pos?.size ?? 10);
      if (!Number.isFinite(size) || size <= 0 || size > 72) {
        throw new BadRequestException(`میدان «${key}»: اندازهٔ قلم نامعتبر است`);
      }
    }
  }
}
