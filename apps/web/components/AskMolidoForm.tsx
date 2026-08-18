'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { submitGoal, type FormState } from '../lib/actions';

function SubmitButton({ disabled }: { disabled: boolean }): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-md bg-molido-accent px-6 py-3 font-semibold text-molido-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? 'Submitting…' : 'ASK MOLIDO'}
    </button>
  );
}

/**
 * Submits a goal and then refreshes the task list a few times.
 *
 * The task is processed asynchronously, so the page has to look again to see
 * it progress. The polling is deliberately bounded — a fixed number of checks
 * on a widening interval, then it stops. An unbounded poll would keep a tab
 * hitting the API forever on a task that is never going to move.
 */
export function AskMolidoForm({ aiReady }: { aiReady: boolean }): React.JSX.Element {
  const [state, formAction] = useActionState<FormState, FormData>(submitGoal, {});
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const submittedAt = useRef(0);

  useEffect(() => {
    // Only poll after a submission that succeeded.
    if (state.error || submittedAt.current === 0) return;

    const delays = [1000, 2000, 3000, 5000, 8000];
    const timers = delays.map((delay, index) =>
      setTimeout(() => router.refresh(), delays.slice(0, index + 1).reduce((a, b) => a + b, 0)),
    );
    return () => timers.forEach(clearTimeout);
  }, [state, router]);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        submittedAt.current = Date.now();
        formAction(formData);
        formRef.current?.reset();
      }}
      className="mt-8"
    >
      <label htmlFor="goal" className="sr-only">
        Your goal
      </label>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id="goal"
          name="goal"
          type="text"
          maxLength={4000}
          required
          autoComplete="off"
          placeholder="Research how AI agents can help small businesses."
          className="w-full flex-1 rounded-md border border-molido-line bg-molido-raised px-4 py-3 text-molido-text placeholder:text-molido-muted/70"
        />
        <SubmitButton disabled={!aiReady} />
      </div>

      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-molido-down">
          {state.error}
        </p>
      ) : (
        <p className="mt-3 text-sm text-molido-muted">
          {aiReady
            ? 'Submitted tasks are queued and processed by the AI worker.'
            : 'No AI provider is configured, so submissions are disabled. Set AI_PROVIDER and AI_MODEL to enable them.'}
        </p>
      )}
    </form>
  );
}
