import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import {
  BASE_COMMANDS,
  BASE_NUMBERS,
  gapsOf,
  readiness,
  type PhraseStat,
} from './corpus-rules';
import { parseDictionary } from './dictionary-rules';
import { toBaluchiScript } from './translit-rules';

type Row = Record<string, unknown>;

/**
 * ترتیب بازبینی.
 *
 * فرمانِ اشتباه هر فروش را خراب می‌کند، عددِ اشتباه مقدار را، و نام
 * کالای اشتباه فقط یک قلم را.  بازبین وقت محدود دارد و باید از
 * گران‌ترین شروع کند.
 */
const KIND_REVIEW_ORDER: Record<string, number> = {
  COMMAND: 0,
  NUMBER: 1,
  PRODUCT: 2,
};

/**
 * گویش‌های بلوچی بلوچستان ایران.
 *
 * نام‌ها محلی‌اند نه دانشگاهی: زبان‌شناس «رخشانی» می‌گوید و سرحدی را
 * زیرمجموعه‌اش می‌داند، ولی کسی که پای صندوق انتخاب می‌کند «سرحدی» را
 * می‌شناسد.
 */
export const DIALECTS = ['SARHADDI', 'MAKRANI', 'SARAWANI'] as const;
export type Dialect = (typeof DIALECTS)[number];

export const DIALECT_LABELS: Record<Dialect, string> = {
  SARHADDI: 'سرحدی',
  MAKRANI: 'مکرانی',
  SARAWANI: 'سراوانی',
};

/**
 * دامنهٔ کار: شرکت، زبان، گویش.
 *
 * سه‌تایی است نه دوتایی چون سرحدی و مکرانی برای یک کالا دو واژهٔ
 * متفاوت دارند — و پیکره‌ای که هر دو در آن باشد، مدل را گیج می‌کند
 * نه غنی.
 */
export type Scope = { companyId: string; lang: string; dialect: Dialect };

export const DEFAULT_LANG = 'bal';
export const DEFAULT_DIALECT: Dialect = 'SARHADDI';

/**
 * ساخت دامنه از پارامترهای اختیاریِ درخواست.
 *
 * گویشِ ناشناس **رد می‌شود** نه اینکه به پیش‌فرض بیفتد: اگر کسی
 * `dialect=makrani` بفرستد و بی‌صدا سرحدی بگیرد، ماه‌ها ضبط در گویش
 * اشتباه ثبت می‌شود و هیچ‌کس نمی‌فهمد چرا مدل کار نمی‌کند.
 */
export function scopeOf(companyId: string, lang?: string, dialect?: string): Scope {
  const raw = dialect?.trim().toUpperCase();

  if (raw && !DIALECTS.includes(raw as Dialect)) {
    throw new BadRequestException(
      `گویش نامعتبر است — یکی از ${DIALECTS.join('، ')} را بفرستید`,
    );
  }

  return {
    companyId,
    lang: lang?.trim() || DEFAULT_LANG,
    dialect: (raw as Dialect) || DEFAULT_DIALECT,
  };
}

/**
 * پیکرهٔ صوتی و واژه‌نامهٔ زبان‌های کم‌منبع.
 *
 * چرا در سامانهٔ فروشگاه: گلوگاهِ ساختن موتور گفتار بلوچی، **داده** است
 * — نه الگوریتم.  هیچ پیکرهٔ آماده‌ای وجود ندارد.
 *
 * Molido فهرست کالاها را دارد.  ضبط نام همان کالاها، پیکره‌ای می‌سازد
 * که دقیقاً واژه‌های کاربردیِ همین فروشگاه را دارد — نه متن عمومی که
 * واژه‌هایش هیچ‌وقت پای صندوق گفته نمی‌شوند.
 */
@Injectable()
export class VoiceService {
  constructor(private readonly db: DatabaseService) {}

  // ------------------------------------------------------- واژه‌نامه

