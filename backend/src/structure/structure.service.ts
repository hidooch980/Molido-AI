import { randomUUID } from 'node:crypto';

import { Injectable, Logger, BadRequestException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { STRUCTURE, FORBIDDEN, type StructureTable } from './structure-map';

export type StructureFile = {
  molidoStructure: number;
  exportedAt: string;
  tables: Record<string, Array<Record<string, unknown>>>;
};

export type RestorePlan = {
  dryRun: boolean;
  tables: Array<{
    table: string;
    label: string;
    created: number;
    existing: number;
    skipped: number;
  }>;
  created: number;
  existing: number;
  warnings: string[];
};

/** نسخهٔ قالب — بازیابیِ فایلِ ناهم‌نسخه رد می‌شود، نه اینکه حدس بزند. */
const FORMAT = 1;

/**
 * پشتیبان و بازیابیِ **ساختار** — نه داده.
 *
 * ⚠️ فرقش با `backup.sh` بنیادی است.
 *
 *    `pg_dump` همه‌چیز را می‌برد و فقط روی **همان** نصب و همان
 *    نسخهٔ شِما برمی‌گردد.  این یکی ساختار را می‌برد تا در نصبِ
 *    **دیگری** بنشیند: فروشگاهِ دوم که می‌خواهد همان کدینگ حساب و
 *    همان دسته‌بندی را داشته باشد، یا فروشگاهی که از نرم‌افزارِ
 *    دیگری می‌آید.
 *
 * ⚠️ بازیابی **افزایشی** است، نه جایگزین.
 *
 *    وسوسه این بود که اول همه‌چیز پاک شود و بعد درج.  ولی آن یعنی
 *    یک بازیابیِ اشتباه، کدینگِ حسابِ فروشگاهی را که سه سال کار
 *    کرده پاک کند — و چون `Account` به `JournalLine` وصل است، یا
 *    می‌شکند یا بدتر، سندها بی‌حساب می‌مانند.
 *
 *    پس: آنچه هست دست نمی‌خورد، آنچه نیست اضافه می‌شود.  اجرای
 *    دوباره‌ی همان فایل هیچ تغییری نمی‌دهد.
 */
@Injectable()
export class StructureService {
  private readonly logger = new Logger(StructureService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * ⚠️ نگهبانِ دوم: پیش از هر خروجی، فهرستِ سفید سنجیده می‌شود.
   *
   *    اگر روزی کسی `merchantId` را به فهرستِ سفید اضافه کند، اینجا
   *    می‌شکند — به‌جای اینکه شبا در فایلی بنشیند که ایمیل می‌شود.
   */
  private assertSafe(spec: StructureTable): void {
    const leak = spec.columns.find((column) =>
      FORBIDDEN.some((bad) => column.toLowerCase().includes(bad.toLowerCase())),
    );
    if (leak) {
      throw new Error(
        `ستونِ «${leak}» از جدول ${spec.table} نباید در پشتیبانِ ساختار باشد`,
      );
    }
  }

  async export(companyId: string): Promise<StructureFile> {
    const tables: StructureFile['tables'] = {};

    for (const spec of STRUCTURE) {
      this.assertSafe(spec);

      const columns = [...spec.columns];
      if (spec.selfRef) columns.push(spec.selfRef);
      for (const ref of Object.keys(spec.refs ?? {})) columns.push(ref);

      const quoted = ['id', ...columns].map((c) => `"${c}"`).join(', ');
      const rows = await this.db.query<Record<string, unknown>>(
        `SELECT ${quoted} FROM "${spec.table}" WHERE "companyId" = $1 ORDER BY 1`,
        [companyId],
      );

      // ⚠️ `id` فقط برای گره زدنِ ارجاع‌های **داخلِ همین فایل** می‌ماند
      //    و هنگام بازیابی دور ریخته می‌شود.  شناسهٔ نصبِ مبدأ در
      //    نصبِ مقصد معنایی ندارد.
      tables[spec.table] = rows;
    }

    return {
      molidoStructure: FORMAT,
      exportedAt: new Date().toISOString(),
      tables,
    };
  }

  async restore(
    companyId: string,
    file: unknown,
    options: { dryRun?: boolean } = {},
  ): Promise<RestorePlan> {
    const parsed = file as StructureFile;

    if (!parsed || typeof parsed !== 'object' || !parsed.tables) {
      throw new BadRequestException('فایلِ ساختار خوانده نشد');
    }

    // ⚠️ نسخهٔ ناشناخته **رد** می‌شود، نه اینکه حدس زده شود.
    //
    //    فایلی از نسخهٔ بعدی می‌تواند ستون‌هایی داشته باشد که معنایشان
    //    عوض شده.  «تا جایی که می‌فهمم بازیابی می‌کنم» یعنی نیمی از
    //    ساختار درست بنشیند و نیمی غلط — بدترین حالت، چون به نظر
    //    موفق می‌آید.
    if (parsed.molidoStructure !== FORMAT) {
      throw new BadRequestException(
        `نسخهٔ فایل (${parsed.molidoStructure ?? '؟'}) با این سامانه (${FORMAT}) نمی‌خواند`,
      );
    }

    const dryRun = options.dryRun === true;
    const plan: RestorePlan = {
      dryRun,
      tables: [],
      created: 0,
      existing: 0,
      warnings: [],
    };

    // نگاشتِ شناسهٔ مبدأ ← شناسهٔ مقصد، برای ترجمهٔ ارجاع‌ها.
    const idMap = new Map<string, string>();

    // ⚠️ `client.query` شیءِ `QueryResult` می‌دهد، نه آرایه.
    //
    //    `DatabaseService.query` سطرها را برمی‌گرداند، ولی کلاینتِ
    //    خامِ داخلِ تراکنش `{ rows: [...] }`.  نسخهٔ اول همان الگو را
    //    فرض کرد و `found[0]` همیشه `undefined` شد — یعنی «موجود
    //    نیست» همیشه درست بود و بازیابی هر بار درج می‌کرد.
    //
    //    و بی‌صدا هم نبود، ولی **دیر** صدا داد: اجرای اول موفق، اجرای
    //    دوم ۴۰۹.  اگر جدولی قیدِ یکتا نداشت، به‌جای خطا ردیفِ تکراری
    //    می‌ساخت و کسی نمی‌فهمید.
    const run = async (tx: {
      query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
    }) => {
      const rowsOf = async <T>(sql: string, params: unknown[]): Promise<T[]> =>
        (await tx.query(sql, params)).rows as T[];

      for (const spec of STRUCTURE) {
        this.assertSafe(spec);

        const rows = parsed.tables[spec.table] ?? [];
        let created = 0;
        let existing = 0;
        let skipped = 0;

        for (const row of rows) {
          const keyValues = spec.key.map((k) => row[k]);

          // ردیفی که کلیدِ طبیعی‌اش تهی است قابلِ تطبیق نیست؛ درجش
          // یعنی تکراری‌سازی در اجرای بعدی.
          if (keyValues.some((v) => v === null || v === undefined || v === '')) {
            skipped += 1;
            continue;
          }

          const where = spec.key
            .map((k, i) => `"${k}" = $${i + 2}`)
            .join(' AND ');
          const found = await rowsOf<{ id: string }>(
            `SELECT id FROM "${spec.table}" WHERE "companyId" = $1 AND ${where}`,
            [companyId, ...keyValues],
          );

          if (found[0]) {
            // ⚠️ موجود **دست نمی‌خورد**.  همین است که بازیابی را
            //    بی‌خطر و تکرارپذیر می‌کند.
            idMap.set(String(row.id), found[0].id);
            existing += 1;
            continue;
          }

          const newId = randomUUID();
          const columns = ['id', 'companyId', ...spec.columns];
          const values: unknown[] = [newId, companyId, ...spec.columns.map((c) => row[c] ?? null)];

          for (const [column, target] of Object.entries(spec.refs ?? {})) {
            const source = row[column];
            const mapped = source ? idMap.get(String(source)) : null;
            if (source && !mapped) {
              plan.warnings.push(
                `${spec.label}: ارجاع به ${target} پیدا نشد و تهی گذاشته شد`,
              );
            }
            columns.push(column);
            values.push(mapped ?? null);
          }

          if (!dryRun) {
            await tx.query(
              `INSERT INTO "${spec.table}" (${columns.map((c) => `"${c}"`).join(', ')})
               VALUES (${values.map((_, i) => `$${i + 1}`).join(', ')})`,
              values,
            );
          }

          idMap.set(String(row.id), newId);
          created += 1;
        }

        plan.tables.push({
          table: spec.table,
          label: spec.label,
          created,
          existing,
          skipped,
        });
        plan.created += created;
        plan.existing += existing;
      }

      // ⚠️ گذرِ دوم برای سلسله‌مراتب.
      //
      //    `Category.parentId` و `Account.parentId` به ردیف‌هایی از
      //    همین جدول اشاره می‌کنند که ممکن است **بعد** از فرزند درج
      //    شده باشند.  گره زدن در همان گذرِ اول یعنی والدهای بعدی
      //    تهی بمانند — و درختِ حساب بی‌آنکه خطایی بدهد صاف شود.
      if (dryRun) return;

      for (const spec of STRUCTURE) {
        if (!spec.selfRef) continue;

        for (const row of parsed.tables[spec.table] ?? []) {
          const child = idMap.get(String(row.id));
          const parent = row[spec.selfRef] ? idMap.get(String(row[spec.selfRef])) : null;
          if (!child || !parent) continue;

          await tx.query(
            `UPDATE "${spec.table}" SET "${spec.selfRef}" = $1
             WHERE id = $2 AND "companyId" = $3 AND "${spec.selfRef}" IS NULL`,
            [parent, child, companyId],
          );
        }
      }
    };

    // ⚠️ همه‌چیز در **یک** تراکنش.
    //
    //    بدونِ آن، شکست در نیمهٔ راه ساختاری نیمه‌کاره می‌گذارد:
    //    انبارهایی بی‌شعبه، حساب‌هایی بی‌والد.  و چون بازیابی
    //    افزایشی است، اجرای دوباره آن نیمه را «موجود» می‌بیند و
    //    هرگز درستش نمی‌کند.
    await this.db.transaction(async (tx) => {
      await run(tx as never);
    });

    this.logger.log(
      `بازیابیِ ساختار${dryRun ? ' (آزمایشی)' : ''}: ${plan.created} تازه، ${plan.existing} موجود`,
    );

    return plan;
  }
}
