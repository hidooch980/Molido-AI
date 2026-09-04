import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import {
  AGGREGATES,
  DATASETS,
  DEFAULT_ROWS,
  Dataset,
  DatasetField,
  MAX_ROWS,
  OPERATORS,
} from './report-datasets';

/**
 * گزارش‌ساز.
 *
 * ---------- اصلِ طراحی ----------
 *
 * ⚠️ **هیچ رشته‌ای از کاربر وارد SQL نمی‌شود.**
 *
 *    راهِ ساده این بود که یک تکه SQL بگیریم و اجرا کنیم.  آن راه یعنی
 *    هر کاربرِ سامانه می‌تواند دادهٔ شرکت‌های دیگر، درهم‌سازیِ رمزها و
 *    کلیدهای API را بخواند — و پاک کند.
 *
 *    اینجا کاربر فقط **کلید** می‌فرستد (`total`, `customerName`) و
 *    عبارتِ SQL از `report-datasets.ts` برداشته می‌شود.  کلیدِ ناشناخته
 *    خطا می‌گیرد، نه اینکه به پرس‌وجو راه پیدا کند.  مقدارها همیشه
 *    پارامترند.
 *
 * ---------- سه محافظِ دیگر ----------
 *
 * ۱) **RLS لایهٔ اول است.**  گزارش با اتصالِ همان مستأجر اجرا می‌شود، پس
 *    حتی اگر شرطِ `companyId` فراموش شود، سیاست‌ها جلویش را می‌گیرند.
 *    شرطِ صریح در `from` لایهٔ دوم است.
 *
 * ۲) **سقفِ سطر اجباری است.**  گزارش‌سازِ بی‌سقف دکمه‌ای است با برچسبِ
 *    «اجرا» که سرور را می‌خواباند.
 *
 * ۳) **سازگاریِ گروه‌بندی پیش از اجرا سنجیده می‌شود.**  ستونی که نه در
 *    `GROUP BY` است و نه تجمیع شده، خطای پستگرس می‌گیرد با پیامی که
 *    کاربر نمی‌فهمد.  پیامِ ما می‌گوید کدام ستون و چرا.
 */

type Row = Record<string, unknown>;

export interface ReportSpec {
  columns?: string[];
  filters?: Array<{ field?: string; op?: string; value?: unknown }>;
  groupBy?: string[];
  aggregates?: Array<{ field?: string; fn?: string; as?: string }>;
  orderBy?: { field?: string; dir?: string };
  limit?: number;
}

@Injectable()
export class ReportBuilderService {
  constructor(private readonly db: DatabaseService) {}

  /** فهرستِ مجموعه‌دادها و میدان‌هایشان — رابط از این‌جا فرم می‌سازد. */
  datasets() {
    return Object.values(DATASETS).map((d) => ({
      key: d.key,
      label: d.label,
      fields: d.fields.map((f) => ({
        key: f.key,
        label: f.label,
        kind: f.kind,
        groupable: Boolean(f.groupable),
        aggregatable: Boolean(f.aggregatable),
      })),
      operators: Object.keys(OPERATORS),
      aggregates: Object.keys(AGGREGATES),
      maxRows: MAX_ROWS,
    }));
  }

  // ------------------------------------------------------- اجرا

