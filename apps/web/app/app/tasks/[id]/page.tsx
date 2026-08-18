import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { PublicAiTask } from '@molido/types';
import { ResearchResult } from '../../../../components/ResearchResult';
import { StatusBadge } from '../../../../components/TaskRow';
import { TaskPoller } from '../../../../components/TaskPoller';
import { ApiError, apiRequest } from '../../../../lib/server-api';

export const dynamic = 'force-dynamic';

type TaskDetail = PublicAiTask & { output: Record<string, unknown> | null };

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  let task: TaskDetail;
  try {
    task = await apiRequest<TaskDetail>(`/ai/tasks/${id}`);
  } catch (error) {
    // The API returns 404 for another user's task as well as a missing one, so
    // this page cannot be used to discover which ids exist.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const inProgress = task.status === 'PENDING' || task.status === 'RUNNING';

  return (
    <div>
      <Link href="/app/tasks" className="text-sm text-molido-accent underline underline-offset-4">
        ← All tasks
      </Link>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <h1 className="max-w-2xl text-xl font-semibold tracking-tight sm:text-2xl">{task.goal}</h1>
        <StatusBadge status={task.status} />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-molido-line py-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wider text-molido-muted">Agent</dt>
          <dd className="mt-1">{task.agentKey === 'research' ? 'Research AI' : (task.agentKey ?? '—')}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-molido-muted">Created</dt>
          <dd className="mt-1 font-mono text-xs">
            {new Date(task.createdAt).toISOString().replace('T', ' ').slice(0, 19)} UTC
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-molido-muted">Completed</dt>
          <dd className="mt-1 font-mono text-xs">
            {task.finishedAt
              ? `${new Date(task.finishedAt).toISOString().replace('T', ' ').slice(0, 19)} UTC`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-molido-muted">Attempts</dt>
          <dd className="mt-1">{task.attempts}</dd>
        </div>
      </dl>

      {inProgress ? <TaskPoller status={task.status} /> : null}

      {task.status === 'FAILED' && task.error ? (
        <div className="mt-8 rounded-lg border border-molido-down/40 bg-molido-down/5 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-molido-down">
            This task failed
          </h2>
          {/* The stored message is already a redacted, user-safe summary. */}
          <p className="mt-2 font-mono text-sm text-molido-down">{task.error}</p>
        </div>
      ) : null}

      {task.status === 'COMPLETED' && task.output ? (
        <ResearchResult output={task.output} />
      ) : null}
    </div>
  );
}
