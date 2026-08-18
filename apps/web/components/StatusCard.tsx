import type { SystemStatus } from '../lib/api';
import { StatusPill } from './StatusPill';

interface StatusCardProps {
  name: string;
  description: string;
  status: SystemStatus;
}

export function StatusCard({ name, description, status }: StatusCardProps): React.JSX.Element {
  return (
    <div className="rounded-lg border border-molido-line bg-molido-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="truncate text-sm font-semibold uppercase tracking-wider text-molido-muted">
          {name}
        </h3>
        <span className="shrink-0">
          <StatusPill status={status} />
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-molido-muted">{description}</p>
    </div>
  );
}
