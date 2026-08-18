'use client';

import { useState } from 'react';

/**
 * The goal input.
 *
 * Submission is deliberately inert while the AI provider is unconfigured. The
 * alternative — accepting the goal and showing a spinner that resolves into
 * nothing, or worse, a canned answer — would be a small lie told at the very
 * front door of the product.
 */
export function AskMolido({ aiConfigured }: { aiConfigured: boolean }): React.JSX.Element {
  const [goal, setGoal] = useState('');

  return (
    <form
      className="mt-10 w-full"
      onSubmit={(event) => {
        event.preventDefault();
      }}
      aria-describedby="ask-molido-status"
    >
      <label htmlFor="goal" className="block text-sm font-medium text-molido-muted">
        What do you want to achieve?
      </label>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          id="goal"
          name="goal"
          type="text"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          maxLength={4000}
          autoComplete="off"
          placeholder="Describe a goal, and MOLIDO will plan the work."
          className="w-full flex-1 rounded-md border border-molido-line bg-molido-raised px-4 py-3 text-base text-molido-text placeholder:text-molido-muted/70"
        />
        <button
          type="submit"
          disabled={!aiConfigured || goal.trim().length === 0}
          className="rounded-md bg-molido-accent px-6 py-3 text-base font-semibold text-molido-ink transition-opacity disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          ASK MOLIDO
        </button>
      </div>

      <p id="ask-molido-status" className="mt-3 text-sm text-molido-muted">
        {aiConfigured
          ? 'Your goal is sent to the orchestrator, which selects an agent and records the task.'
          : 'No AI provider is configured yet, so this stays disabled. Set AI_PROVIDER and AI_MODEL to enable it.'}
      </p>
    </form>
  );
}
