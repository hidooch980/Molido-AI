import Link from 'next/link';
import type { Metadata } from 'next';
import type { PublicAiTask } from '@molido/types';
import { TaskRow } from '../../../components/TaskRow';
import { apiRequest } from '../../../lib/server-api';

export const metadata: Metadata = { title: 'My AI tasks' };
export const dynamic = 'force-dynamic';

interface PagedTasks {
  items: PublicAiTask[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<React.JSX.Element> {
  const params = await searchParams;
  const requested = Number.parseInt(params.page ?? '1', 10);
  const page = Number.isFinite(requested) && requested > 0 ? requested : 1;

  const tasks = await apiRequest<PagedTasks>(`/ai/tasks?page=${page}&pageSize=20`);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">My AI tasks</h1>
      <p className="mt-2 text-sm text-molido-muted">
        {tasks.total === 0
          ? 'Nothing here yet.'
          : `${tasks.total} task${tasks.total === 1 ? '' : 's'} · page ${tasks.page} of ${tasks.totalPages}`}
      </p>

      {tasks.items.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-molido-line p-6 text-sm text-molido-muted">
          No tasks yet.{' '}
          <Link href="/app" className="text-molido-accent underline underline-offset-4">
            Submit a goal
          </Link>{' '}
          to create one.
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {tasks.items.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}

      {tasks.totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-between text-sm">
          {tasks.page > 1 ? (
            <Link href={`/app/tasks?page=${tasks.page - 1}`} className="text-molido-accent underline underline-offset-4">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          {tasks.page < tasks.totalPages ? (
            <Link href={`/app/tasks?page=${tasks.page + 1}`} className="text-molido-accent underline underline-offset-4">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
