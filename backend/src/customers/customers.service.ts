import { Injectable } from '@nestjs/common';
import { BaseCrudService } from '../database/base-crud.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CustomersService extends BaseCrudService {
  protected readonly table = 'Customer';
  protected readonly notFoundMessage = 'مشتری یافت نشد';
  protected readonly searchColumns = ['firstName', 'lastName', 'phone', 'email', 'nationalCode'];

  constructor(db: DatabaseService) {
    super(db);
  }

  /**
   * مانده بدهی مشتری — جمع فاکتورهای تسویه‌نشده.
   *
   * فروشنده باید **پیش از** ثبت فروش نسیه بداند این مشتری از قبل چقدر
   * بدهکار است.  بعد از ثبت فاکتور دیگر دیر است: کالا رفته و طرف حساب
   * بدهکارتر شده.
   *
   * مبلغ از خودِ فاکتورها حساب می‌شود، نه از ستونی که جایی نگه داشته
   * شود: ستونِ مانده با هر مسیرِ فراموش‌شده‌ای (مرجوعی، ابطال، تسویهٔ
   * دستی) از واقعیت جدا می‌افتد و کسی هم متوجه نمی‌شود.
   */
  async balance(companyId: string, customerId: string) {
    const rows = await this.db.query<{
      unpaid: string;
      invoiceCount: string;
      overdue: string;
      oldestDue: string | null;
    }>(
      `SELECT
         COALESCE(SUM(s.total - COALESCE(p.paid, 0)), 0)::text AS unpaid,
         COUNT(*)::text AS "invoiceCount",
         COALESCE(SUM(
           CASE WHEN s."dueDate" IS NOT NULL AND s."dueDate" < CURRENT_DATE
                THEN s.total - COALESCE(p.paid, 0) ELSE 0 END
         ), 0)::text AS overdue,
         MIN(s."dueDate")::text AS "oldestDue"
       FROM "Sale" s
       LEFT JOIN LATERAL (
         SELECT SUM(amount) AS paid FROM "Payment"
          WHERE "saleId" = s.id AND status = 'COMPLETED'
       ) p ON true
       WHERE s."companyId" = $1
         AND s."customerId" = $2
         AND s.status IN ('PENDING', 'PARTIAL')`,
      [companyId, customerId],
    );

    const row = rows[0];
    return {
      customerId,
      unpaid: Number(row?.unpaid ?? 0),
      invoiceCount: Number(row?.invoiceCount ?? 0),
      overdue: Number(row?.overdue ?? 0),
      oldestDue: row?.oldestDue ?? null,
    };
  }
}
