import type { DetailedHealthResponse } from '@molido/types';
import { API_V1 } from './config';

export type SystemStatus = 'ok' | 'degraded' | 'down' | 'disabled' | 'unknown';

export interface PlatformStatus {
  api: SystemStatus;
  database: SystemStatus;
  redis: SystemStatus;
  ai: SystemStatus;
  checkedAt: string;
  /** Present when the API could not be reached at all. */
  unreachable?: boolean;
}

const PROBE_TIMEOUT_MS = 4000;

/**
 * Read platform health.
 *
 * On failure this reports `unknown`/`down` rather than throwing. A status page
 * that goes blank when the thing it monitors is unwell has failed at its one
 * job — and it must never guess a green light it cannot verify.
 */
export async function fetchPlatformStatus(): Promise<PlatformStatus> {
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(`${API_V1}/health/detailed`, {
      // Health is a live fact, never a cached one.
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { api: 'down', database: 'unknown', redis: 'unknown', ai: 'unknown', checkedAt, unreachable: true };
    }

    const health = (await response.json()) as DetailedHealthResponse;

    return {
      api: health.status === 'ok' ? 'ok' : health.status,
      database: health.components.database.status,
      redis: health.components.redis.status,
      ai: health.components.ai.status,
      checkedAt,
    };
  } catch {
    return {
      api: 'down',
      database: 'unknown',
      redis: 'unknown',
      ai: 'unknown',
      checkedAt,
      unreachable: true,
    };
  }
}
