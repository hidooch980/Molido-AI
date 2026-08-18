'use client';

import { useState, useTransition } from 'react';
import { setSystemMode } from '../lib/actions';

/**
 * Emergency stop.
 *
 * Pausing stops *new* AI tasks being accepted. Work already queued or running
 * is left alone, and the control says so — an operator has to know exactly what
 * a button does before they press it in an incident.
 */
export function SystemModeControl({
  paused,
  reason,
}: {
  paused: boolean;
  reason: string | null;
}): React.JSX.Element {
  const [pending, startTransition] = useTransition();
  const [draftReason, setDraftReason] = useState('');

  return (
    <div
      className={`mt-8 rounded-lg border p-5 ${
        paused ? 'border-molido-warn/50 bg-molido-warn/5' : 'border-molido-line bg-molido-surface'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-molido-muted">
            System mode
          </p>
          <p className={`mt-1 font-mono text-lg ${paused ? 'text-molido-warn' : 'text-molido-ok'}`}>
            {paused ? 'PAUSED' : 'NORMAL'}
          </p>
          {paused && reason ? <p className="mt-1 text-sm text-molido-warn">{reason}</p> : null}
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setSystemMode(paused ? 'resume' : 'pause', draftReason || undefined);
              setDraftReason('');
            })
          }
          className={`rounded-md px-5 py-2.5 font-semibold disabled:opacity-50 ${
            paused ? 'bg-molido-ok text-molido-ink' : 'bg-molido-warn text-molido-ink'
          }`}
        >
          {pending ? 'Working…' : paused ? 'Resume AI' : 'Pause AI'}
        </button>
      </div>

      {!paused ? (
        <div className="mt-4">
          <label htmlFor="pause-reason" className="block text-xs text-molido-muted">
            Reason (shown to users whose task is refused)
          </label>
          <input
            id="pause-reason"
            type="text"
            value={draftReason}
            maxLength={500}
            onChange={(event) => setDraftReason(event.target.value)}
            placeholder="Investigating unusual activity"
            className="mt-2 w-full rounded-md border border-molido-line bg-molido-raised px-3 py-2 text-sm text-molido-text"
          />
        </div>
      ) : null}

      <p className="mt-4 text-xs text-molido-muted">
        Pausing rejects new AI tasks. Queued and running tasks are left to finish — nothing is
        discarded.
      </p>
    </div>
  );
}
