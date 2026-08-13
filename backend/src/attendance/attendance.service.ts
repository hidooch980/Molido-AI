import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { DatabaseService } from '../database/database.service';

/**
 * حضور و غیاب، مرخصی و مانده مرخصی.
 *
 * پیش از این هر سه ماژول پوستهٔ خالی بودند: حضور ثبت می‌شد ولی اضافه‌کاری
 * محاسبه نمی‌شد، و مرخصی تأیید می‌شد ولی از مانده کم نمی‌کرد.
 *
 * دو تصمیم:
 *
 * ۱. **ساعت کارکرد در سرور محاسبه می‌شود، نه در کلاینت.**  اگر کلاینت
 *    عدد بفرستد، همان عددی که حقوق را می‌سازد قابل دستکاری است.
 *
 * ۲. **تأیید مرخصی و کسر از مانده در یک تراکنش‌اند.**  جدا بودنشان یعنی
 *    مرخصیِ تأییدشده‌ای که از مانده کم نشده — و کارمند می‌تواند بیش از
 *    سهمیه‌اش مرخصی بگیرد.
 */

type Row = Record<string, unknown>;

/** ساعت کاری استاندارد روزانه؛ مازادش اضافه‌کاری است. */
const STANDARD_HOURS = 8;

@Injectable()
export class AttendanceService {
  constructor(private readonly db: DatabaseService) {}

  // ------------------------------------------------------ حضور و غیاب

  async findAll(companyId: string, from?: string, to?: string) {
    const values: unknown[] = [companyId];
    let filter = '';

    if (from) {
      values.push(from);
      filter += ` AND a.date >= $${values.length}::date`;
    }
    if (to) {
      values.push(to);
      filter += ` AND a.date <= $${values.length}::date`;
    }

    return this.db.query<Row>(
      `SELECT a.*,
              TRIM(e."firstName" || ' ' || e."lastName") AS "employeeName",
              e."employeeNo"
         FROM "AttendanceRecord" a
         JOIN "Employee" e ON e.id = a."employeeId"
        WHERE a."companyId" = $1${filter}
        ORDER BY a.date DESC, e."employeeNo"
        LIMIT 500`,
      values,
    );
  }

  /**
   * ثبت یا به‌روزرسانی حضور یک روز.
   *
   * `ON CONFLICT` روی (کارمند، تاریخ): ثبت دوباره همان رکورد را به‌روز
   * می‌کند.  بدون آن، دو بار زدن دکمه ساعت کارکرد را دو برابر می‌شمرد.
   */
  async record(
    companyId: string,
    dto: {
      employeeId: string;
      date: string;
      checkIn?: string;
      checkOut?: string;
      status?: string;
      note?: string;
    },
  ) {
    const employees = await this.db.query<{ id: string }>(
      'SELECT id FROM "Employee" WHERE id = $1 AND "companyId" = $2',
      [dto.employeeId, companyId],
    );
    if (!employees[0]) throw new NotFoundException('کارمند یافت نشد');

    let worked = 0;
    let overtime = 0;

    if (dto.checkIn && dto.checkOut) {
      const start = new Date(dto.checkIn);
      const end = new Date(dto.checkOut);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new BadRequestException('ساعت ورود یا خروج نامعتبر است');
      }
      if (end < start) {
        throw new BadRequestException('ساعت خروج پیش از ورود است');
      }

      const hours = (end.getTime() - start.getTime()) / 3_600_000;
      if (hours > 24) {
        throw new BadRequestException('کارکرد بیش از ۲۴ ساعت ممکن نیست');
      }

      worked = Math.round(Math.min(hours, STANDARD_HOURS) * 100) / 100;
      overtime = Math.round(Math.max(hours - STANDARD_HOURS, 0) * 100) / 100;
    }

    const rows = await this.db.query<Row>(
      `INSERT INTO "AttendanceRecord"
         (id, "companyId", "employeeId", date, "checkIn", "checkOut",
          "workedHours", "overtimeHours", status, note)
       VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10)
       ON CONFLICT ("employeeId", date) DO UPDATE
         SET "checkIn" = EXCLUDED."checkIn",
             "checkOut" = EXCLUDED."checkOut",
             "workedHours" = EXCLUDED."workedHours",
             "overtimeHours" = EXCLUDED."overtimeHours",
             status = EXCLUDED.status,
             note = EXCLUDED.note,
             "updatedAt" = now()
       RETURNING *`,
      [
        randomUUID(),
        companyId,
        dto.employeeId,
        dto.date,
        dto.checkIn ?? null,
        dto.checkOut ?? null,
        worked,
        overtime,
        dto.status ?? 'PRESENT',
        dto.note ?? null,
      ],
    );

