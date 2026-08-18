'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { AuthResponse } from '@molido/types';
import { apiPublic, apiRequest, ApiError } from './server-api';
import { clearTokens, readTokens, writeTokens } from './session';

/**
 * Server actions.
 *
 * Every mutation runs on the server, so the browser never holds a token and
 * never talks to the API directly. Errors are returned as plain state rather
 * than thrown, so a failed sign-in re-renders the form instead of showing a
 * crash page.
 */

export interface FormState {
  error?: string;
}

export async function signIn(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'Enter your email and password.' };

  try {
    const auth = await apiPublic<AuthResponse>('/auth/login', { email, password });
    await writeTokens(auth);
  } catch (error) {
    // The API deliberately returns the same message for a wrong password and an
    // unknown account. That is passed through unchanged — softening it here
    // would re-open the enumeration hole the API closed.
    return { error: error instanceof ApiError ? error.message : 'Sign in failed. Try again.' };
  }

  redirect('/app');
}

export async function signUp(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const displayName = String(formData.get('displayName') ?? '').trim();

  if (!email || !password) return { error: 'Enter your email and a password.' };

  try {
    const auth = await apiPublic<AuthResponse>('/auth/register', {
      email,
      password,
      ...(displayName ? { displayName } : {}),
    });
    await writeTokens(auth);
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Registration failed. Try again.' };
  }

  redirect('/app');
}

export async function signOut(): Promise<void> {
  const { refreshToken } = await readTokens();
  try {
    await apiRequest('/auth/logout', {
      method: 'POST',
      body: refreshToken ? { refreshToken } : {},
    });
  } catch {
    // Even if the API call fails, the local session is cleared: a user who
    // asked to sign out must end up signed out.
  }
  await clearTokens();
  redirect('/login');
}

export async function signOutEverywhere(): Promise<void> {
  try {
    await apiRequest('/auth/logout-all', { method: 'POST' });
  } catch {
    // As above.
  }
  await clearTokens();
  redirect('/login');
}

export async function submitGoal(_previous: FormState, formData: FormData): Promise<FormState> {
  const goal = String(formData.get('goal') ?? '').trim();
  if (goal.length < 3) return { error: 'Describe the goal in a little more detail.' };

  try {
    await apiRequest('/ai/tasks', { method: 'POST', body: { agent: 'research', input: goal } });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : 'Could not submit the task.' };
  }

  revalidatePath('/app');
  return {};
}

export async function cancelTask(taskId: string): Promise<void> {
  try {
    await apiRequest(`/ai/tasks/${taskId}/cancel`, { method: 'POST' });
  } catch {
    // A cancellation that arrives after completion is a no-op, not an error.
  }
  revalidatePath('/app/tasks');
}

export async function setSystemMode(mode: 'pause' | 'resume', reason?: string): Promise<void> {
  await apiRequest(`/founder/${mode}`, {
    method: 'POST',
    body: mode === 'pause' ? { reason } : {},
  });
  revalidatePath('/app/founder');
}
