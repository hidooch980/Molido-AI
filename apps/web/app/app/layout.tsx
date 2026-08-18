import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { PublicUser } from '@molido/types';
import { signOut } from '../../lib/actions';
import { apiRequest, SessionExpiredError } from '../../lib/server-api';

export const dynamic = 'force-dynamic';

/**
 * Every page below /app is authenticated here, on the server.
 *
 * The check is a real API call rather than a cookie-presence test: a cookie
 * proves someone once signed in, not that the session is still valid.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): Promise<React.JSX.Element> {
  let user: PublicUser;
  try {
    user = await apiRequest<PublicUser>('/auth/me');
  } catch (error) {
    if (error instanceof SessionExpiredError) redirect('/login?expired=1');
    redirect('/login');
  }

  const isFounder = user.permissions.includes('SYSTEM_MANAGE');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-molido-line pb-5">
        <Link href="/app" className="font-mono text-xs uppercase tracking-[0.35em] text-molido-accent">
          Molido AI
        </Link>

        <nav aria-label="Main" className="flex items-center gap-5 text-sm">
          <Link href="/app" className="text-molido-muted hover:text-molido-text">
            Dashboard
          </Link>
          <Link href="/app/tasks" className="text-molido-muted hover:text-molido-text">
            Tasks
          </Link>
          {/* Hidden for ordinary users as a courtesy. The API enforces it. */}
          {isFounder ? (
            <Link href="/app/founder" className="text-molido-muted hover:text-molido-text">
              Command centre
            </Link>
          ) : null}
          <form action={signOut}>
            <button type="submit" className="text-molido-muted hover:text-molido-text">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <main id="main" className="flex-1 py-8">{children}</main>

      <footer className="border-t border-molido-line pt-5 text-xs text-molido-muted">
        Signed in as {user.email} · {user.roles.join(', ')}
      </footer>
    </div>
  );
}
