import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';

import { databaseConfig } from './connection';
import { currentTenant } from './tenant-context';

/**
 * PostgreSQL access layer.  All callers must use positional parameters ($1,
 * $2, ...) instead of interpolating values into SQL strings.
 *
 * هر اتصال پیش از اجرای پرس‌وجو، شناسهٔ شرکتِ درخواست جاری را روی متغیر
 * `app.company_id` می‌گذارد تا سیاست‌های RLS در دیتابیس بتوانند آن را
 * بخوانند.  ببینید: `tenant-context.ts` و مهاجرت ۰۱۳.
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly pool = new Pool(databaseConfig());

  async onModuleInit(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  /**
   * زمینهٔ شرکت را روی اتصال می‌نشاند.
   *
   * `set_config(..., false)` یعنی در سطح نشست، نه تراکنش — چون `query()`
   * لزوماً داخل تراکنش نیست.  اتصال‌ها در استخر بازیافت می‌شوند، پس مقدار
   * قبل از **هر** استفاده دوباره نوشته می‌شود؛ هرگز به مقدار به‌جامانده
   * تکیه نمی‌کنیم.
   *
   * کار سیستمی رشتهٔ تهی می‌گذارد؛ سیاست RLS این حالت را برای نقش صاحب
   * جدول باز می‌گذارد و برای نقش برنامه می‌بندد.
   */
  private async applyTenant(client: PoolClient): Promise<void> {
    const tenant = currentTenant();
    const companyId = tenant?.system ? '' : (tenant?.companyId ?? '');

    await client.query('SELECT set_config($1, $2, false)', [
      'app.company_id',
      companyId,
    ]);

    // ⚠️ همیشه نوشته می‌شود، حتی وقتی تهی است.
    //
    //    اتصال‌ها در استخر بازیافت می‌شوند؛ اگر فقط در حالتِ پرشده
    //    نوشته شود، درخواستِ بعدی روی همان اتصال کدِ رهگیریِ نفرِ قبل
    //    را به ارث می‌برد — یعنی سطری می‌بیند که نباید.
    await client.query('SELECT set_config($1, $2, false)', [
      'app.track_code',
      tenant?.trackCode ?? '',
    ]);
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    values: readonly unknown[] = [],
  ): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      await this.applyTenant(client);
      const result = await client.query<T>(sql, [...values]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  async execute(sql: string, values: readonly unknown[] = []): Promise<number> {
    const client = await this.pool.connect();
    try {
      await this.applyTenant(client);
      const result = await client.query(sql, [...values]);
      return result.rowCount ?? 0;
    } finally {
      client.release();
    }
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      // زمینه پیش از BEGIN نوشته می‌شود تا اگر تراکنش برگردد، مقدار روی
      // اتصال بماند و اتصالِ بازیافتی بدون زمینه نماند.
      await this.applyTenant(client);
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
