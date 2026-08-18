import Link from 'next/link';
import type { PublicAiTask } from '@molido/types';
import { AskMolidoForm } from '../../components/AskMolidoForm';
import { TaskRow } from '../../components/TaskRow';
import { apiRequest } from '../../lib/server-api';
import type { DetailedHealthResponse } from '@molido/types';

export const dynamic = 'force-dynamic';

interface PagedTasks {
  items: PublicAiTask[];
  total: number;
}

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const [tasks, health] = await Promise.all([
    apiRequest<PagedTasks>('/ai/tasks?pageSize=5'),
    apiRequest<DetailedHealthResponse>('/health/detailed').catch(() => null),
  ]);

  const aiReady = health?.components.ai.status === 'ok';

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        What do you want to achieve?
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-molido-muted">
        Describe a goal. MOLIDO records it as a task, selects an agent, and processes it on the
        queue. You will see it move through PENDING, RUNNING and COMPLETED.
      </p>

      <AskMolidoForm aiReady={aiReady} />

      <section className="mt-12" aria-labelledby="recent-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="recent-heading" className="text-sm font-semibold uppercase tracking-wider text-molido-muted">
            Recent tasks
          </h2>
          <Link href="/app/tasks" className="text-sm text-molido-accent underline underline-offset-4">
            View all {tasks.total > 0 ? `(${tasks.total})` : ''}
          </Link>
        </div>

        {tasks.items.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-molido-line p-6 text-sm text-molido-muted">
            No tasks yet. That is a real zero, not a loading state — submit a goal above and it will
            appear here.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {tasks.items.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
