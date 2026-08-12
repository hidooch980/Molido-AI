import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { DatabaseService } from './database.service';
import { TABLE_COLUMNS } from './schema.generated';

export type CrudQuery = {
  status?: string;
  search?: string;
  limit?: string | number;
  [key: string]: unknown;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * Company-scoped CRUD over a single table.  Every value reaches PostgreSQL as a
 * positional parameter; identifiers are taken from the generated column
 * whitelist, never from caller input.
 */
export abstract class BaseCrudService<T extends QueryResultRow = QueryResultRow> {
  /** Table name, matching a key of TABLE_COLUMNS. */
  protected abstract readonly table: string;
  /** Message for NotFoundException, in the module's own wording. */
  protected abstract readonly notFoundMessage: string;
  /** Column used for the default descending sort. */
  protected readonly orderColumn: string = 'createdAt';
  /** Columns matched by `query.search`, when the module supports it. */
  protected readonly searchColumns: readonly string[] = [];

  constructor(protected readonly db: DatabaseService) {}

  protected get columns(): readonly string[] {
    const columns = TABLE_COLUMNS[this.table];
    if (!columns) throw new Error(`Unknown table "${this.table}"`);
    return columns;
  }

  protected has(column: string): boolean {
    return this.columns.includes(column);
  }

  private quoted(column: string): string {
    return `"${column}"`;
  }

  private limitOf(query: CrudQuery): number {
    const requested = Number(query.limit);
    if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIMIT;
    return Math.min(Math.trunc(requested), MAX_LIMIT);
  }

  /** Extra WHERE fragments for subclasses; `next()` reserves a parameter slot. */
  protected buildFilter(
    _query: CrudQuery,
    _next: (value: unknown) => string,
  ): string[] {
    return [];
  }

  async findAll(companyId: string, query: CrudQuery = {}): Promise<T[]> {
    const values: unknown[] = [];
    const next = (value: unknown): string => `$${values.push(value)}`;

    const conditions: string[] = [];
    if (this.has('companyId')) conditions.push(`"companyId" = ${next(companyId)}`);
    if (query.status && this.has('status')) conditions.push(`status = ${next(query.status)}`);
    if (query.search && this.searchColumns.length) {
      const term = next(`%${query.search}%`);
      conditions.push(
        `(${this.searchColumns
          .filter((column) => this.has(column))
          .map((column) => `${this.quoted(column)} ILIKE ${term}`)
          .join(' OR ')})`,
      );
    }
    conditions.push(...this.buildFilter(query, next));

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const order = this.has(this.orderColumn)
      ? `ORDER BY ${this.quoted(this.orderColumn)} DESC`
      : '';

    return this.db.query<T>(
      `SELECT * FROM ${this.quoted(this.table)} ${where} ${order} LIMIT ${next(this.limitOf(query))}`,
      values,
    );
  }

  async findOne(companyId: string, id: string): Promise<T> {
    const values: unknown[] = [id];
    let where = 'id = $1';
    if (this.has('companyId')) {
      values.push(companyId);
      where += ' AND "companyId" = $2';
    }
    const rows = await this.db.query<T>(
      `SELECT * FROM ${this.quoted(this.table)} WHERE ${where} LIMIT 1`,
      values,
    );
    if (!rows[0]) throw new NotFoundException(this.notFoundMessage);
    return rows[0];
  }

  async create(companyId: string, data: Record<string, unknown>): Promise<T> {
    const payload: Record<string, unknown> = {};
    for (const column of this.columns) {
      if (column === 'id' || column === 'companyId') continue;
      if (data[column] !== undefined) payload[column] = data[column];
    }
    if (this.has('companyId')) payload.companyId = companyId;
    if (this.has('id')) payload.id = (data.id as string | undefined) ?? randomUUID();

    const names = Object.keys(payload);
    if (!names.length) throw new Error(`No writable columns supplied for "${this.table}"`);

    const rows = await this.db.query<T>(
      `INSERT INTO ${this.quoted(this.table)} (${names.map((name) => this.quoted(name)).join(', ')})
       VALUES (${names.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`,
      names.map((name) => payload[name]),
    );
    return rows[0];
  }

  async update(companyId: string, id: string, data: Record<string, unknown>): Promise<T> {
    await this.findOne(companyId, id);

    const values: unknown[] = [];
    const assignments: string[] = [];
    for (const column of this.columns) {
      if (column === 'id' || column === 'companyId' || column === 'createdAt') continue;
      if (data[column] === undefined) continue;
      values.push(data[column]);
      assignments.push(`${this.quoted(column)} = $${values.length}`);
    }
    if (!assignments.length) return this.findOne(companyId, id);
    if (this.has('updatedAt')) assignments.push('"updatedAt" = now()');

    values.push(id);
    const rows = await this.db.query<T>(
      `UPDATE ${this.quoted(this.table)} SET ${assignments.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    return rows[0];
  }

  async remove(companyId: string, id: string): Promise<T> {
    const existing = await this.findOne(companyId, id);
    await this.db.execute(`DELETE FROM ${this.quoted(this.table)} WHERE id = $1`, [id]);
    return existing;
  }

  async stats(companyId: string): Promise<{ total: number }> {
    const rows = this.has('companyId')
      ? await this.db.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ${this.quoted(this.table)} WHERE "companyId" = $1`,
          [companyId],
        )
      : await this.db.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ${this.quoted(this.table)}`,
        );
    return { total: Number(rows[0]?.count ?? 0) };
  }
}
