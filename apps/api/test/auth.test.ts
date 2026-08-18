import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SecurityEventType, SessionRevokeReason } from '@molido/database';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { createTestApp, resetData, strongPassword, uniqueEmail } from './setup';
import { login, registerUser, request } from './helpers';

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

describe('POST /api/v1/auth/register', () => {
  it('creates an account and returns a session', async () => {
    const email = uniqueEmail();
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: strongPassword() },
    });

    expect(response.status).toBe(201);
    const body = response.body as unknown as { user: { roles: string[] }; accessToken: string };
    expect(body.accessToken).toBeTruthy();
    // A new account gets exactly USER — never anything more.
    expect(body.user.roles).toEqual(['USER']);
  });

  it('never returns the password or its hash', async () => {
    const password = strongPassword();
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: uniqueEmail(), password },
    });

    expect(response.raw).not.toContain(password);
    expect(response.raw).not.toContain('passwordHash');
    expect(response.raw).not.toContain('scrypt$');
  });

  it('stores the password only as a scrypt hash', async () => {
    const password = strongPassword();
    const email = uniqueEmail();
    await registerUser(app, email, password);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toMatch(/^scrypt\$N=\d+,r=\d+,p=\d+\$/);
    expect(user.passwordHash).not.toContain(password);
  });

  it('rejects a password that fails the policy', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: uniqueEmail(), password: 'short' },
    });
    expect(response.status).toBe(400);
  });

  it('refuses to confirm that an email is already registered', async () => {
    const email = uniqueEmail();
    await registerUser(app, email, strongPassword());

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: strongPassword() },
    });

    // The duplicate is rejected, but the message must not confirm the address
    // exists — that would be an enumeration oracle on the signup form.
    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toMatch(/already (registered|exists|taken)/i);
  });

  it('rejects unknown properties instead of silently ignoring them', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: uniqueEmail(),
        password: strongPassword(),
        status: 'ACTIVE',
        roles: ['FOUNDER'],
        passwordHash: 'injected',
      },
    });

    expect(response.status).toBe(400);
    const messages = JSON.stringify(response.body);
    expect(messages).toContain('roles should not exist');
    expect(messages).toContain('passwordHash should not exist');
  });

  it('does not let a crafted payload escalate to FOUNDER', async () => {
    const email = uniqueEmail();
    await request(app, {
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: strongPassword(), roles: ['FOUNDER'] },
    });

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).toBeNull();
  });

  it('records a security event and an audit entry', async () => {
    await registerUser(app, uniqueEmail(), strongPassword());

    const [events, audits] = await Promise.all([
      prisma.securityEvent.findMany({ where: { type: SecurityEventType.REGISTER_SUCCESS } }),
      prisma.auditLog.findMany({ where: { action: 'auth.register' } }),
    ]);

    expect(events).toHaveLength(1);
    expect(audits).toHaveLength(1);
    expect(audits[0]!.outcome).toBe('SUCCESS');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns tokens for correct credentials', async () => {
    const email = uniqueEmail();
    const password = strongPassword();
    await registerUser(app, email, password);

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });

    expect(response.status).toBe(200);
    const body = response.body as unknown as { accessToken: string; refreshToken: string };
    expect(body.accessToken.split('.')).toHaveLength(3);
    expect(body.refreshToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it('treats a wrong password and an unknown account identically', async () => {
    const email = uniqueEmail();
    await registerUser(app, email, strongPassword());

    const wrongPassword = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: strongPassword() },
    });
    const unknownAccount = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: uniqueEmail(), password: strongPassword() },
    });

    expect(wrongPassword.status).toBe(unknownAccount.status);
    expect(wrongPassword.body['message']).toEqual(unknownAccount.body['message']);
  });

  it('is case-insensitive on the email so one address cannot become two accounts', async () => {
    const email = uniqueEmail();
    const password = strongPassword();
    await registerUser(app, email, password);

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: email.toUpperCase(), password },
    });
    expect(response.status).toBe(200);
  });

  it('records a failure event without storing the password', async () => {
    const email = uniqueEmail();
    const password = strongPassword();
    await registerUser(app, email, password);

    await request(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'definitely-the-wrong-one' },
    });

    const events = await prisma.securityEvent.findMany({
      where: { type: SecurityEventType.LOGIN_FAILURE },
    });
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0]!.metadata)).not.toContain('definitely-the-wrong-one');
  });

  it('locks the account after too many failures and kills live sessions', async () => {
    const email = uniqueEmail();
    const password = strongPassword();
    const user = await registerUser(app, email, password);

    // MAX_FAILED_LOGINS defaults to 10.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app, {
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: `wrong-attempt-${attempt}` },
      });
    }

    const locked = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(locked.lockedUntil).not.toBeNull();
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // The correct password must not work while the lock stands.
    const afterLock = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(afterLock.status).toBe(401);

    // And the session issued at registration is revoked, because a lockout
    // means the account may already be compromised.
    const active = await prisma.session.count({ where: { userId: user.userId, revokedAt: null } });
    expect(active).toBe(0);

    const lockEvents = await prisma.securityEvent.findMany({
      where: { type: SecurityEventType.ACCOUNT_LOCKED },
    });
    expect(lockEvents).toHaveLength(1);
  });

  it('refuses a suspended account even with the correct password', async () => {
    const email = uniqueEmail();
    const password = strongPassword();
    await registerUser(app, email, password);
    await prisma.user.update({ where: { email }, data: { status: 'SUSPENDED' } });

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(response.status).toBe(403);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the token, invalidating the one presented', async () => {
    const user = await registerUser(app, uniqueEmail(), strongPassword());

    const rotated = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });

    expect(rotated.status).toBe(200);
    const body = rotated.body as unknown as { refreshToken: string };
    expect(body.refreshToken).not.toBe(user.refreshToken);
  });

  it('never stores a refresh token in plaintext', async () => {
    const user = await registerUser(app, uniqueEmail(), strongPassword());

    const sessions = await prisma.session.findMany();
    for (const session of sessions) {
      expect(session.refreshTokenHash).not.toContain(user.refreshToken);
      // SHA-256 hex.
      expect(session.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('detects reuse of a rotated token and revokes the whole family', async () => {
    const user = await registerUser(app, uniqueEmail(), strongPassword());

    const first = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });
    const rotatedToken = (first.body as unknown as { refreshToken: string }).refreshToken;

    // Replay the token that was already exchanged. Only theft or a clone
    // explains this.
    const replay = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });
    expect(replay.status).toBe(401);

    // The legitimate successor must die too — the family is compromised.
    const successor = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: rotatedToken },
    });
    expect(successor.status).toBe(401);

    const active = await prisma.session.count({ where: { userId: user.userId, revokedAt: null } });
    expect(active).toBe(0);

    const reuse = await prisma.securityEvent.findMany({
      where: { type: SecurityEventType.TOKEN_REUSE_DETECTED },
    });
    expect(reuse).toHaveLength(1);
    expect(reuse[0]!.severity).toBe('CRITICAL');
  });

  it('does not reveal why a refresh failed', async () => {
    const unknown = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'a'.repeat(43) },
    });

    const user = await registerUser(app, uniqueEmail(), strongPassword());
    await request(app, {
      method: 'POST',
      url: '/api/v1/auth/logout',
      token: user.accessToken,
      payload: { refreshToken: user.refreshToken },
    });
    const revoked = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });

    expect(unknown.status).toBe(401);
    expect(revoked.status).toBe(401);
    expect(unknown.body['message']).toEqual(revoked.body['message']);
  });

  it('refuses to refresh a session whose account was suspended', async () => {
    const email = uniqueEmail();
    const user = await registerUser(app, email, strongPassword());
    await prisma.user.update({ where: { email }, data: { status: 'SUSPENDED' } });

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken },
    });
    expect(response.status).toBe(401);
  });
});

