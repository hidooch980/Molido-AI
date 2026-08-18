import { PrismaClient, type Prisma } from '@prisma/client';

export type { Prisma };
export { PrismaClient };

export interface CreatePrismaClientOptions {
  databaseUrl: string;
  /** Emit query-level logs. Development only — queries can carry user data. */
  logQueries?: boolean;
}

/**
 * Build the constructor options for a Prisma client.
 *
 * Exposed separately from `createPrismaClient` so a consumer that needs to
 * *extend* `PrismaClient` — as the NestJS `PrismaService` does, to hook into
 * the module lifecycle — can pass identical options to `super()` instead of
 * duplicating them.
 *
 * The connection string is supplied by the caller rather than read from
 * `process.env` here, so configuration stays validated in one place
 * (`@molido/config`) and the database layer has no hidden dependency on the
 * environment.
 */
export function buildPrismaOptions(
  options: CreatePrismaClientOptions,
): Prisma.PrismaClientOptions {
  const { databaseUrl, logQueries = false } = options;

  return {
    datasources: { db: { url: databaseUrl } },
    log: logQueries
      ? [
          { emit: 'stdout', level: 'query' },
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' },
        ]
      : [
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' },
        ],
  };
}

/** Construct a standalone Prisma client (scripts, workers, tests). */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaClient {
  return new PrismaClient(buildPrismaOptions(options));
}
