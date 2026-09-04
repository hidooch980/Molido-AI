import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { formatJalali } from '../common/jalali';

/**
 * یادآوری‌ها.
 *
 * یادداشتِ سررسیددار که **آدم** تصمیم گرفته به یادش باشد — برخلافِ
 * هشدارهای `notifications` که از دادهٔ موجود مشتق می‌شوند.
 *
 * ⚠️ در همان فیدِ هشدار دیده می‌شود، نه در صفحهٔ جدا.
 *
 *    یادآوری‌ای که کاربر باید جای دیگری دنبالش بگردد، همان یادآوری‌ای
 *    است که فراموش می‌شود.  `getAllAlerts` سررسیدشده‌ها را کنارِ موجودیِ
 *    کم و فاکتورِ تسویه‌نشده می‌آورد.
 */

type Row = Record<string, unknown>;

const ENTITY_TYPES = [
  'CUSTOMER',
  'SUPPLIER',
  'SALE',
  'PURCHASE',
  'CHEQUE',
  'CONTRACT',
  'OTHER',
];

@Injectable()
export class RemindersService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * فهرست.
   *
   * ⚠️ پیش‌فرض فقط `PENDING` است.
   *
   *    فهرستی که انجام‌شده‌های شش ماه گذشته را هم می‌آورد، بعد از دو
   *    هفته غیرقابلِ استفاده می‌شود و کاربر از نگاه کردن به آن دست
   *    می‌کشد — که دقیقاً شکستِ یک سامانهٔ یادآوری است.
   */
  list(
    companyId: string,
    options?: { status?: string; assignedTo?: string; due?: string },
  ) {
    const values: unknown[] = [companyId];
    const where = [`r."companyId" = $1`];

    const status = options?.status ?? 'PENDING';
    if (status !== 'ALL') {
      values.push(status);
      where.push(`r.status = $${values.length}`);
    }
    if (options?.assignedTo) {
      values.push(options.assignedTo);
      where.push(`r."assignedTo" = $${values.length}`);
    }
    // `due=now` یعنی فقط آنچه سررسیدش رسیده.
    if (options?.due === 'now') {
      where.push(`r."dueAt" <= now()`);
    }

    return this.db
      .query<Row>(
        `SELECT r.*,
                btrim(concat_ws(' ', u."firstName", u."lastName")) AS "assigneeName"
           FROM "Reminder" r
           LEFT JOIN "User" u ON u.id = r."assignedTo"
          WHERE ${where.join(' AND ')}
          ORDER BY r."dueAt"
          LIMIT 500`,
        values,
      )
      .then((rows) => rows.map((r) => this.decorate(r)));
  }

  async create(
    companyId: string,
    dto: {
      title?: string;
      note?: string;
      dueAt?: string;
      assignedTo?: string;
      entityType?: string;
      entityId?: string;
    },
    userId?: string,
  ) {
    if (!dto?.title?.trim()) throw new BadRequestException('عنوان الزامی است');
    if (!dto?.dueAt) throw new BadRequestException('تاریخ سررسید الزامی است');

    const due = new Date(dto.dueAt);
    if (Number.isNaN(due.getTime())) {
      throw new BadRequestException('تاریخ سررسید معتبر نیست');
    }

    // ⚠️ نوع و شناسه با هم می‌آیند یا هیچ‌کدام.
    //    شناسهٔ بی‌نوع قابلِ استفاده نیست و نوعِ بی‌شناسه چیزی را باز
    //    نمی‌کند؛ قیدِ پایگاه‌داده هم همین را می‌گوید، ولی پیامِ اینجا
    //    قابلِ فهم‌تر است.
    const hasType = Boolean(dto.entityType);
    const hasId = Boolean(dto.entityId);
    if (hasType !== hasId) {
      throw new BadRequestException('نوع و شناسهٔ موجودیت باید با هم داده شوند');
    }
    if (hasType && !ENTITY_TYPES.includes(String(dto.entityType))) {
      throw new BadRequestException(
        `نوع موجودیت نامعتبر است. مقادیر مجاز: ${ENTITY_TYPES.join('، ')}`,
      );
    }

    const rows = await this.db.query<Row>(
      `INSERT INTO "Reminder"
         (id, "companyId", title, note, "dueAt", "assignedTo",
          "entityType", "entityId", "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        randomUUID(),
        companyId,
        dto.title.trim(),
        dto.note ?? null,
        due,
        dto.assignedTo ?? null,
        dto.entityType ?? null,
        dto.entityId ?? null,
        userId ?? null,
      ],
    );
    return this.decorate(rows[0]);
  }

  /**
   * انجام‌شده.
   *
   * ⚠️ `doneAt` همراه وضعیت نوشته می‌شود، در یک دستور.
   *    قیدِ پایگاه‌داده هم اجبارش می‌کند — دو ستونی که می‌توانند با هم
   *    نخوانند، روزی نمی‌خوانند.
   */
  async complete(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      `UPDATE "Reminder"
          SET status = 'DONE', "doneAt" = now(), "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2 AND status = 'PENDING'
        RETURNING *`,
      [id, companyId],
    );
    if (!rows[0]) {
      const exists = await this.db.query<{ status: string }>(
        `SELECT status FROM "Reminder" WHERE id = $1 AND "companyId" = $2`,
        [id, companyId],
      );
      if (!exists[0]) throw new NotFoundException('یادآوری یافت نشد');
      throw new BadRequestException(`این یادآوری در وضعیت ${exists[0].status} است`);
    }
    return this.decorate(rows[0]);
  }

  async cancel(companyId: string, id: string) {
    const rows = await this.db.query<Row>(
      `UPDATE "Reminder"
          SET status = 'CANCELLED', "doneAt" = NULL, "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2 AND status = 'PENDING'
        RETURNING *`,
      [id, companyId],
    );
    if (!rows[0]) {
      const exists = await this.db.query<{ status: string }>(
        `SELECT status FROM "Reminder" WHERE id = $1 AND "companyId" = $2`,
        [id, companyId],
      );
      if (!exists[0]) throw new NotFoundException('یادآوری یافت نشد');
      throw new BadRequestException(`این یادآوری در وضعیت ${exists[0].status} است`);
    }
    return this.decorate(rows[0]);
  }

  /** به تعویق انداختن — سررسید را جلو می‌برد بی‌آنکه یادآوری گم شود. */
  async snooze(companyId: string, id: string, dueAt?: string) {
    if (!dueAt) throw new BadRequestException('تاریخ سررسید تازه الزامی است');
    const due = new Date(dueAt);
    if (Number.isNaN(due.getTime())) {
      throw new BadRequestException('تاریخ سررسید معتبر نیست');
    }

    const rows = await this.db.query<Row>(
      `UPDATE "Reminder" SET "dueAt" = $1, "updatedAt" = now()
        WHERE id = $2 AND "companyId" = $3 AND status = 'PENDING'
        RETURNING *`,
      [due, id, companyId],
    );
    if (!rows[0]) throw new NotFoundException('یادآوری بازی با این شناسه نیست');
    return this.decorate(rows[0]);
  }

  /** یادآوری‌های سررسیدشده — برای فیدِ هشدار. */
  async due(companyId: string, limit = 50) {
    const rows = await this.db.query<Row>(
      `SELECT r.*, btrim(concat_ws(' ', u."firstName", u."lastName")) AS "assigneeName"
         FROM "Reminder" r
         LEFT JOIN "User" u ON u.id = r."assignedTo"
        WHERE r."companyId" = $1 AND r.status = 'PENDING' AND r."dueAt" <= now()
        ORDER BY r."dueAt"
        LIMIT $2`,
      [companyId, limit],
    );
    return rows.map((r) => this.decorate(r));
  }

  private decorate(row: Row): Row {
    if (!row) return row;
    const due = new Date(row.dueAt as string);
    return {
      ...row,
      dueAtJalali: formatJalali(due),
      // ⚠️ «گذشته» از روی همین لحظه حساب می‌شود، نه ذخیره می‌شود.
      //    ستونِ `isOverdue` فردا غلط می‌شد و کسی هم به‌روزش نمی‌کرد.
      isOverdue: row.status === 'PENDING' && due.getTime() <= Date.now(),
    };
  }
}
