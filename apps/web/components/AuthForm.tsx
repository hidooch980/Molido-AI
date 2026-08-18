'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, signUp, type FormState } from '../lib/actions';

function SubmitButton({ label }: { label: string }): React.JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-6 w-full rounded-md bg-molido-accent px-6 py-3 font-semibold text-molido-ink disabled:opacity-50"
    >
      {/* The button reports its own state, so a slow network never looks like
          an unresponsive page. */}
      {pending ? 'Working…' : label}
    </button>
  );
}

export function AuthForm({ mode }: { mode: 'login' | 'register' }): React.JSX.Element {
  const action = mode === 'register' ? signUp : signIn;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-8">
      {state.error ? (
        <p
          role="alert"
          className="mb-5 rounded-md border border-molido-down/40 bg-molido-down/5 p-3 text-sm text-molido-down"
        >
          {state.error}
        </p>
      ) : null}

      {mode === 'register' ? (
        <div className="mb-4">
          <label htmlFor="displayName" className="block text-sm font-medium text-molido-muted">
            Name <span className="text-molido-muted/60">(optional)</span>
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            maxLength={120}
            autoComplete="name"
            className="mt-2 w-full rounded-md border border-molido-line bg-molido-raised px-4 py-3 text-molido-text"
          />
        </div>
      ) : null}

      <div className="mb-4">
        <label htmlFor="email" className="block text-sm font-medium text-molido-muted">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          className="mt-2 w-full rounded-md border border-molido-line bg-molido-raised px-4 py-3 text-molido-text"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-molido-muted">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === 'register' ? 12 : undefined}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          aria-describedby={mode === 'register' ? 'password-hint' : undefined}
          className="mt-2 w-full rounded-md border border-molido-line bg-molido-raised px-4 py-3 text-molido-text"
        />
        {mode === 'register' ? (
          <p id="password-hint" className="mt-2 text-xs text-molido-muted">
            At least 12 characters. Length matters more than symbols — a passphrase works well.
          </p>
        ) : null}
      </div>

      <SubmitButton label={mode === 'register' ? 'Create account' : 'Sign in'} />
    </form>
  );
}
