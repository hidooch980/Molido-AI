import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPlatformStatus } from './api';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubHealth(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body })),
  );
}

const HEALTHY = {
  status: 'ok',
  service: 'molido-api',
  version: '0.1.0',
  environment: 'development',
  uptimeSeconds: 10,
  timestamp: new Date().toISOString(),
  components: {
    database: { status: 'ok', latencyMs: 3 },
    redis: { status: 'ok', latencyMs: 1 },
    ai: { status: 'disabled', detail: 'no AI provider configured' },
  },
};

describe('fetchPlatformStatus', () => {
  it('maps a healthy response to per-component status', async () => {
    stubHealth(HEALTHY);
    const status = await fetchPlatformStatus();

    expect(status).toMatchObject({
      api: 'ok',
      database: 'ok',
      redis: 'ok',
      // Reported as disabled, never silently upgraded to "ok".
      ai: 'disabled',
    });
    expect(status.unreachable).toBeUndefined();
  });

  it('reports degraded when a non-critical dependency is down', async () => {
    stubHealth({
      ...HEALTHY,
      status: 'degraded',
      components: { ...HEALTHY.components, redis: { status: 'down' } },
    });

    const status = await fetchPlatformStatus();
    expect(status.api).toBe('degraded');
    expect(status.redis).toBe('down');
  });

  it('reports the API unreachable instead of throwing when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const status = await fetchPlatformStatus();
    expect(status.unreachable).toBe(true);
    expect(status.api).toBe('down');
    // Never claims a dependency is healthy when it could not be checked.
    expect(status.database).toBe('unknown');
    expect(status.redis).toBe('unknown');
    expect(status.ai).toBe('unknown');
  });

  it('treats a non-200 response as unreachable rather than parsing it', async () => {
    stubHealth({}, false);
    const status = await fetchPlatformStatus();
    expect(status.unreachable).toBe(true);
    expect(status.api).toBe('down');
  });

  it('never caches a health probe, and always bounds it with a timeout', async () => {
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push([url, init]);
        return { ok: true, status: 200, json: async () => HEALTHY };
      }),
    );

    await fetchPlatformStatus();

    const [url, init] = calls[0]!;
    expect(url).toContain('/health/detailed');
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('stamps every result with a check time', async () => {
    stubHealth(HEALTHY);
    const status = await fetchPlatformStatus();
    expect(Number.isNaN(Date.parse(status.checkedAt))).toBe(false);
  });
});
