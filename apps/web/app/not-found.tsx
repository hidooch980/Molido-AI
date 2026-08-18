import Link from 'next/link';

export default function NotFound(): React.JSX.Element {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-5 text-center"
    >
      <p className="font-mono text-xs uppercase tracking-[0.35em] text-molido-accent">404</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="mt-4 text-molido-muted">
        The address you followed does not match anything MOLIDO serves.
      </p>
      <p className="mt-8">
        <Link href="/" className="font-semibold text-molido-accent underline underline-offset-4">
          Return to MOLIDO AI
        </Link>
      </p>
    </main>
  );
}
