import { NextResponse, type NextRequest } from 'next/server';

/**
 * Keeps the session alive across navigations.
 *
 * Next.js does not permit setting a cookie during a Server Component render,
 * so a refresh performed there cannot persist. Middleware can, and it runs
 * before the page does — which makes it the right place to exchange an expired
 * access token for a fresh pair.
 *
 * Every path is bounded: one refresh attempt per request, and a failure clears
 * the cookies and sends the user to sign in. There is no way for this to loop.
 */

const ACCESS_COOKIE = 'molido_at';
const REFRESH_COOKIE = 'molido_rt';

const API_V1 = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1`;

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // A live access token needs nothing done to it.
  if (accessToken) return NextResponse.next();

  // No session at all: let the page decide (it will redirect to sign in).
  if (!refreshToken) {
    return signedOut(request);
  }

  try {
    const response = await fetch(`${API_V1}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    if (!response.ok) return signedOut(request);

    const tokens = (await response.json()) as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };

    const next = NextResponse.next();
    const secure = process.env.NODE_ENV === 'production';

    next.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure,
      maxAge: Math.max(30, tokens.expiresIn - 15),
    });
    next.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure,
      maxAge: 30 * 24 * 60 * 60,
    });

    return next;
  } catch {
    // The API being unreachable is not proof the session is invalid, but the
    // request cannot be served either way. Clearing is the safe direction.
    return signedOut(request);
  }
}

/** Clear the session cookies and send the user to sign in. */
function signedOut(request: NextRequest): NextResponse {
  const url = new URL('/login', request.url);
  if (request.cookies.get(REFRESH_COOKIE)) url.searchParams.set('expired', '1');

  const response = NextResponse.redirect(url);
  response.cookies.delete(ACCESS_COOKIE);
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}

export const config = {
  // Only the authenticated area. The landing page and sign-in must stay
  // reachable without a session.
  matcher: ['/app/:path*'],
};