  /**
   * ورود واژه‌نامه از فایل CSV.
   *
   * یک منبع، دو مصرف: متن بلوچیِ عبارت‌های پیکره پر می‌شود، و همان
   * واژه‌ها برای ترجمهٔ رابط کاربری هم برمی‌گردند.
   */
  async importDictionary(scope: Scope, csv: string) {
    const { entries, skipped } = parseDictionary(csv);

    if (!entries.length) {
      throw new BadRequestException(
        skipped[0]?.reason ?? 'هیچ واژه‌ای در فایل پیدا نشد',
      );
    }

    return this.db.transaction(async (tx) => {
      const changes: Array<{ textFa: string; textTarget: string; kind: string }> = [];

      for (const entry of entries) {
        // عبارتی که از قبل هست، متن هدفش پر می‌شود.  عبارتی که نیست،
        // ساخته نمی‌شود: واژه‌نامه هزار واژه دارد و فروشگاه دویست
        // کالا — ساختن عبارت برای هر واژه، پیکره را بی‌جهت بزرگ و
        // ضبطش را نشدنی می‌کند.
        //
        // `RETURNING` عمدی است: شمارهٔ تنها کافی نیست.
        //
        // بیشتر واژه‌نامه‌های بلوچیِ در دسترس با گذر از انگلیسی ساخته
        // می‌شوند، و گذر، ابهامِ فارسی را به خطا بدل می‌کند: «نه» هم
        // عدد ۹ است هم نفی، «جمع» هم جمع‌زدن است هم گردهمایی.  کسی که
        // فایل را وارد می‌کند باید ببیند چه چیزی عوض شد تا بتواند
        // غلط‌ها را بگیرد — «۳۳ مورد تطبیق شد» چیزی برای گرفتن نمی‌دهد.
        const updated = await tx.query<{ textFa: string; kind: string }>(
          `UPDATE "VoicePhrase"
              SET "textTarget" = $4
            WHERE "companyId" = $1 AND lang = $2 AND dialect = $3
              AND "textFa" = $5
            RETURNING "textFa", kind`,
          [scope.companyId, scope.lang, scope.dialect, entry.target, entry.fa],
        );

        for (const row of updated.rows) {
          changes.push({
            textFa: row.textFa,
            textTarget: entry.target,
            kind: row.kind,
          });
        }
      }

      return {
        dialect: scope.dialect,
        words: entries.length,
        matched: changes.length,
        skipped: skipped.length,
        skippedRows: skipped.slice(0, 20),
        // فرمان‌ها و اعداد اول می‌آیند: تعدادشان کم است و غلطشان
        // گران‌تر — نام کالای اشتباه یک قلم را خراب می‌کند، ولی فرمانِ
        // اشتباه هر فروش را.
        changes: changes
          .sort((a, b) => KIND_REVIEW_ORDER[a.kind] - KIND_REVIEW_ORDER[b.kind])
          .slice(0, 200),
      };
    });
  }

  // --------------------------------------------------------- عبارت‌ها

  /**
   * ساخت فهرست عبارت‌ها از کالاهای همین فروشگاه.
   *
   * اعداد و فرمان‌ها هم اضافه می‌شوند: بدون آن‌ها، صندوق‌دار می‌تواند
   * نام کالا بگوید ولی نمی‌تواند بگوید «سه تا».
   */
  async buildPhrases(scope: Scope) {
    return this.db.transaction(async (tx) => {
      const products = await tx.query<{ id: string; name: string }>(
        `SELECT id, name FROM "Product"
          WHERE "companyId" = $1 AND status = 'ACTIVE'
          ORDER BY name
          LIMIT 500`,
        [scope.companyId],
      );

      let created = 0;
      let order = 0;

      const add = async (
        kind: string,
        textFa: string,
        productId: string | null,
      ): Promise<void> => {
        const result = await tx.query(
          `INSERT INTO "VoicePhrase"
             (id, "companyId", lang, dialect, kind, "productId", "textFa", "sortOrder")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT ("companyId", lang, dialect, "textFa") DO NOTHING`,
          [
            randomUUID(),
            scope.companyId,
            scope.lang,
            scope.dialect,
            kind,
            productId,
            textFa,
            order,
          ],
        );
        order += 1;
        created += result.rowCount ?? 0;
      };

      for (const product of products.rows) {
        await add('PRODUCT', product.name, product.id);
      }
      for (const [, word] of BASE_NUMBERS) {
        // واژه ذخیره می‌شود نه رقم — «سه» گفتنی است، «۳» خواندنی.
        await add('NUMBER', word, null);
      }
      for (const command of BASE_COMMANDS) {
        await add('COMMAND', command, null);
      }

      return { dialect: scope.dialect, created, products: products.rows.length };
    });
  }

