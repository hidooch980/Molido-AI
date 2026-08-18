import type { SystemStatus } from '../lib/api';

const PRESENTATION: Record<SystemStatus, { label: string; dot: string; text: string }> = {
  ok: { label: 'Operational', dot: 'bg-molido-ok', text: 'text-molido-ok' },
  degraded: { label: 'Degraded', dot: 'bg-molido-warn', text: 'text-molido-warn' },
  down: { label: 'Unavailable', dot: 'bg-molido-down', text: 'text-molido-down' },
  // "Not configured" is the honest state of AI during the MVP, and it is
  // presented as a neutral fact rather than dressed up as a failure or a
  // success.
  disabled: { label: 'Not configured', dot: 'bg-molido-muted', text: 'text-molido-muted' },
  unknown: { label: 'Unknown', dot: 'bg-molido-muted', text: 'text-molido-muted' },
};

export function StatusPill({ status }: { status: SystemStatus }): React.JSX.Element {
  const presentation = PRESENTATION[status];

  return (
    <span className={`inline-flex items-center gap-2 text-sm font-medium ${presentation.text}`}>
      {/* Decorative: the label carries the meaning, so colour is never the
          only signal — which is what makes this readable to a colour-blind or
          screen-reader user. */}
      <span aria-hidden="true" className={`size-2 rounded-full ${presentation.dot}`} />
      {presentation.label}
    </span>
  );
}
