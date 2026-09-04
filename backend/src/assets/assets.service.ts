import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { PostingService } from '../accounting/posting.service';
import { assetAcquisitionEntry } from '../accounting/posting-rules';
import {
  assetDisposalEntry,
  depreciationEntry,
} from '../accounting/posting-rules';

/**
 * دارایی ثابت و استهلاک.
 *
 * جدول `Asset` همهٔ ورودی‌های لازم را داشت — بهای خرید، ارزش اسقاط، عمر
 * مفید — ولی هیچ‌گاه استهلاکی محاسبه نمی‌شد.  نتیجه این بود که دارایی‌ها
 * تا ابد به ارزش خرید در دفاتر می‌ماندند و سود هر دوره بیش از واقع
 * گزارش می‌شد.
 *
 * دو تصمیم مهم:
 *
 * ۱. **دورهٔ استهلاک ماه است، نه روز.**  استهلاک روزانه در گزارش‌های ماهانه
 *    هیچ دقت بیشتری نمی‌دهد ولی حجم اسناد را سی برابر می‌کند.
 *
 * ۲. **یک سطر برای هر دارایی در هر ماه، با نمایهٔ یکتا.**  اجرای دوبارهٔ
 *    عملیات پایان ماه — که در عمل پیش می‌آید — نباید هزینه را دو برابر کند.
 */

type Row = Record<string, unknown>;

type AssetRow = {
  id: string;
  assetNo: string;
  name: string;
  purchasePrice: string;
  salvageValue: string | null;
  usefulLifeYears: number | null;
  accumulatedDepreciation: string;
  depreciationMethod: string;
  inServiceDate: string | null;
  status: string;
};

