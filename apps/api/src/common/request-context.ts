import type { FastifyRequest } from 'fastify';
import type { Permission, RoleName } from '@molido/types';

/** The authenticated principal, attached to the request by `JwtAuthGuard`. */
export interface AuthenticatedActor {
  userId: string;
  sessionId: string;
  email: string;
  roles: RoleName[];
  permissions: Permission[];
}

/**
 * Fastify request augmented with what MOLIDO attaches during a request.
 *
 * `actor` is set only by the authentication guard. Nothing else in the codebase
 * may write it — that is what makes "is this request authenticated?" a single,
 * checkable question.
 */
export interface MolidoRequest extends FastifyRequest {
  requestId: string;
  actor?: AuthenticatedActor;
}

/**
 * Best-effort client address.
 *
 * `X-Forwarded-For` is only consulted when Fastify's `trustProxy` is on, which
 * the bootstrap enables only behind a known proxy. Otherwise the header is
 * attacker-controlled and would poison rate limiting and security events.
 */
export function clientIp(request: FastifyRequest): string | undefined {
  return request.ip || undefined;
}

/** Truncated user agent — long enough to be useful, bounded to fit the column. */
export function clientUserAgent(request: FastifyRequest): string | undefined {
  const raw = request.headers['user-agent'];
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  return raw.slice(0, 512);
}