describe('logout', () => {
  it('revokes the current session', async () => {
    const user = await registerUser(app, uniqueEmail(), strongPassword());

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/logout',
      token: user.accessToken,
      payload: { refreshToken: user.refreshToken },
    });
    expect(response.status).toBe(200);

    // The access token must stop working immediately, not when it expires.
    const afterLogout = await request(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      token: user.accessToken,
    });
    expect(afterLogout.status).toBe(401);
  });

  it('revokes every session on logout-all', async () => {
    const email = uniqueEmail();
    const password = strongPassword();
    const user = await registerUser(app, email, password);
    await login(app, email, password);
    await login(app, email, password);

    expect(await prisma.session.count({ where: { userId: user.userId, revokedAt: null } })).toBe(3);

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      token: user.accessToken,
    });

    expect(response.status).toBe(200);
    expect(response.body['revoked']).toBe(3);
    expect(await prisma.session.count({ where: { userId: user.userId, revokedAt: null } })).toBe(0);
  });

  it('records the reason a session was revoked', async () => {
    const user = await registerUser(app, uniqueEmail(), strongPassword());
    await request(app, {
      method: 'POST',
      url: '/api/v1/auth/logout',
      token: user.accessToken,
      payload: { refreshToken: user.refreshToken },
    });

    const session = await prisma.session.findFirstOrThrow({ where: { userId: user.userId } });
    expect(session.revokedReason).toBe(SessionRevokeReason.LOGOUT);
  });
});

