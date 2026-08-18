import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { type RoleName } from '@molido/database';
import { PrismaService } from '../src/modules/prisma/prisma.service';

export interface HttpResult {
  status: number;
  headers: Record<string, unknown>;
  body: Record<string, never>;
  raw: string;
}

/**
 * Issue a request through Fastify's in-process injector.
 *
 * No socket is opened, so tests are fast and cannot collide on a port — while
 * still passing through the complete middleware, guard and pipe chain.
 */
export async function request(
  app: NestFastifyApplication,
  options: {
    method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
    url: string;
    payload?: unknown;
    token?: string;
    headers?: Record<string, string>;
  },
): Promise<HttpResult> {
  const response = await app.inject({
    method: options.method,
    url: options.url,
    payload: options.payload as never,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
  });

  let body: Record<string, never> = {} as Record<string, never>;
  try {
    body = response.body ? JSON.parse(response.body) : ({} as Record<string, never>);
  } catch {
    // Non-JSON responses are surfaced through `raw`.
  }

  return { status: response.statusCode, headers: response.headers, body, raw: response.body };
}

export interface RegisteredUser {
  userId: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export async function registerUser(
  app: NestFastifyApplication,
  email: string,
  password: string,
): Promise<RegisteredUser> {
  const response = await request(app, {
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password },
  });

  if (response.status !== 201) {
    throw new Error(`registration failed: ${response.raw}`);
  }

  const body = response.body as unknown as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };

  return {
    userId: body.user.id,
    email,
    password,
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
  };
}

/** Grant a role to an existing user and return a token that reflects it. */
export async function grantRole(
  app: NestFastifyApplication,
  userId: string,
  roleName: RoleName,
): Promise<void> {
  const prisma = app.get(PrismaService);
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id },
  });
}

export async function login(
  app: NestFastifyApplication,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await request(app, {
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  if (response.status !== 200) throw new Error(`login failed: ${response.raw}`);
  return response.body as unknown as { accessToken: string; refreshToken: string };
}