    return rows[0];
  }

  /** خلاصهٔ ماهانهٔ هر کارمند — ورودی محاسبهٔ حقوق. */
  async monthlySummary(companyId: string, period: string) {
    const start = new Date(period);
    const from = new Date(start.getFullYear(), start.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const to = new Date(start.getFullYear(), start.getMonth() + 1, 1)
      .toISOString()
      .slice(0, 10);

    return this.db.query<Row>(
      `SELECT e.id AS "employeeId", e."employeeNo",
              TRIM(e."firstName" || ' ' || e."lastName") AS "employeeName",
              COALESCE(SUM(a."workedHours"),0)   AS "workedHours",
              COALESCE(SUM(a."overtimeHours"),0) AS "overtimeHours",
              COUNT(*) FILTER (WHERE a.status = 'PRESENT') AS "presentDays",
              COUNT(*) FILTER (WHERE a.status = 'ABSENT')  AS "absentDays",
              COUNT(*) FILTER (WHERE a.status = 'LEAVE')   AS "leaveDays"
         FROM "Employee" e
         LEFT JOIN "AttendanceRecord" a
           ON a."employeeId" = e.id
          AND a.date >= $2::date AND a.date < $3::date
        WHERE e."companyId" = $1 AND e."isActive" = true
        GROUP BY e.id, e."employeeNo", e."firstName", e."lastName"
        ORDER BY e."employeeNo"`,
      [companyId, from, to],
    );
  }

  // ------------------------------------------------------------ مرخصی

  async leaves(companyId: string, status?: string) {
    const values: unknown[] = [companyId];
    let filter = '';

    if (status) {
      values.push(status);
      filter = ` AND l.status = $${values.length}`;
    }

    return this.db.query<Row>(
      `SELECT l.*,
              TRIM(e."firstName" || ' ' || e."lastName") AS "employeeName",
              e."employeeNo"
         FROM "LeaveRequest" l
         JOIN "Employee" e ON e.id = l."employeeId"
        WHERE l."companyId" = $1${filter}
        ORDER BY l."startDate" DESC
        LIMIT 300`,
      values,
    );
  }

  async requestLeave(
    companyId: string,
    dto: {
      employeeId: string;
      kind?: string;
      startDate: string;
      endDate: string;
      reason?: string;
    },
  ) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('تاریخ نامعتبر است');
    }
    if (end < start) {
      throw new BadRequestException('تاریخ پایان پیش از شروع است');
    }

    // هر دو سر بازه حساب می‌شوند: مرخصی یک‌روزه یعنی یک روز، نه صفر.
    const days =
      Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

    const rows = await this.db.query<Row>(
      `INSERT INTO "LeaveRequest"
         (id, "companyId", "employeeId", kind, "startDate", "endDate", days,
          reason, status)
       VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,'PENDING') RETURNING *`,
      [
        randomUUID(),
        companyId,
        dto.employeeId,
        dto.kind ?? 'ANNUAL',
        dto.startDate,
        dto.endDate,
        days,
        dto.reason ?? null,
      ],
    );

    return rows[0];
  }

  /**
   * تأیید مرخصی: از مانده کم می‌شود و روزهای مرخصی در حضور و غیاب ثبت
   * می‌شوند — همه در یک تراکنش.
   *
   * مرخصی بدون‌حقوق از مانده کم نمی‌شود؛ سهمیهٔ سالانه فقط برای مرخصی
   * استحقاقی است.
   */
  async decideLeave(
    companyId: string,
    userId: string,
    id: string,
    dto: { approve: boolean; note?: string },
  ) {
    return this.db.transaction(async (tx) => {
      const found = await tx.query<{
        id: string;
        employeeId: string;
        kind: string;
        days: string;
        startDate: string;
        endDate: string;
        status: string;
      }>(
        'SELECT * FROM "LeaveRequest" WHERE id = $1 AND "companyId" = $2 FOR UPDATE',
        [id, companyId],
      );

      const leave = found.rows[0];
      if (!leave) throw new NotFoundException('درخواست مرخصی یافت نشد');
      if (leave.status !== 'PENDING') {
        throw new BadRequestException(
          `این درخواست در وضعیت «${leave.status}» است و قابل تصمیم‌گیری نیست`,
        );
      }

      const status = dto.approve ? 'APPROVED' : 'REJECTED';

      await tx.query(
        `UPDATE "LeaveRequest"
            SET status = $1, "decidedAt" = now(), "decidedBy" = $2,
                "decisionNote" = $3, "updatedAt" = now()
          WHERE id = $4`,
        [status, userId, dto.note ?? null, id],
      );

      if (!dto.approve) return { id, status, days: 0 };

      const days = Number(leave.days);
      const year = new Date(leave.startDate).getFullYear();

      if (leave.kind === 'ANNUAL') {
        // سهمیه اگر نبود ساخته می‌شود؛ قید دیتابیس جلوی مصرف بیش از سهمیه
        // را می‌گیرد و تراکنش را برمی‌گرداند.
        await tx.query(
          `INSERT INTO "LeaveBalance"
             (id, "companyId", "employeeId", year, kind, used)
           VALUES ($1,$2,$3,$4,'ANNUAL',$5)
           ON CONFLICT ("employeeId", year, kind) DO UPDATE
             SET used = "LeaveBalance".used + EXCLUDED.used,
                 "updatedAt" = now()`,
          [randomUUID(), companyId, leave.employeeId, year, days],
        );
      }

      // روزهای مرخصی در حضور و غیاب ثبت می‌شوند تا محاسبهٔ حقوق آن‌ها را
      // به‌عنوان غیبت نشمارد.
      await tx.query(
        `INSERT INTO "AttendanceRecord"
           (id, "companyId", "employeeId", date, status, "leaveRequestId",
            "workedHours", "overtimeHours")
         SELECT gen_random_uuid()::text, $1, $2, day::date, 'LEAVE', $3, 0, 0
           FROM generate_series($4::date, $5::date, '1 day') AS day
         ON CONFLICT ("employeeId", date) DO UPDATE
           SET status = 'LEAVE', "leaveRequestId" = EXCLUDED."leaveRequestId",
               "updatedAt" = now()`,
        [companyId, leave.employeeId, id, leave.startDate, leave.endDate],
      );

      return { id, status, days };
    });
  }

  async balances(companyId: string, year?: number) {
    const target = year ?? new Date().getFullYear();

    return this.db.query<Row>(
      `SELECT e.id AS "employeeId", e."employeeNo",
              TRIM(e."firstName" || ' ' || e."lastName") AS "employeeName",
              COALESCE(b.entitled, 26) AS entitled,
              COALESCE(b.used, 0) AS used,
              COALESCE(b."carriedOver", 0) AS "carriedOver",
              COALESCE(b.entitled, 26) + COALESCE(b."carriedOver",0)
                - COALESCE(b.used,0) AS remaining
         FROM "Employee" e
         LEFT JOIN "LeaveBalance" b
           ON b."employeeId" = e.id AND b.year = $2 AND b.kind = 'ANNUAL'
        WHERE e."companyId" = $1 AND e."isActive" = true
        ORDER BY e."employeeNo"`,
      [companyId, target],
    );
  }

  async setEntitlement(
    companyId: string,
    dto: { employeeId: string; year?: number; entitled: number; carriedOver?: number },
  ) {
    const year = dto.year ?? new Date().getFullYear();

    const rows = await this.db.query<Row>(
      `INSERT INTO "LeaveBalance"
         (id, "companyId", "employeeId", year, kind, entitled, "carriedOver")
       VALUES ($1,$2,$3,$4,'ANNUAL',$5,$6)
       ON CONFLICT ("employeeId", year, kind) DO UPDATE
         SET entitled = EXCLUDED.entitled,
             "carriedOver" = EXCLUDED."carriedOver",
             "updatedAt" = now()
       RETURNING *`,
      [
        randomUUID(),
        companyId,
        dto.employeeId,
        year,
        dto.entitled,
        dto.carriedOver ?? 0,
      ],
    );

    return rows[0];
  }

  async stats(companyId: string) {
    const rows = await this.db.query<Row>(
      `SELECT
         (SELECT COUNT(*) FROM "Employee"
           WHERE "companyId" = $1 AND "isActive" = true) AS "activeEmployees",
         (SELECT COUNT(*) FROM "LeaveRequest"
           WHERE "companyId" = $1 AND status = 'PENDING') AS "pendingLeaves",
         (SELECT COALESCE(SUM("overtimeHours"),0) FROM "AttendanceRecord"
           WHERE "companyId" = $1
             AND date >= date_trunc('month', now())::date) AS "monthOvertime",
         (SELECT COUNT(*) FROM "AttendanceRecord"
           WHERE "companyId" = $1 AND date = CURRENT_DATE
             AND status = 'PRESENT') AS "presentToday"`,
      [companyId],
    );

    return rows[0];
  }
}
