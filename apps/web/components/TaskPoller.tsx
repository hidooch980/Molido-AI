'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Widening intervals, then a hard stop. Roughly two minutes in total. */
const INTERVALS_MS = [1000, 2000, 3000, 5000, 5000, 8000, 8000, 10_000, 15_000, 20_000, 30_000];

/**
 * Refreshes the page while a task is still running.
 *
 * Three bounds, all deliberate: the interval widens so a slow task does not
 * hammer the API; the sequence ends, so a task that never moves cannot poll
 * forever; and the effect is torn down when the user leaves the page. A tab
 * left open overnight must not keep generating traffic.
 */
export function TaskPoller({ status }: { status: string }): React.JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const exhausted = step >= INTERVALS_MS.length;

  useEffect(() => {
    if (exhausted) return;
    if (status !== 'PENDING' && status !== 'RUNNING') return;

    const timer = setTimeout(() => {
      router.refresh();
      setStep((current) => current + 1);
    }, INTERVALS_MS[step]);

    return () => clearTimeout(timer);
  }, [step, status, router, exhausted]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-8 rounded-lg border border-molido-line bg-molido-surface p-5"
    >
      {exhausted ? (
        <p className="text-sm text-molido-muted">
          Still {status.toLowerCase()} after a couple of minutes. Automatic checking has stopped —{' '}
          <button
            type="button"
            onClick={() => {
              setStep(0);
              router.refresh();
            }}
            className="text-molido-accent underline underline-offset-4"
          >
            check again
          </button>
          .
        </p>
      ) : (
        <p className="text-sm text-molido-muted">
          <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-molido-accent align-middle" />
          Task is {status.toLowerCase()}. This page updates itself.
        </p>
      )}
    </div>
  );
}
