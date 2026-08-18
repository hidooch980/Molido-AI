import type { PrismaClient } from '@prisma/client';

export interface DatabaseHealth {
  status: 'ok' | 'down';
  latencyMs: number;
  detail?: string;
}

/**
 * Liveness probe for PostgreSQL.
 *
 * `SELECT 1` rather than a table read: the probe must report on the connection,
 * not on whether a migration has been applied. It never surfaces the driver's
 * error text, which can contain the connection string.
 */
export async function checkDatabaseHealth(
  prisma: PrismaClient,
  timeoutMs = 2000,
): Promise<DatabaseHealth> {
  const startedAt = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('probe timed out')), timeoutMs).unref?.(),
      ),
    ]);
    return { status: 'ok', latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: 'down',
      latencyMs: Date.now() - startedAt,
      detail: error instanceof Error && error.message === 'probe timed out'
        ? 'probe timed out'
        : 'connection failed',
    };
  }
}
