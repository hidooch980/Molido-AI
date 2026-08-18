import Link from 'next/link';
import type { AiTaskStatus, PublicAiTask } from '@molido/types';

const STATUS_STYLE: Record<AiTaskStatus, string> = {
  PENDING: 'text-molido-muted',
  RUNNING: 'text-molido-accent',
  COMPLETED: 'text-molido-ok',
  FAILED: 'text-molido-down',
  CANCELLED: 'text-molido-muted',
};

export function StatusBadge({ status }: { status: AiTaskStatus }): React.JSX.Element {
  return (
    <span className={`font-mono text-xs uppercase tracking-wider ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

export function TaskRow({ task }: { task: PublicAiTask }): React.JSX.Element {
  return (
    <li className="rounded-lg border border-molido-line bg-molido-surface">
      <Link href={`/app/tasks/${task.id}`} className="block p-4 hover:bg-molido-raised">
        <div className="flex items-start justify-between gap-4">
          {/* Truncated so one very long goal cannot dominate the list. */}
          <p className="line-clamp-2 text-sm text-molido-text">{task.goal}</p>
          <StatusBadge status={task.status} />
        </div>
        <p className="mt-2 font-mono text-xs text-molido-muted">
          {task.agentKey ?? 'unassigned'} · {new Date(task.createdAt).toISOString().replace('T', ' ').slice(0, 19)} UTC
        </p>
      </Link>
    </li>
  );
}
