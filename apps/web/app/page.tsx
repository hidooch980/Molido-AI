import { AskMolido } from '../components/AskMolido';
import { StatusCard } from '../components/StatusCard';
import { fetchPlatformStatus } from '../lib/api';
import { config } from '../lib/config';

// Health is live state; rendering it from a cache would make the status page
// confidently wrong.
export const dynamic = 'force-dynamic';

export default async function HomePage(): Promise<React.JSX.Element> {
  const status = await fetchPlatformStatus();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-5 py-10 sm:px-8 sm:py-16">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-molido-accent">
          Molido AI Network
        </p>
      </header>

      <main id="main" className="flex flex-1 flex-col justify-center py-12">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">{config.appName}</h1>
        <p className="mt-4 font-mono text-sm uppercase tracking-[0.25em] text-molido-muted sm:text-base">
          {config.tagline}
        </p>

        <p className="mt-8 max-w-2xl text-base leading-relaxed text-molido-muted">
          An AI platform built in the honest order: real products, real users, real revenue. No
          token, no synthetic traction, and nothing claimed that the system cannot actually do.
        </p>

        <AskMolido aiConfigured={status.ai === 'ok'} />

        <section className="mt-16" aria-labelledby="status-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2
              id="status-heading"
              className="text-sm font-semibold uppercase tracking-wider text-molido-muted"
            >
              System status
            </h2>
            <time
              className="font-mono text-xs text-molido-muted"
              dateTime={status.checkedAt}
              suppressHydrationWarning
            >
              checked {new Date(status.checkedAt).toISOString().slice(11, 19)} UTC
            </time>
          </div>

          {status.unreachable ? (
            <p
              role="status"
              className="mt-4 rounded-lg border border-molido-down/40 bg-molido-down/5 p-4 text-sm text-molido-down"
            >
              The API is not reachable at {config.apiUrl}. Start it with{' '}
              <code className="font-mono">pnpm dev:api</code>, or check that the data stores are
              running with <code className="font-mono">pnpm infra:up</code>.
            </p>
          ) : null}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatusCard
              name="API"
              description="The MOLIDO backend, serving /api/v1."
              status={status.api}
            />
            <StatusCard
              name="Database"
              description="PostgreSQL — identity, sessions, audit and AI tasks."
              status={status.database}
            />
            <StatusCard
              name="Cache"
              description="Redis — cache and the AI task queue."
              status={status.redis}
            />
            <StatusCard
              name="AI"
              description="Provider-neutral. Local or hosted, chosen by configuration."
              status={status.ai}
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-molido-line pt-6 text-sm text-molido-muted">
        <p>
          MOLIDO AI · MVP phase · No token, no coin, no fake users — real value first.
        </p>
      </footer>
    </div>
  );
}