describe('sessions', () => {
  it('lists active sessions and marks the current one', async () => {
    const email = uniqueEmail();
    const password = strongPassword();
    const user = await registerUser(app, email, password);
    await login(app, email, password);

    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/auth/sessions',
      token: user.accessToken,
    });

    expect(response.status).toBe(200);
    const sessions = response.body as unknown as { current: boolean }[];
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.current)).toHaveLength(1);
  });

  it('never exposes a refresh token hash in the session list', async () => {
    const user = await registerUser(app, uniqueEmail(), strongPassword());
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/auth/sessions',
      token: user.accessToken,
    });
    expect(response.raw).not.toContain('refreshTokenHash');
    expect(response.raw).not.toContain('familyId');
  });

  it("cannot revoke another user's session", async () => {
    const victim = await registerUser(app, uniqueEmail('victim'), strongPassword());
    const attacker = await registerUser(app, uniqueEmail('attacker'), strongPassword());
    const victimSession = await prisma.session.findFirstOrThrow({
      where: { userId: victim.userId },
    });

    const response = await request(app, {
      method: 'DELETE',
      url: `/api/v1/auth/sessions/${victimSession.id}`,
      token: attacker.accessToken,
    });

    expect(response.body['revoked']).toBe(false);
    const stillActive = await prisma.session.findUniqueOrThrow({ where: { id: victimSession.id } });
    expect(stillActive.revokedAt).toBeNull();
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns the account without any credential material', async () => {
    const user = await registerUser(app, uniqueEmail(), strongPassword());
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
      token: user.accessToken,
    });

    expect(response.status).toBe(200);
    expect(response.raw).not.toContain('passwordHash');
    expect(response.raw).not.toContain(user.password);
    expect(response.body['id']).toBe(user.userId);
  });

  it('rejects a missing, malformed or tampered token', async () => {
    const user = await registerUser(app, uniqueEmail(), strongPassword());
    const [, payload, signature] = user.accessToken.split('.');
    const tampered = `eyJhbGciOiJub25lIn0.${payload}.${signature}`;

    for (const token of [undefined, 'not-a-token', tampered]) {
      const response = await request(app, { method: 'GET', url: '/api/v1/auth/me', token });
      expect(response.status).toBe(401);
    }
  });
});
