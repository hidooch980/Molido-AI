import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthForm } from '../../components/AuthForm';
import { apiRequest } from '../../lib/server-api';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; expired?: string }>;
}): Promise<React.JSX.Element> {
  // Asking the API is authoritative. Redirecting on cookie presence alone
  // would bounce a user with a stale token straight back here, forever.
  const signedIn = await apiRequest('/auth/me')
    .then(() => true)
    .catch(() => false);
  if (signedIn) redirect('/app');

  const params = await searchParams;
  const mode = params.mode === 'register' ? 'register' : 'login';

  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
      <Link href="/" className="font-mono text-xs uppercase tracking-[0.35em] text-molido-accent">
        Molido AI
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">
        {mode === 'register' ? 'Create your account' : 'Sign in'}
      </h1>
      <p className="mt-3 text-sm text-molido-muted">
        {mode === 'register'
          ? 'A real account, on a real system. No demo data, no sample users.'
          : 'Welcome back.'}
      </p>

      {params.expired ? (
        <p
          role="status"
          className="mt-6 rounded-md border border-molido-warn/40 bg-molido-warn/5 p-3 text-sm text-molido-warn"
        >
          Your session ended. Please sign in again.
        </p>
      ) : null}

      <AuthForm mode={mode} />

      <p className="mt-8 text-sm text-molido-muted">
        {mode === 'register' ? (
          <>
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-molido-accent underline underline-offset-4">
              Sign in
            </Link>
          </>
        ) : (
          <>
            No account yet?{' '}
            <Link
              href="/login?mode=register"
              className="font-medium text-molido-accent underline underline-offset-4"
            >
              Create one
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
