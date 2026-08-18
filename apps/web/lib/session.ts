import 'server-only';
import { cookies } from 'next/headers';

/**
 * Server-side session handling.
 *
 * Tokens live in httpOnly cookies and are read only on the server. They are
 * never serialised into a page, never placed in localStorage, and never
 * reachable from client JavaScript — so a cross-site scripting bug cannot
 * become an account takeover.
 */

const ACCESS_COOKIE = 'molido_at';
const REFRESH_COOKIE = 'molido_rt';

const BASE_COOKIE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  // Secure is set outside development, where the app is served over TLS.
  secure: process.env.NODE_ENV === 'production',
};

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

export async function readTokens(): Promise<{ accessToken?: string; refreshToken?: string }> {
  const store = await cookies();
  return {
    accessToken: store.get(ACCESS_COOKIE)?.value,
    refreshToken: store.get(REFRESH_COOKIE)?.value,
  };
}

/**
 * Persist the session.
 *
 * Next.js only permits writing cookies from a Server Action, a Route Handler
 * or middleware. Called during a render it throws, so the failure is swallowed
 * here: the caller can still use the tokens for the current request, and
 * middleware persists them on the next navigation.
 */
export async function writeTokens(tokens: SessionTokens): Promise<void> {
  try {
    await writeTokensUnsafe(tokens);
  } catch {
    // Read-only context. Middleware will persist on the next request.
  }
}

async function writeTokensUnsafe(tokens: SessionTokens): Promise<void> {
  const store = await cookies();
  // The access cookie expires slightly before the token itself, so a request is
  // never made with a token that has just lapsed.
  store.set(ACCESS_COOKIE, tokens.accessToken, {
    ...BASE_COOKIE,
    maxAge: Math.max(30, tokens.expiresIn - 15),
  });
  store.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...BASE_COOKIE,
    maxAge: 30 * 24 * 60 * 60,
  });
}

export async function clearTokens(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}
