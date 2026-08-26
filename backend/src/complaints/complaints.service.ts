import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { runWithTrackCode } from '../database/tenant-context';
import { Params } from '../database/sql';
import { N8nService } from '../n8n/n8n.service';

type Complaint = Record<string, unknown> & { id: string };

const COMPLAINT_STATUSES = [
  'REGISTERED',
  'REFERRED',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
];

const OPEN_STATUSES = ['REGISTERED', 'REFERRED', 'IN_PROGRESS'];

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly n8n: N8nService,
  ) {}

  async findAll(
    companyId: string,
    options?: { status?: string; category?: string; search?: string },
  ) {
    const params = new Params();
    const conditions = [`"companyId" = ${params.next(companyId)}`];
    if (options?.status) conditions.push(`status = ${params.next(options.status)}`);
    if (options?.category) conditions.push(`category = ${params.next(options.category)}`);
    if (options?.search) {
      const term = params.next(`%${options.search}%`);
      conditions.push(
        `(subject ILIKE ${term} OR "citizenName" ILIKE ${term}
          OR "trackingNo" ILIKE ${term} OR address ILIKE ${term})`,
      );
    }
    return this.db.query<Complaint>(
      `SELECT * FROM "CitizenComplaint" WHERE ${conditions.join(' AND ')} ORDER BY "createdAt" DESC`,
      params.values,
    );
  }

  async findOne(id: string, companyId: string) {
    const rows = await this.db.query<Complaint>(
      'SELECT * FROM "CitizenComplaint" WHERE id = $1 AND "companyId" = $2',
      [id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('پیام شهروندی یافت نشد');
    return rows[0];
  }

  /**
   * پیگیری با کد رهگیری (بدون نیاز به ورود — مخصوص شهروندان).
   *
   * ⚠️ این مسیر تا امروز **همیشه ۴۰۴ می‌داد**، حتی برای کد معتبر.
   *
   *    شهروند توکن ندارد، پس `app.company_id` تهی می‌ماند و سیاستِ
   *    RLS با رفتار fail-closed هیچ سطری برنمی‌گرداند.  یعنی تنها
   *    امکانی که برای خودِ شهروند ساخته شده بود، هرگز کار نکرد.
   *
   *    `ShopTenantMiddleware` همین مسئله را برای فروشگاه عمومی حل
   *    کرده؛ اینجا راهِ دیگری لازم است چون شهروند نمی‌داند شکایتش در
   *    کدام شهرداری ثبت شده — پس نمی‌توان شرکت را از پیکربندی گرفت.
   *
   * ⚠️ `runAsSystem` هم جواب نمی‌دهد: آن حالت فقط برای نقشِ صاحبِ
   *    جدول باز است، نه `molido_app` که برنامه با آن وصل می‌شود.  و
   *    نقشِ مدیر روی مسیرِ عمومی یعنی باز کردنِ همهٔ جدول‌ها.
   *
   *    پس سیاستِ `complaint_public_track` (مهاجرت ۰۵۳) راهِ دومی
   *    می‌سازد که دامنه‌اش یک سطر است، و `runWithTrackCode` مقدارش را
   *    می‌گذارد.
   *
   * ⚠️ این تنها وقتی بی‌خطر است که کدِ رهگیری **حدس‌ناپذیر** باشد.
   *
   *    قید یکتایی `(companyId, trackingNo)` است، نه سراسری.  با کدِ
   *    زمان‌محورِ قبلی (`137-${Date.now()}`) دو شهرداری به‌سادگی کدِ
   *    یکسان می‌گرفتند و این جست‌وجو شکایتِ شرکتِ دیگری را برمی‌گرداند.
   *    بدتر: هر کسی می‌توانست با شمردنِ زمان، شکایاتِ همه را بخواند.
   *
   *    پس کد حالا بخشِ تصادفی دارد و خودش نقشِ رمز را بازی می‌کند.
   *
   * ⚠️ ستون‌های بازگشتی عمداً محدودند: نام، تلفن و نشانیِ شهروند
   *    بیرون نمی‌روند.  دانستنِ کد یعنی «من همان شاکی‌ام»، نه دسترسی
   *    به پروندهٔ کامل.
   */
  async track(trackingNo: string) {
    const rows = await runWithTrackCode(trackingNo, () =>
      this.db.query<Complaint>(
        `SELECT "trackingNo", category, status, subject, "referredTo", "responseNote",
                "createdAt", "updatedAt"
         FROM "CitizenComplaint" WHERE "trackingNo" = $1 LIMIT 1`,
        [trackingNo],
      ),
    );
    if (!rows[0]) throw new NotFoundException('کد رهگیری نامعتبر است');
    return rows[0];
  }

  async create(
    companyId: string,
    data: {
      category?: string;
      citizenName?: string;
      citizenPhone?: string;
      address?: string;
      subject: string;
      description?: string;
    },
  ) {
    const rows = await this.db.query<Complaint>(
      `INSERT INTO "CitizenComplaint"
         (id, "companyId", "trackingNo", category, status, "citizenName", "citizenPhone",
          address, subject, description)
       VALUES ($1, $2, $3, $4, 'REGISTERED', $5, $6, $7, $8, $9) RETURNING *`,
      [
        randomUUID(),
        companyId,
        // ⚠️ بخشِ تصادفی لازم است، نه تزئینی.
        //
        //    نسخهٔ قبلی `137-${Date.now()}` بود: کاملاً قابلِ حدس.  چون
        //    این کد تنها چیزی است که پیگیریِ عمومی را باز می‌کند، حدس
        //    زدنش یعنی خواندنِ شکایتِ دیگران.  دلیلِ کامل بالای `track`.
        //
        //    پیشوندِ ۱۳۷ می‌ماند: شمارهٔ شناخته‌شدهٔ خدماتِ شهریِ ایران
        //    است و شهروند با همان می‌شناسدش.
        `137-${randomBytes(8).toString('base64url')}`,
        data.category ?? 'OTHER',
        data.citizenName ?? null,
        data.citizenPhone ?? null,
        data.address ?? null,
        data.subject,
        data.description ?? null,
      ],
    );
    return rows[0];
  }

  /** ارجاع به واحد مربوطه (مثلاً دفتر فنی، فضای سبز، پسماند) */
  async refer(id: string, companyId: string, referredTo: string) {
    if (!referredTo) throw new BadRequestException('نام واحد مقصد الزامی است');
    await this.findOne(id, companyId);

    const rows = await this.db.query<Complaint>(
      `UPDATE "CitizenComplaint" SET status = 'REFERRED', "referredTo" = $1, "updatedAt" = now()
       WHERE id = $2 RETURNING *`,
      [referredTo, id],
    );
    return rows[0];
  }

  async updateStatus(
    id: string,
    companyId: string,
    data: { status: string; responseNote?: string },
  ) {
    if (!COMPLAINT_STATUSES.includes(data.status)) {
      throw new BadRequestException('وضعیت نامعتبر است');
    }
    await this.findOne(id, companyId);

    const params = new Params();
    const assignments = [`status = ${params.next(data.status)}`];
    if (data.responseNote !== undefined) {
      assignments.push(`"responseNote" = ${params.next(data.responseNote)}`);
    }

    const rows = await this.db.query<Complaint>(
      `UPDATE "CitizenComplaint" SET ${assignments.join(', ')}, "updatedAt" = now()
       WHERE id = ${params.next(id)} RETURNING *`,
      params.values,
    );
    return rows[0];
  }

  async stats(companyId: string) {
    const rows = await this.db.query<{ status: string; category: string; count: string }>(
      `SELECT status, category, count(*)::text AS count FROM "CitizenComplaint"
       WHERE "companyId" = $1 GROUP BY status, category`,
      [companyId],
    );

    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    let total = 0;

    for (const row of rows) {
      const count = Number(row.count);
      total += count;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + count;
      byCategory[row.category] = (byCategory[row.category] ?? 0) + count;
    }

    return {
      total,
      open: OPEN_STATUSES.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0),
      byStatus,
      byCategory,
    };
  }
}
