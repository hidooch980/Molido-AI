/**
 * Small helpers for hand-written SQL in services that do more than plain CRUD.
 * Column names always come from a literal whitelist in the calling service;
 * values always travel as positional parameters.
 */

/** Collects positional parameters while a query is assembled. */
export class Params {
  readonly values: unknown[] = [];

  /** Appends a value and returns its placeholder, e.g. `$3`. */
  next(value: unknown): string {
    return `$${this.values.push(value)}`;
  }
}

/**
 * Builds a `SET` clause from the supplied columns, skipping undefined values.
 * Returns null when the payload has nothing to write.
 */
export function setClause(
  columns: readonly string[],
  data: object,
  params: Params,
): string | null {
  const values = data as Record<string, unknown>;
  const assignments = columns
    .filter((column) => values[column] !== undefined)
    .map((column) => `"${column}" = ${params.next(values[column])}`);
  return assignments.length ? assignments.join(', ') : null;
}

/** Builds the column list, placeholder list and values for an INSERT. */
export function insertClause(
  columns: readonly string[],
  data: Record<string, unknown>,
): { columns: string; placeholders: string; values: unknown[] } {
  const present = columns.filter((column) => data[column] !== undefined);
  return {
    columns: present.map((column) => `"${column}"`).join(', '),
    placeholders: present.map((_, index) => `$${index + 1}`).join(', '),
    values: present.map((column) => data[column]),
  };
}
