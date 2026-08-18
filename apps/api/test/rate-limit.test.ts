import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SecurityEventType } from '@molido/database';
import { getStorageToken, type ThrottlerStorage } from '@nestjs/throttler';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createTestApp, resetData, strongPassword, uniqueEmail } from './setup';
import { request } from './helpers';

/**
 * Rate limiting gets its own app instance with deliberately tiny ceilings.
 *
 * The other suites raise the limits so they can exercise many flows; this one
 * lowers them so the limiter is actually reached. Both read the same
 * configuration path, so what is verified here is the shipping mechanism, not a
 * test-only one.
 */
let app: NestFastifyApplication;
let prisma: PrismaService;
let throttlerStorage: ThrottlerStorage & { storage?: Map<string, unknown> };

const AUTH_LIMIT = 3;

beforeAll(async () => {
  process.env['AUTH_RATE_LIMIT_LIMIT'] = String(AUTH_LIMIT);
  process.env['AUTH_RATE_LIMIT_TTL_SECONDS'] = '60';
  process.env['RATE_LIMIT_LIMIT'] = '5';
  process.env['RATE_LIMIT_TTL_SECONDS'] = '60';

  app = await createTestApp();
  prisma = app.get(PrismaService);
  throttlerStorage = app.get(getStorageToken());
});

afterAll(async () => {
  await app.close();
  // Restore the permissive values the rest of the suite expects.
  process.env['AUTH_RATE_LIMIT_LIMIT'] = '100000';
  process.env['RATE_LIMIT_LIMIT'] = '100000';
});

beforeEach(async () => {
  await resetData(prisma);
  // The limiter counts in memory, keyed by client address — and every injected
  // request shares one. Without clearing it, each test would start already
  // throttled by the previous one.
  throttlerStorage.storage?.clear();
});

describe('authentication rate limiting', () => {
  it('blocks a credential-guessing burst once the limit is reached', async () => {
    const email = uniqueEmail();
    const statuses: number[] = [];

    for (let attempt = 0; attempt < AUTH_LIMIT + 2; attempt += 1) {
      const response = await request(app, {
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: strongPassword() },
      });
      statuses.push(response.status);
    }

    expect(statuses.slice(0, AUTH_LIMIT).every((status) => status === 401)).toBe(true);
    expect(statuses.slice(AUTH_LIMIT).every((status) => status === 429)).toBe(true);
  });

  it('records every trip as a security event, so an attack is visible afterwards', async () => {
    for (let attempt = 0; attempt < AUTH_LIMIT + 1; attempt += 1) {
      await request(app, {
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: uniqueEmail(), password: strongPassword() },
      });
    }

    const events = await prisma.securityEvent.findMany({
      where: { type: SecurityEventType.RATE_LIMIT_TRIGGERED },
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(events[0]!.metadata)).toContain('/api/v1/auth/login');
  });

  it('advertises the limit in response headers', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: uniqueEmail(), password: strongPassword() },
    });
    expect(response.headers['x-ratelimit-limit-auth']).toBe(String(AUTH_LIMIT));
  });

  it('applies the stricter ceiling to registration as well as login', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < AUTH_LIMIT + 2; attempt += 1) {
      const response = await request(app, {
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: uniqueEmail(), password: strongPassword() },
      });
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
  });

  it('does not apply the auth ceiling to ordinary routes', async () => {
    // The health probe must survive a burst that would exhaust the auth limit.
    for (let attempt = 0; attempt < AUTH_LIMIT + 1; attempt += 1) {
      const response = await request(app, { method: 'GET', url: '/api/v1/health' });
      expect(response.status).toBe(200);
    }
  });
});
