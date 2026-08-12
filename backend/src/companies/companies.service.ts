import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TABLE_COLUMNS } from '../database/schema.generated';
import { CURRENCIES, currencyInfo, isCurrencyCode } from '../common/currency';

type Company = Record<string, unknown> & { id: string };

/**
 * Companies are the tenant root, so they are addressed by their own id rather
 * than scoped to one — which is why this service does not extend
 * BaseCrudService.
 */
@Injectable()
export class CompaniesService {
  constructor(private readonly db: DatabaseService) {}

  async findOne(id: string): Promise<Company> {
    const rows = await this.db.query<Company>('SELECT * FROM "Company" WHERE id = $1', [id]);
    if (!rows[0]) throw new NotFoundException('شرکت یافت نشد');
    return rows[0];
  }

  /** واحد پول شرکت به‌همراه نماد و قالب نمایش — رابط کاربری با این تنظیم می‌شود. */
  async currency(id: string) {
    const company = await this.findOne(id);
    const info = currencyInfo(company.currency);

    return {
      ...info,
      // شرکت می‌تواند رقم اعشار را از پیش‌فرض واحد پول جدا کند
      decimals: Number(company.currencyDecimals ?? info.decimals),
      supported: CURRENCIES.map((code) => currencyInfo(code)),
    };
  }

  async update(id: string, data: Record<string, unknown>): Promise<Company> {
    await this.findOne(id);

    const values: unknown[] = [];
    const assignments: string[] = [];
    for (const column of TABLE_COLUMNS.Company) {
      if (column === 'id' || column === 'createdAt' || column === 'updatedAt') continue;
      if (data[column] === undefined) continue;

      // قید دیتابیس هم این را می‌گیرد، ولی خطای اینجا برای کاربر گویاست.
      if (column === 'currency' && !isCurrencyCode(data.currency)) {
        throw new BadRequestException(
          `واحد پول نامعتبر است. مقادیر مجاز: ${CURRENCIES.join('، ')}`,
        );
      }

      values.push(data[column]);
      assignments.push(`"${column}" = $${values.length}`);
    }
    if (!assignments.length) return this.findOne(id);

    values.push(id);
    const rows = await this.db.query<Company>(
      `UPDATE "Company" SET ${assignments.join(', ')}, "updatedAt" = now()
       WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return rows[0];
  }
}
