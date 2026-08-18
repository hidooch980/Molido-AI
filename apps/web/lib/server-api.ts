import 'server-only';
import type { ApiErrorResponse } from '@molido/types';
import { API_V1 } from './config';
import { readTokens, writeTokens, type SessionTokens } from './session';

/**
 * Server-side API client.
 *
 * Every browser request goes through the Next server, which attaches the
 * access token from an httpOnly cookie. The browser never holds a credential,
 * so there is nothing for injected script to steal.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Raised when no valid session remains and the caller must sign in again. */
export class SessionExpiredError extends ApiError {
  constructor() {
    super(401, 'Session expired');
    this.name = 'SessionExpiredError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE' | 'PATCH';
  body?: unknown;
  /** Internal: prevents a refresh loop. */
  retrying?: boolean;
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ApiErrorResponse;
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    return new ApiError(response.status, message || 'Request failed', body.requestId);
  } catch {
    return new ApiError(response.status, 'Request failed');
  }
}

/**
 * Access token obtained by an in-render refresh.
 *
 * Held for the remainder of the request because the cookie write may not have
 * been possible; without this the retry would resend the expired token.
 */
let refreshedAccessToken: string | undefined;

/** Exchange the refresh token for a new pair. Returns false if it is spent. */
async function refreshSession(): Promise<boolean> {
  const { refreshToken } = await readTokens();
  if (!refreshToken) return false;

  const response = await fetch(`${API_V1}/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });

  if (!response.ok) return false;

  const tokens = (await response.json()) as SessionTokens;
  // Best-effort persistence: during a render this is a no-op, and middleware
  // writes the cookies on the next navigation instead.
  await writeTokens(tokens);
  refreshedAccessToken = tokens.accessToken;
  return true;
}

/**
 * Call the API as the signed-in user.
 *
 * On a 401 this refreshes once and retries once. `retrying` makes that bound
 * explicit: an expired refresh token ends in SessionExpiredError rather than
 * an endless refresh loop.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { accessToken: cookieToken } = await readTokens();
  const accessToken = options.retrying ? (refreshedAccessToken ?? cookieToken) : cookieToken;

  const response = await fetch(`${API_V1}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (response.status === 401 && !options.retrying) {
    if (await refreshSession()) {
      return apiRequest<T>(path, { ...options, retrying: true });
    }
    throw new SessionExpiredError();
  }

  if (!response.ok) throw await parseError(response);

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Unauthenticated call, for login and registration. */
export async function apiPublic<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_V1}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!response.ok) throw await parseError(response);
  return (await response.json()) as T;
}