  async phrases(scope: Scope) {
    return this.db.query<Row>(
      `SELECT p.*,
              COUNT(s.id) FILTER (WHERE s.status = 'APPROVED') AS approved,
              COUNT(s.id) FILTER (WHERE s.status = 'PENDING')  AS pending,
              COUNT(DISTINCT s."speakerTag") FILTER (WHERE s.status = 'APPROVED') AS speakers
         FROM "VoicePhrase" p
         LEFT JOIN "VoiceSample" s ON s."phraseId" = p.id
        WHERE p."companyId" = $1 AND p.lang = $2 AND p.dialect = $3
        GROUP BY p.id
        ORDER BY p.kind, p."sortOrder"`,
      [scope.companyId, scope.lang, scope.dialect],
    );
  }

  async setTarget(companyId: string, phraseId: string, textTarget: string) {
    const rows = await this.db.query<Row>(
      `UPDATE "VoicePhrase" SET "textTarget" = $3
        WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      [phraseId, companyId, textTarget.trim() || null],
    );
    if (!rows[0]) throw new NotFoundException('عبارت یافت نشد');
    return rows[0];
  }

  /**
   * پیشنهاد املای بلوچی برای عبارت‌هایی که واژه‌نامه پوشش نداده.
   *
   * **پیشنهاد** است نه نتیجه: هیچ‌چیز در `textTarget` نوشته نمی‌شود.
   * بلوچ‌زبانی باید هرکدام را ببیند و تأیید کند — واژه‌ای که ماشین
   * حدس زده و آدمی ندیده، از خالی بودنش بدتر است، چون خالی را کسی پر
   * می‌کند و حدسِ اشتباه را کسی بازبینی نمی‌کند.
   */
  async suggestTargets(scope: Scope) {
    const rows = await this.db.query<{ id: string; textFa: string; kind: string }>(
      `SELECT id, "textFa", kind FROM "VoicePhrase"
        WHERE "companyId" = $1 AND lang = $2 AND dialect = $3
          AND "textTarget" IS NULL
        ORDER BY kind, "sortOrder"
        LIMIT 300`,
      [scope.companyId, scope.lang, scope.dialect],
    );

    return rows
      .map((r) => {
        const { suggestion, changed, notes } = toBaluchiScript(r.textFa);
        return {
          phraseId: r.id,
          textFa: r.textFa,
          kind: r.kind,
          suggestion,
          changed,
          notes,
        };
      })
      // عبارتی که هیچ حرف عربی ندارد، پیشنهادش همان خودش است و نشان
      // دادنش فقط بازبین را خسته می‌کند.
      .filter((s) => s.changed);
  }

  // ------------------------------------------------------------ ضبط

  async addSample(
    companyId: string,
    userId: string,
    dto: {
      phraseId: string;
      audioUrl: string;
      speakerTag: string;
      durationMs?: number;
      sizeBytes?: number;
    },
  ) {
    const phrase = await this.db.query<{ id: string }>(
      'SELECT id FROM "VoicePhrase" WHERE id = $1 AND "companyId" = $2',
      [dto.phraseId, companyId],
    );
    if (!phrase[0]) throw new NotFoundException('عبارت یافت نشد');

    const rows = await this.db.query<Row>(
      `INSERT INTO "VoiceSample"
         (id, "companyId", "phraseId", "audioUrl", "speakerTag", "durationMs", "sizeBytes", "recordedBy")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        randomUUID(),
        companyId,
        dto.phraseId,
        dto.audioUrl,
        dto.speakerTag.trim(),
        dto.durationMs ?? null,
        dto.sizeBytes ?? null,
        userId,
      ],
    );
    return rows[0];
  }

  /**
   * تأیید یا رد ضبط.
   *
   * ضبط نویزی یا اشتباه، مدل را **بدتر** می‌کند نه بهتر — پس بازبینی
   * پیش از آموزش لازم است، نه بعدش.
   */
  async reviewSample(
    companyId: string,
    sampleId: string,
    approved: boolean,
    reason?: string,
  ) {
    const rows = await this.db.query<Row>(
      `UPDATE "VoiceSample"
          SET status = $3, "rejectReason" = $4
        WHERE id = $1 AND "companyId" = $2
        RETURNING *`,
      [
        sampleId,
        companyId,
        approved ? 'APPROVED' : 'REJECTED',
        approved ? null : (reason ?? null),
      ],
    );
    if (!rows[0]) throw new NotFoundException('ضبط یافت نشد');
    return rows[0];
  }

  async pendingSamples(scope: Scope) {
    return this.db.query<Row>(
      `SELECT s.*, p."textFa", p."textTarget", p.kind
         FROM "VoiceSample" s
         JOIN "VoicePhrase" p ON p.id = s."phraseId"
        WHERE s."companyId" = $1 AND p.lang = $2 AND p.dialect = $3
          AND s.status = 'PENDING'
        ORDER BY s."createdAt"
        LIMIT 200`,
      [scope.companyId, scope.lang, scope.dialect],
    );
  }

  // -------------------------------------------------------- آمادگی

  /** «کِی داده کافی است» — پرسشی که باید صریح جواب داشته باشد. */
  async status(scope: Scope) {
    const rows = await this.phrases(scope);

    const stats: PhraseStat[] = rows.map((r) => ({
      phraseId: String(r.id),
      textFa: String(r.textFa),
      textTarget: (r.textTarget as string) ?? null,
      kind: r.kind as PhraseStat['kind'],
      approved: Number(r.approved ?? 0),
      speakers: Number(r.speakers ?? 0),
    }));

    // یک پرس‌وجو برای هر دو عدد.  دو پرس‌وجوی جدا با شرط یکسان، دو جا
    // بود که می‌توانستند از هم جدا بیفتند.
    const totals = await this.db.query<{ duration: string; speakers: string }>(
      `SELECT COALESCE(SUM(s."durationMs"), 0)::text AS duration,
              COUNT(DISTINCT s."speakerTag")::text   AS speakers
         FROM "VoiceSample" s
         JOIN "VoicePhrase" p ON p.id = s."phraseId"
        WHERE s."companyId" = $1 AND p.lang = $2 AND p.dialect = $3
          AND s.status = 'APPROVED'`,
      [scope.companyId, scope.lang, scope.dialect],
    );

    const summary = readiness(stats, Number(totals[0]?.duration ?? 0));

    return {
      ...summary,
      lang: scope.lang,
      dialect: scope.dialect,
      dialectLabel: DIALECT_LABELS[scope.dialect],
      speakers: Number(totals[0]?.speakers ?? 0),
      gaps: gapsOf(stats).slice(0, 50),
    };
  }

  /**
   * خروجی پیکره برای آموزش.
   *
   * قالب مانیفست ساده: هر سطر یک جفت «مسیر صدا ← متن».  همان چیزی که
   * Whisper و Piper می‌خواهند، بدون اینکه سامانه به ابزار آموزش
   * وابسته شود.
   */
  async exportManifest(scope: Scope) {
    const rows = await this.db.query<{
      audioUrl: string;
      textTarget: string | null;
      textFa: string;
      speakerTag: string;
      durationMs: number | null;
    }>(
      `SELECT s."audioUrl", p."textTarget", p."textFa", s."speakerTag", s."durationMs"
         FROM "VoiceSample" s
         JOIN "VoicePhrase" p ON p.id = s."phraseId"
        WHERE s."companyId" = $1 AND p.lang = $2 AND p.dialect = $3
          AND s.status = 'APPROVED'
          AND p."textTarget" IS NOT NULL
        ORDER BY p."sortOrder"`,
      [scope.companyId, scope.lang, scope.dialect],
    );

    return rows.map((r) => ({
      audio: r.audioUrl,
      // متن هدف است نه فارسی: مدل باید بلوچی یاد بگیرد.
      text: r.textTarget,
      speaker: r.speakerTag,
      // گویش در خودِ مانیفست می‌آید: فایلی که سه ماه بعد آموزش داده
      // می‌شود، باید خودش بگوید چه گویشی است.
      dialect: scope.dialect,
      durationMs: r.durationMs,
    }));
  }
}