@Injectable()
export class AssetsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly posting: PostingService,
  ) {}

  async findAll(companyId: string) {
    return this.db.query<Row>(
      `SELECT a.*,
              COALESCE(a."purchasePrice",0) - COALESCE(a."accumulatedDepreciation",0)
                AS "bookValue"
         FROM "Asset" a
        WHERE a."companyId" = $1
        ORDER BY a."assetNo"`,
      [companyId],
    );
  }

  async findOne(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      `SELECT a.*,
              COALESCE(a."purchasePrice",0) - COALESCE(a."accumulatedDepreciation",0)
                AS "bookValue"
         FROM "Asset" a WHERE a.id = $1 AND a."companyId" = $2`,
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('دارایی یافت نشد');

    const history = await this.db.query<Row>(
      `SELECT * FROM "AssetDepreciation"
        WHERE "assetId" = $1 ORDER BY period DESC LIMIT 60`,
      [id],
    );

    return { ...rows[0], depreciation: history };
  }

  /**
   * ثبتِ دارایی — **و سندش**.
   *
   * ⚠️ تا امروز این تابع فقط `INSERT` می‌کرد و هیچ سندی نمی‌زد.
   *
   *    واگذاری و استهلاک هر دو سند می‌زدند، ولی خودِ خرید نه.  ایراد
   *    در تراز آزمایشیِ زنده دیده شد: حساب ۱۲۰۱ «اموال و تجهیزات» —
   *    که دارایی است — ماندهٔ **بستانکار** داشت.  یعنی دفاتر می‌گفتند
   *    دارایی‌هایی واگذار شده‌اند که هرگز خریداری نشده بودند.
   *
   *    هیچ آزمونی نگرفتش چون تراز **صفر** می‌ماند: هر دو طرفِ سندِ
   *    واگذاری درست بود؛ چیزی که کم بود سندِ **قبلی** بود.  «تراز صفر
   *    است» با «دفتر درست است» یکی نیست.
   */
  async create(companyId: string, dto: Record<string, unknown>, userId?: string) {
    const assetNo =
      (dto.assetNo as string) ?? (await this.nextAssetNo(companyId));

    return this.db.transaction(async (tx) => {
      const created = await tx.query<Row>(
      `INSERT INTO "Asset"
         (id, "companyId", "assetNo", name, category, location, "assignedTo",
          "purchaseDate", "purchasePrice", "salvageValue", "usefulLifeYears",
          status, description, "depreciationMethod", "inServiceDate")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ACTIVE',$12,$13,$14)
       RETURNING *`,
      [
        randomUUID(),
        companyId,
        assetNo,
        dto.name,
        dto.category ?? null,
        dto.location ?? null,
        dto.assignedTo ?? null,
        dto.purchaseDate ?? new Date(),
        dto.purchasePrice ?? 0,
        dto.salvageValue ?? 0,
        // ⚠️ ۱۰، نه NULL.
        //
        //    ستون `usefulLifeYears` در پایگاه داده
        //    `INTEGER NOT NULL DEFAULT 10` است
        //    (`002_core_schema.sql`).  ولی NULLِ **صریح** پیش‌فرضِ
        //    ستون را پر نمی‌کند — فقط **نبودِ** ستون در INSERT آن را
        //    فعال می‌کند.  یک تلهٔ کلاسیکِ SQL.
        //
        //    نتیجه‌اش این بود که ساخت دارایی بدون عمرِ مفید با ۴۰۰ و
        //    پیامِ «یکی از مقدارهای الزامی خالی است» رد می‌شد — پیامی
        //    که نمی‌گوید کدام مقدار، چون عمداً نام ستون را بیرون
        //    نمی‌دهد.  یعنی کاربر ۴۰۰ می‌گرفت بی‌آنکه بفهمد چه کم است،
        //    در حالی که خودِ پایگاه داده جوابش را داشت.
        dto.usefulLifeYears ?? 10,
        dto.description ?? null,
        dto.depreciationMethod ?? 'STRAIGHT_LINE',
        dto.inServiceDate ?? dto.purchaseDate ?? new Date(),
      ],
    );

      const asset = created.rows[0];
      const cost = Number(asset?.purchasePrice ?? 0);

    // ⚠️ داراییِ بی‌بها سند نمی‌خواهد.
    //
    //    ثبتِ سندِ صفر فقط دفتر را شلوغ می‌کند.  و بهای منفی هم رد
    //    می‌شود: سندش تراز را می‌شکند بی‌آنکه چیزی خطا بدهد.
      // ⚠️ دارایی و سندش در **یک** تراکنش.
      //
      //    اگر سند جدا صادر می‌شد و شکست می‌خورد، داراییِ بی‌سند
      //    می‌ماند — دقیقاً همان حالتی که این اصلاح برای رفعش نوشته
      //    شده.  یا هر دو، یا هیچ‌کدام.
      if (cost > 0) {
        await this.posting.postAuto(tx, companyId, {
          sourceType: 'AssetAcquisition',
          sourceId: String(asset.id),
          description: `خرید دارایی ${assetNo}`,
          userId: userId ?? null,
          entryDate: new Date(
            (dto.purchaseDate as string | undefined) ?? Date.now(),
          ),
          lines: assetAcquisitionEntry({
            cost,
            method: (dto.paymentMethod as string | undefined) ?? 'CASH',
          }),
        });
      }

      return asset;
    });
  }

  async update(companyId: string, id: string, dto: Record<string, unknown>) {
    const allowed = [
      'name',
      'category',
      'location',
      'assignedTo',
      'salvageValue',
      'usefulLifeYears',
      'status',
      'description',
      'depreciationMethod',
    ];

    const sets: string[] = [];
    const values: unknown[] = [id, companyId];

    for (const key of allowed) {
      if (dto[key] === undefined) continue;
      values.push(dto[key]);
      sets.push(`"${key}" = $${values.length}`);
    }

    if (!sets.length) return this.findOne(companyId, id);

    const rows = await this.db.query<Row>(
      `UPDATE "Asset" SET ${sets.join(', ')}, "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      values,
    );

    if (!rows[0]) throw new NotFoundException('دارایی یافت نشد');
    return rows[0];
  }

  private async nextAssetNo(companyId: string) {
    const rows = await this.db.query<{ n: string | null }>(
      `SELECT MAX(NULLIF(regexp_replace("assetNo", '\\D', '', 'g'), '')::bigint) AS n
         FROM "Asset" WHERE "companyId" = $1`,
      [companyId],
    );
    return `FA-${String(Number(rows[0]?.n ?? 0) + 1).padStart(5, '0')}`;
  }

  // ------------------------------------------------------------ استهلاک

  /** استهلاک ماهانهٔ یک دارایی؛ صفر یعنی چیزی برای ثبت نیست. */
  private monthlyAmount(asset: AssetRow): number {
    if (asset.depreciationMethod === 'NONE') return 0;
    if (asset.status !== 'ACTIVE') return 0;

    const cost = Number(asset.purchasePrice ?? 0);
    const salvage = Number(asset.salvageValue ?? 0);
    const years = Number(asset.usefulLifeYears ?? 0);
    const accumulated = Number(asset.accumulatedDepreciation ?? 0);

    if (years <= 0 || cost <= salvage) return 0;

    const depreciable = cost - salvage;
    const remaining = depreciable - accumulated;
    if (remaining <= 0) return 0;

    const monthly =
      asset.depreciationMethod === 'DECLINING_BALANCE'
        ? // نزولی: نرخ دو برابر خط مستقیم روی ارزش دفتری باقی‌مانده
          ((cost - accumulated) * (2 / years)) / 12
        : depreciable / (years * 12);

    // آخرین ماه دقیقاً باقی‌مانده را می‌برد، نه بیشتر — وگرنه قید دیتابیس
    // رد می‌کند و دارایی زیر ارزش اسقاط می‌رود.
    return Math.min(monthly, remaining);
  }

  /**
   * اجرای استهلاک برای یک ماه.
   *
   * `period` اولین روز ماه است.  اجرای دوباره برای همان ماه بی‌اثر است
   * (نمایهٔ یکتا) — پس عملیات پایان ماه را می‌شود بی‌خطر تکرار کرد.
   */
  async runDepreciation(companyId: string, userId: string, period?: string) {
    const month = period
      ? new Date(period)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const periodDate = new Date(month.getFullYear(), month.getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    return this.db.transaction(async (tx) => {
      const assets = await tx.query<AssetRow>(
        `SELECT * FROM "Asset"
          WHERE "companyId" = $1 AND status = 'ACTIVE'
            AND "depreciationMethod" <> 'NONE'
            AND "usefulLifeYears" > 0
            -- دارایی پیش از بهره‌برداری مستهلک نمی‌شود
            AND ("inServiceDate" IS NULL OR "inServiceDate" <= $2::date)
          FOR UPDATE`,
        [companyId, periodDate],
      );

      const results: Array<{ assetNo: string; amount: number }> = [];
      let total = 0;

      for (const asset of assets.rows) {
        const amount = Math.round(this.monthlyAmount(asset) * 100) / 100;
        if (amount <= 0) continue;

        // ON CONFLICT DO NOTHING: اگر این ماه قبلاً ثبت شده، رد می‌شود و
        // مانده هم دست نمی‌خورد — تکرارِ بی‌خطر.
        const inserted = await tx.query<{ id: string }>(
          `INSERT INTO "AssetDepreciation"
             (id, "companyId", "assetId", period, amount, "bookValue")
           VALUES ($1,$2,$3,$4::date,$5,$6)
           ON CONFLICT ("assetId", period) DO NOTHING
           RETURNING id`,
          [
            randomUUID(),
            companyId,
            asset.id,
            periodDate,
            amount,
            Number(asset.purchasePrice) -
              Number(asset.accumulatedDepreciation) -
              amount,
          ],
        );

        if (!inserted.rows[0]) continue;

        const accumulated = Number(asset.accumulatedDepreciation) + amount;
        const depreciable =
          Number(asset.purchasePrice) - Number(asset.salvageValue ?? 0);

        await tx.query(
          // $1 هم مقدار ستون است و هم داخل مقایسه؛ بدون cast صریح
          // PostgreSQL نوعش را «text در برابر numeric» می‌بیند و رد می‌کند.
          `UPDATE "Asset"
              SET "accumulatedDepreciation" = $1::numeric,
                  status = CASE WHEN $1::numeric >= $2::numeric
                                THEN 'FULLY_DEPRECIATED' ELSE status END,
                  "updatedAt" = now()
            WHERE id = $3`,
          [accumulated, depreciable, asset.id],
        );

        results.push({ assetNo: asset.assetNo, amount });
        total += amount;
      }

      // یک سند برای کل دوره، نه یک سند به‌ازای هر دارایی: دفتر روزنامه با
      // صدها سند تک‌قلمی عملاً غیرقابل مرور می‌شود.
      if (total > 0) {
        // ⚠️ سندِ **مکمل**، نه سندِ تکراری.
        //
        //    `JournalEntry_source_key` روی
        //    (companyId, sourceType, sourceId) یکتاست.  با
        //    `sourceId = periodDate` ثابت، استهلاکِ هر دوره فقط یک بار
        //    در کلِ عمر قابل ثبت بود.
        //
        //    و این سناریوی نادری نیست، بلکه عادی است:
        //
        //      استهلاک فروردین اجرا می‌شود        → سند ثبت شد
        //      داراییِ تازه‌ای وارد می‌شود
        //      استهلاک فروردین دوباره اجرا می‌شود → **۴۰۹**
        //
        //    و ۴۰۹ فقط «این مقدار قبلاً ثبت شده است» می‌گفت.  بدتر از
        //    پیامِ مبهم این بود که **کل تراکنش برمی‌گشت**: ردیفِ
        //    استهلاکِ داراییِ تازه هم پاک می‌شد.  یعنی آن دارایی هرگز
        //    مستهلک نمی‌شد و هیچ‌کس نمی‌فهمید.
        //
        //    اجرای واقعاً تکراری به اینجا نمی‌رسد: `ON CONFLICT DO
        //    NOTHING` روی (assetId, period) همهٔ ردیف‌ها را رد می‌کند،
        //    `total` صفر می‌ماند و این بلوک اجرا نمی‌شود.  پس رسیدن به
        //    اینجا برای بارِ دوم یعنی مبلغِ **تازه‌ای** هست — و مبلغِ
        //    تازه سندِ خودش را می‌خواهد.  همان کاری که حسابدار با دست
        //    می‌کند.
        const prior = await tx.query<{ n: string }>(
          `SELECT count(*) AS n FROM "JournalEntry"
            WHERE "companyId" = $1 AND "sourceType" = 'AssetDepreciation'
              AND "sourceId" LIKE $2 || '%' AND status <> 'REVERSED'`,
          [companyId, periodDate],
        );
        const seq = Number(prior.rows[0]?.n ?? 0);

        await this.posting.postAuto(tx, companyId, {
          sourceType: 'AssetDepreciation',
          sourceId: seq === 0 ? periodDate : `${periodDate}#${seq + 1}`,
          description:
            seq === 0
              ? `استهلاک دورهٔ ${periodDate.slice(0, 7)}`
              : `استهلاک دورهٔ ${periodDate.slice(0, 7)} — مکمل ${seq + 1}`,
          userId,
          entryDate: new Date(periodDate),
          lines: depreciationEntry(total),
        });
      }

      return { period: periodDate, count: results.length, total, assets: results };
    });
  }

  /** واگذاری یا فروش دارایی. */
  async dispose(
    companyId: string,
    userId: string,
    id: string,
    dto: { proceeds?: number; note?: string },
  ) {
    return this.db.transaction(async (tx) => {
      const rows = await tx.query<AssetRow>(
        `SELECT * FROM "Asset" WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
        [id, companyId],
      );

      const asset = rows.rows[0];
      if (!asset) throw new NotFoundException('دارایی یافت نشد');
      if (['DISPOSED', 'SOLD'].includes(asset.status)) {
        throw new BadRequestException('این دارایی قبلاً واگذار شده است');
      }

      const proceeds = Number(dto.proceeds ?? 0);
      const cost = Number(asset.purchasePrice ?? 0);
      const accumulated = Number(asset.accumulatedDepreciation ?? 0);

      await tx.query(
        `UPDATE "Asset"
            SET status = $1, "disposedAt" = now(), "disposalValue" = $2,
                "updatedAt" = now()
          WHERE id = $3`,
        [proceeds > 0 ? 'SOLD' : 'DISPOSED', proceeds, id],
      );

      await this.posting.postAuto(tx, companyId, {
        sourceType: 'AssetDisposal',
        sourceId: id,
        description: `واگذاری دارایی ${asset.assetNo}`,
        userId,
        lines: assetDisposalEntry({ cost, accumulated, proceeds }),
      });

      return {
        assetNo: asset.assetNo,
        bookValue: cost - accumulated,
        proceeds,
        gain: proceeds - (cost - accumulated),
      };
    });
  }

  async stats(companyId: string) {
    const rows = await this.db.query<Row>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'ACTIVE') AS "activeCount",
         COALESCE(SUM("purchasePrice") FILTER (WHERE status <> 'DISPOSED' AND status <> 'SOLD'), 0) AS "totalCost",
         COALESCE(SUM("accumulatedDepreciation") FILTER (WHERE status <> 'DISPOSED' AND status <> 'SOLD'), 0) AS "totalDepreciation",
         COALESCE(SUM("purchasePrice" - "accumulatedDepreciation") FILTER (WHERE status <> 'DISPOSED' AND status <> 'SOLD'), 0) AS "totalBookValue"
       FROM "Asset" WHERE "companyId" = $1`,
      [companyId],
    );

    return rows[0];
  }
}