  async run(companyId: string, datasetKey: string, spec: ReportSpec) {
    const dataset = DATASETS[datasetKey];
    if (!dataset) {
      throw new BadRequestException(
        `مجموعه‌دادهٔ ناشناخته «${datasetKey}». مقادیر مجاز: ${Object.keys(DATASETS).join('، ')}`,
      );
    }

    const values: unknown[] = [companyId];
    const select: string[] = [];
    const groupExpr: string[] = [];

    const groupBy = Array.isArray(spec?.groupBy) ? spec.groupBy : [];
    const aggregates = Array.isArray(spec?.aggregates) ? spec.aggregates : [];
    const columns = Array.isArray(spec?.columns) ? spec.columns : [];

    if (!columns.length && !aggregates.length) {
      throw new BadRequestException('حداقل یک ستون یا یک تجمیع لازم است');
    }

    // ---------- ستون‌ها ----------
    for (const key of columns) {
      const field = this.field(dataset, key);

      // ⚠️ اگر گروه‌بندی هست، ستونِ ساده باید داخلِ آن باشد.
      //    وگرنه پستگرس خطای «column must appear in the GROUP BY clause»
      //    می‌دهد که کاربر نمی‌فهمد چه بکند.
      if (groupBy.length && !groupBy.includes(key)) {
        throw new BadRequestException(
          `ستون «${field.label}» نه در گروه‌بندی است نه تجمیع شده؛ یا به گروه‌بندی اضافه‌اش کنید یا حذفش کنید`,
        );
      }
      select.push(`${field.sql} AS "${field.key}"`);
    }

    // ---------- گروه‌بندی ----------
    for (const key of groupBy) {
      const field = this.field(dataset, key);
      if (!field.groupable) {
        throw new BadRequestException(`روی «${field.label}» نمی‌شود گروه‌بندی کرد`);
      }
      groupExpr.push(field.sql);
      if (!columns.includes(key)) {
        select.push(`${field.sql} AS "${field.key}"`);
      }
    }

    // ---------- تجمیع ----------
    const aliases = new Set(columns);
    for (const agg of aggregates) {
      const fn = AGGREGATES[String(agg?.fn ?? '')];
      if (!fn) {
        throw new BadRequestException(
          `تابعِ تجمیعِ ناشناخته «${agg?.fn}». مقادیر مجاز: ${Object.keys(AGGREGATES).join('، ')}`,
        );
      }
      const field = this.field(dataset, String(agg?.field ?? ''));
      if (fn !== 'COUNT' && !field.aggregatable) {
        throw new BadRequestException(`روی «${field.label}» نمی‌شود ${agg?.fn} گرفت`);
      }

      // ⚠️ نامِ مستعار هم پاک‌سازی می‌شود؛ داخلِ گیومهٔ SQL می‌رود.
      const alias = this.alias(agg?.as ?? `${agg?.fn}_${field.key}`);
      if (aliases.has(alias)) {
        throw new BadRequestException(`نامِ ستونِ «${alias}» تکراری است`);
      }
      aliases.add(alias);
      select.push(`${fn}(${field.sql}) AS "${alias}"`);
    }

    // ---------- صافی‌ها ----------
    const where: string[] = [];
    for (const filter of Array.isArray(spec?.filters) ? spec.filters : []) {
      const field = this.field(dataset, String(filter?.field ?? ''));
      const op = OPERATORS[String(filter?.op ?? '')];
      if (!op) {
        throw new BadRequestException(
          `عملگرِ ناشناخته «${filter?.op}». مقادیر مجاز: ${Object.keys(OPERATORS).join('، ')}`,
        );
      }
      if (filter?.value === undefined || filter?.value === null || filter.value === '') {
        throw new BadRequestException(`صافیِ «${field.label}» مقدار ندارد`);
      }

      // ⚠️ مقدار **همیشه** پارامتر است — هیچ‌وقت داخلِ رشتهٔ SQL.
      if (op === 'ILIKE') {
        if (field.kind === 'number' || field.kind === 'date') {
          throw new BadRequestException(`«شامل» روی «${field.label}» معنا ندارد`);
        }
        values.push(`%${String(filter.value)}%`);
        where.push(`${field.sql}::text ILIKE $${values.length}`);
      } else {
        values.push(this.coerce(field, filter.value));
        where.push(`${field.sql} ${op} $${values.length}`);
      }
    }

    // ---------- ترتیب ----------
    let orderSql = '';
    if (spec?.orderBy?.field) {
      const key = String(spec.orderBy.field);
      // ترتیب می‌تواند روی نامِ مستعارِ تجمیع باشد یا روی میدانِ فهرست.
      if (aliases.has(key) && !DATASETS[datasetKey].fields.some((f) => f.key === key)) {
        orderSql = ` ORDER BY "${this.alias(key)}"`;
      } else {
        orderSql = ` ORDER BY ${this.field(dataset, key).sql}`;
      }
      const dir = String(spec.orderBy.dir ?? 'asc').toLowerCase();
      if (dir !== 'asc' && dir !== 'desc') {
        throw new BadRequestException('جهتِ ترتیب باید asc یا desc باشد');
      }
      // ⚠️ جهت هم از فهرستِ بسته می‌آید، نه از رشتهٔ کاربر.
      orderSql += dir === 'desc' ? ' DESC' : ' ASC';
    }

    // ---------- سقف ----------
    const limit = Math.min(
      Math.max(Number(spec?.limit ?? DEFAULT_ROWS) || DEFAULT_ROWS, 1),
      MAX_ROWS,
    );

    const sql =
      `SELECT ${select.join(', ')}` +
      dataset.from +
      (where.length ? ` AND ${where.join(' AND ')}` : '') +
      (groupExpr.length ? ` GROUP BY ${groupExpr.join(', ')}` : '') +
      orderSql +
      ` LIMIT ${limit}`;

    const rows = await this.db.query<Row>(sql, values);

    return {
      dataset: datasetKey,
      rowCount: rows.length,
      // ⚠️ اگر دقیقاً به سقف خوردیم، احتمالاً سطرِ بیشتری هست.
      //    نگفتنش یعنی کاربر گزارشِ ناقص را کامل فرض می‌کند.
      truncated: rows.length >= limit,
      limit,
      rows,
    };
  }

