import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { RoleName, SecurityEventType } from '@molido/database';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createTestApp, resetData, strongPassword, uniqueEmail } from './setup';
import { grantRole, login, registerUser, request } from './helpers';

let app: NestFastifyApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetData(prisma);
});

/** Register a user, grant a role, and return a token that carries it. */
async function userWithRole(role: RoleName): Promise<{ token: string; userId: string }> {
  const email = uniqueEmail(role.toLowerCase());
  const password = strongPassword();
  const user = await registerUser(app, email, password);
  await grantRole(app, user.userId, role);
  // Permissions are embedded in the access token, so a fresh login is needed
  // for the new grant to take effect.
  const session = await login(app, email, password);
  return { token: session.accessToken, userId: user.userId };
}

describe('RBAC enforcement', () => {
  it('grants a standard user only the USER permission set', async () => {
    const user = await registerUser(app, uniqueEmail(), strongPassword());
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      token: user.accessToken,
    });

    expect(response.body['permissions']).toEqual([
      'USER_READ',
      'SESSION_READ',
      'AI_TASK_CREATE',
      'AI_TASK_READ',
      'AI_TASK_CANCEL',
    ]);
  });

  it('denies a standard user an endpoint requiring AGENT_READ', async () => {
    const user = await registerUser(app, uniqueEmail(), strongPassword());
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/ai/agents',
      token: user.accessToken,
    });

    expect(response.status).toBe(403);
    // The denial must not enumerate what permission was missing.
    expect(response.raw).not.toContain('AGENT_READ');
  });

  it('allows an admin the same endpoint', async () => {
    const admin = await userWithRole(RoleName.ADMIN);
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/ai/agents',
      token: admin.token,
    });
    expect(response.status).toBe(200);
  });

  it('allows the founder everything an admin can do', async () => {
    const founder = await userWithRole(RoleName.FOUNDER);
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/ai/agents',
      token: founder.token,
    });
    expect(response.status).toBe(200);
  });

  it('records an authorisation failure as a security event', async () => {
    const user = await registerUser(app, uniqueEmail(), strongPassword());
    await request(app, { method: 'GET', url: '/api/v1/ai/agents', token: user.accessToken });

    const events = await prisma.securityEvent.findMany({
      where: { type: SecurityEventType.AUTHORIZATION_FAILURE },
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.userId).toBe(user.userId);
    expect(JSON.stringify(events[0]!.metadata)).toContain('AGENT_READ');
  });

  it('ignores a role claim the client made up, trusting only the signed token', async () => {
    const user = await registerUser(app, uniqueEmail(), strongPassword());
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/ai/agents',
      token: user.accessToken,
      headers: { 'x-roles': 'FOUNDER', 'x-permissions': 'AGENT_READ' },
    });
    expect(response.status).toBe(403);
  });

  it('denies an anonymous caller before any permission check runs', async () => {
    const response = await request(app, { method: 'GET', url: '/api/v1/ai/agents' });
    expect(response.status).toBe(401);
  });

  it('revokes access the moment a role is removed and the session refreshed', async () => {
    const email = uniqueEmail();
    const password = strongPassword();
    const user = await registerUser(app, email, password);
    await grantRole(app, user.userId, RoleName.ADMIN);
    const elevated = await login(app, email, password);

    expect(
      (await request(app, { method: 'GET', url: '/api/v1/ai/agents', token: elevated.accessToken }))
        .status,
    ).toBe(200);

    await prisma.userRole.deleteMany({
      where: { userId: user.userId, role: { name: RoleName.ADMIN } },
    });
    const downgraded = await login(app, email, password);

    expect(
      (
        await request(app, {
          method: 'GET',
          url: '/api/v1/ai/agents',
          token: downgraded.accessToken,
        })
      ).status,
    ).toBe(403);
  });
});

describe('security headers', () => {
  it('sets the headers that matter on every response', async () => {
    const response = await request(app, { method: 'GET', url: '/api/v1/health' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(String(response.headers['content-security-policy'])).toContain("default-src 'none'");
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('attaches a correlation id even to a rejected request', async () => {
    const response = await request(app, { method: 'GET', url: '/api/v1/auth/me' });

    expect(response.status).toBe(401);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body['requestId']).toBe(response.headers['x-request-id']);
  });
});

describe('error handling', () => {
  it('never returns a stack trace or internal detail', async () => {
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/auth/sessions/not-a-uuid',
      token: (await registerUser(app, uniqueEmail(), strongPassword())).accessToken,
    });

    expect(response.raw).not.toContain('at Object.');
    expect(response.raw).not.toContain('node_modules');
    expect(response.raw).not.toContain('/home/');
  });

  it('never leaks the database connection string on a bad request', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'not-an-email', password: 'x' },
    });

    expect(response.status).toBe(400);
    expect(response.raw).not.toContain('postgresql://');
    expect(response.raw).not.toContain('molido_dev_password');
  });

  it('rejects a body larger than the configured limit', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: uniqueEmail(), password: 'x'.repeat(300 * 1024) },
    });

    // 413 from Fastify's body limit, or 400 if validation catches it first —
    // either way the oversized payload never reaches a handler.
    expect([400, 413]).toContain(response.status);
  });
});
