import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { RoleName, SystemMode } from '@molido/database';
import { AiQueueService } from '../src/modules/ai/ai-queue.service';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createTestApp, resetData, strongPassword, uniqueEmail } from './setup';
import { grantRole, login, registerUser, request } from './helpers';

let app: NestFastifyApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
  vi.spyOn(app.get(AiQueueService), 'enqueue').mockResolvedValue(undefined);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetData(prisma);
  await prisma.systemState.upsert({
    where: { id: 1 },
    update: { mode: SystemMode.NORMAL, reason: null },
    create: { id: 1, mode: SystemMode.NORMAL },
  });
});

async function tokenFor(role?: RoleName): Promise<string> {
  const email = uniqueEmail(role?.toLowerCase() ?? 'user');
  const password = strongPassword();
  const user = await registerUser(app, email, password);
  if (!role) return user.accessToken;
  await grantRole(app, user.userId, role);
  return (await login(app, email, password)).accessToken;
}

describe('GET /api/v1/founder/overview', () => {
  it('is refused to an ordinary user', async () => {
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/founder/overview',
      token: await tokenFor(),
    });
    expect(response.status).toBe(403);
  });

  it('is refused to an anonymous caller', async () => {
    const response = await request(app, { method: 'GET', url: '/api/v1/founder/overview' });
    expect(response.status).toBe(401);
  });

  it('reports real counts to the Founder', async () => {
    const token = await tokenFor(RoleName.FOUNDER);

    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/founder/overview',
      token,
    });

    expect(response.status).toBe(200);
    const body = response.body as unknown as {
      users: { total: number };
      aiTasks: { total: number };
      revenue: { amount: number };
      network: { nodes: number };
    };

    // One Founder account exists; nothing else has happened yet.
    expect(body.users.total).toBe(1);
    expect(body.aiTasks.total).toBe(0);
    // Zero is reported as zero — never dressed up, never projected.
    expect(body.revenue.amount).toBe(0);
    expect(body.network.nodes).toBe(0);
  });

  it('counts tasks that actually exist', async () => {
    const token = await tokenFor(RoleName.FOUNDER);
    await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token,
      payload: { agent: 'research', input: 'a real goal' },
    });

    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/founder/overview',
      token,
    });
    expect((response.body as unknown as { aiTasks: { total: number; pending: number } }).aiTasks)
      .toMatchObject({ total: 1, pending: 1 });
  });

  it('reports dependency health honestly', async () => {
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/founder/overview',
      token: await tokenFor(RoleName.FOUNDER),
    });
    const health = (response.body as unknown as { health: Record<string, string> }).health;

    expect(health['database']).toBe('ok');
    // With no provider configured the answer is "not_configured", not "ok".
    expect(['configured', 'not_configured', 'down']).toContain(health['ai']);
  });
});

describe('GET /api/v1/founder/security', () => {
  it('is refused without SECURITY_READ', async () => {
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/founder/security',
      token: await tokenFor(),
    });
    expect(response.status).toBe(403);
  });

  it('masks source addresses and omits raw metadata', async () => {
    // Generate a failure to record.
    await request(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: uniqueEmail(), password: strongPassword() },
    });

    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/founder/security?limit=10',
      token: await tokenFor(RoleName.FOUNDER),
    });

    const feed = response.body as unknown as {
      recent: { ipAddress: string | null }[];
      bySeverity: Record<string, number>;
    };

    expect(feed.recent.length).toBeGreaterThan(0);
    for (const event of feed.recent) {
      // Enough to spot a pattern, not enough to identify a person.
      if (event.ipAddress) expect(event.ipAddress).toMatch(/x$|::x$/);
    }
    // The full record stays in the database for an investigation that warrants it.
    expect(response.raw).not.toContain('"metadata"');
    expect(Object.keys(feed.bySeverity).length).toBeGreaterThan(0);
  });

  it('bounds the page size a caller can request', async () => {
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/founder/security?limit=5000',
      token: await tokenFor(RoleName.FOUNDER),
    });
    expect(response.status).toBe(400);
  });
});

describe('system mode control', () => {
  it('is refused to an ordinary user, and changes nothing', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/founder/pause',
      token: await tokenFor(),
      payload: { reason: 'malicious' },
    });

    expect(response.status).toBe(403);
    const state = await prisma.systemState.findUniqueOrThrow({ where: { id: 1 } });
    expect(state.mode).toBe(SystemMode.NORMAL);
  });

  it('is refused to an admin without SYSTEM_MANAGE', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/founder/pause',
      token: await tokenFor(RoleName.ADMIN),
      payload: {},
    });
    expect(response.status).toBe(403);
  });

  it('lets the Founder pause and resume, recording the reason', async () => {
    const token = await tokenFor(RoleName.FOUNDER);

    const paused = await request(app, {
      method: 'POST',
      url: '/api/v1/founder/pause',
      token,
      payload: { reason: 'Investigating unusual activity' },
    });
    expect(paused.body).toMatchObject({
      mode: 'PAUSED',
      reason: 'Investigating unusual activity',
    });

    const resumed = await request(app, { method: 'POST', url: '/api/v1/founder/resume', token });
    // The reason is cleared on resume rather than left to mislead.
    expect(resumed.body).toMatchObject({ mode: 'NORMAL', reason: null });
  });

  it('survives as a persisted decision, not process state', async () => {
    const token = await tokenFor(RoleName.FOUNDER);
    await request(app, {
      method: 'POST',
      url: '/api/v1/founder/pause',
      token,
      payload: { reason: 'incident' },
    });

    // Read straight from the database: any instance of the API sees the same.
    const state = await prisma.systemState.findUniqueOrThrow({ where: { id: 1 } });
    expect(state.mode).toBe(SystemMode.PAUSED);
    expect(state.changedBy).not.toBeNull();
  });
});

describe('GET /api/v1/founder/tasks', () => {
  it('shows every user\'s tasks to the Founder', async () => {
    const userToken = await tokenFor();
    await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: userToken,
      payload: { agent: 'research', input: 'someone else\'s goal' },
    });

    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/founder/tasks',
      token: await tokenFor(RoleName.FOUNDER),
    });

    expect(response.body['total']).toBe(1);
  });

  it('is refused without AI_TASK_MANAGE', async () => {
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/founder/tasks',
      token: await tokenFor(),
    });
    expect(response.status).toBe(403);
  });
});