  // ------------------------------------------------------- تعریف‌ها

  list(companyId: string) {
    return this.db.query<Row>(
      `SELECT * FROM "ReportDefinition" WHERE "companyId" = $1 ORDER BY name`,
      [companyId],
    );
  }

  async save(
    companyId: string,
    dto: { name?: string; description?: string; dataset?: string; spec?: ReportSpec },
    userId?: string,
  ) {
    const name = dto?.name?.trim();
    if (!name) throw new BadRequestException('نام گزارش الزامی است');
    if (!dto?.dataset || !DATASETS[dto.dataset]) {
      throw new BadRequestException('مجموعه‌دادهٔ نامعتبر');
    }

    // ⚠️ مشخصات پیش از ذخیره **اجرا** می‌شود.
    //
    //    گزارشِ ذخیره‌شده‌ای که کار نمی‌کند، بدتر از نبودش است: کاربر
    //    ماه‌ها بعد رویش کلیک می‌کند و خطا می‌گیرد بی‌آنکه بداند چرا.
    await this.run(companyId, dto.dataset, { ...dto.spec, limit: 1 });

    try {
      const rows = await this.db.query<Row>(
        `INSERT INTO "ReportDefinition"
           (id, "companyId", name, description, dataset, spec, "createdBy")
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING *`,
        [
          randomUUID(), companyId, name, dto.description ?? null,
          dto.dataset, JSON.stringify(dto.spec ?? {}), userId ?? null,
        ],
      );
      return rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestException('گزارشی با این نام وجود دارد');
      }
      throw error;
    }
  }

  async runSaved(companyId: string, id: string, overrideLimit?: number) {
    const rows = await this.db.query<{ dataset: string; spec: ReportSpec; name: string }>(
      `SELECT dataset, spec, name FROM "ReportDefinition"
        WHERE id = $1 AND "companyId" = $2`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('گزارش یافت نشد');
    const spec = { ...rows[0].spec };
    if (overrideLimit) spec.limit = overrideLimit;
    const result = await this.run(companyId, rows[0].dataset, spec);
    return { ...result, name: rows[0].name };
  }

  async remove(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      `DELETE FROM "ReportDefinition" WHERE id = $1 AND "companyId" = $2 RETURNING id`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('گزارش یافت نشد');
    return { deleted: true };
  }

  // ------------------------------------------------------- کمکی

  /** کلید ← میدان.  کلیدِ ناشناخته خطا می‌گیرد، نه اینکه رد شود. */
  private field(dataset: Dataset, key: string): DatasetField {
    const field = dataset.fields.find((f) => f.key === key);
    if (!field) {
      throw new BadRequestException(
        `میدانِ ناشناخته «${key}» در «${dataset.label}»`,
      );
    }
    return field;
  }

  /**
   * ⚠️ نامِ مستعار داخلِ گیومهٔ SQL می‌رود، پس فقط حرف و رقم و زیرخط.
   *
   *    گیومهٔ دوتایی در نامِ مستعار می‌تواند از رشته بیرون بزند.  به‌جای
   *    گریز دادن — که یک بار فراموش می‌شود — نویسه‌های خطرناک اصلاً
   *    پذیرفته نمی‌شوند.
   */
  private alias(raw: string): string {
    const clean = String(raw).replace(/[^\p{L}\p{N}_]/gu, '_').slice(0, 40);
    if (!clean || /^_+$/.test(clean)) {
      throw new BadRequestException(`نامِ ستونِ «${raw}» معتبر نیست`);
    }
    return clean;
  }

  /** مقدار را به نوعِ میدان نزدیک می‌کند تا پستگرس خطای نوع ندهد. */
  private coerce(field: DatasetField, value: unknown): unknown {
    if (field.kind === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        throw new BadRequestException(`«${field.label}» عدد می‌خواهد`);
      }
      return n;
    }
    if (field.kind === 'date') {
      const d = new Date(String(value));
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException(`«${field.label}» تاریخ می‌خواهد`);
      }
      return d;
    }
    return String(value);
  }
}
