import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { SystemModeControl } from '../../../components/SystemModeControl';
import { apiRequest, ApiError } from '../../../lib/server-api';

export const metadata: Metadata = { title: 'Command centre' };
export const dynamic = 'force-dynamic';

interface Overview {
  users: { total: number; active: number; suspended: number; newLast7Days: number };
  aiTasks: { total: number; completed: number; failed: number; pending: number; running: number; cancelled: number };
  sessions: { active: number };
  security: { events: number; highOrCritical: number; last24h: number };
  revenue: { amount: number; currency: string; note: string };
  network: { nodes: number; note: string };
  system: { mode: string; reason: string | null; changedAt: string };
  health: { api: string; database: string; redis: string; ai: string };
}

interface SecurityFeed {
  bySeverity: Record<string, number>;
  recent: {
    id: string;
    type: string;
    severity: string;
    createdAt: string;
    ipAddress: string | null;
  }[];
}

const SEVERITY_STYLE: Record<string, string> = {
  LOW: 'text-molido-muted',
  MEDIUM: 'text-molido-warn',
  HIGH: 'text-molido-down',
  CRITICAL: 'text-molido-down font-semibold',
};

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-molido-line bg-molido-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-molido-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-2 text-xs text-molido-muted">{note}</p> : null}
    </div>
  );
}

export default async function FounderPage(): Promise<React.JSX.Element> {
  let overview: Overview;
  let feed: SecurityFeed;

  try {
    [overview, feed] = await Promise.all([
      apiRequest<Overview>('/founder/overview'),
      apiRequest<SecurityFeed>('/founder/security?limit=15'),
    ]);
  } catch (error) {
    // The API is the authority. A non-Founder who reaches this URL is bounced
    // here because the server said no — not because the UI hid a link.
    if (error instanceof ApiError && error.status === 403) redirect('/app');
    throw error;
  }

  const paused = overview.system.mode === 'PAUSED';

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Command centre</h1>
      <p className="mt-2 text-sm text-molido-muted">
        Every number below is a live count from the database. Zero means zero.
      </p>

      <SystemModeControl paused={paused} reason={overview.system.reason} />

      <section className="mt-10" aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="text-sm font-semibold uppercase tracking-wider text-molido-muted">
          Platform
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Users" value={overview.users.total} note={`${overview.users.active} active · ${overview.users.newLast7Days} new this week`} />
          <Metric label="AI tasks" value={overview.aiTasks.total} note={`${overview.aiTasks.completed} completed · ${overview.aiTasks.failed} failed`} />
          <Metric label="Active sessions" value={overview.sessions.active} />
          <Metric label="Security events" value={overview.security.events} note={`${overview.security.highOrCritical} high or critical`} />
          <Metric label="Revenue" value={`$${overview.revenue.amount}`} note={overview.revenue.note} />
          <Metric label="Network nodes" value={overview.network.nodes} note={overview.network.note} />
          <Metric label="In flight" value={overview.aiTasks.pending + overview.aiTasks.running} note={`${overview.aiTasks.pending} pending · ${overview.aiTasks.running} running`} />
          <Metric label="Cancelled" value={overview.aiTasks.cancelled} />
        </div>
      </section>

      <section className="mt-10" aria-labelledby="health-heading">
        <h2 id="health-heading" className="text-sm font-semibold uppercase tracking-wider text-molido-muted">
          Health
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-4">
          {Object.entries(overview.health).map(([component, status]) => (
            <div key={component} className="rounded-lg border border-molido-line bg-molido-surface p-4">
              <dt className="text-xs uppercase tracking-wider text-molido-muted">{component}</dt>
              <dd
                className={`mt-1 font-mono text-sm ${
                  status === 'ok' || status === 'configured' ? 'text-molido-ok' : status === 'not_configured' ? 'text-molido-muted' : 'text-molido-down'
                }`}
              >
                {status}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10" aria-labelledby="security-heading">
        <h2 id="security-heading" className="text-sm font-semibold uppercase tracking-wider text-molido-muted">
          Security events
        </h2>

        {feed.recent.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-molido-line p-6 text-sm text-molido-muted">
            No security events recorded.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-molido-line">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="bg-molido-surface text-xs uppercase tracking-wider text-molido-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Event</th>
                  <th scope="col" className="px-4 py-3">Severity</th>
                  <th scope="col" className="px-4 py-3">Source</th>
                  <th scope="col" className="px-4 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {feed.recent.map((event) => (
                  <tr key={event.id} className="border-t border-molido-line">
                    <td className="px-4 py-3 font-mono text-xs">{event.type}</td>
                    <td className={`px-4 py-3 font-mono text-xs ${SEVERITY_STYLE[event.severity] ?? ''}`}>
                      {event.severity}
                    </td>
                    {/* Addresses arrive already masked by the API. */}
                    <td className="px-4 py-3 font-mono text-xs text-molido-muted">{event.ipAddress ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-molido-muted">
                      {new Date(event.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
