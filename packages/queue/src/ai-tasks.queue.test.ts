import { describe, expect, it } from 'vitest';
import { AI_TASKS_QUEUE, AI_TASK_JOB_OPTIONS, createQueueConnection } from './ai-tasks.queue';

describe('queue definition', () => {
  it('names the queue once, so producer and consumer cannot drift', () => {
    expect(AI_TASKS_QUEUE).toBe('ai-tasks');
  });
});

describe('retry policy', () => {
  it('bounds attempts, so a permanently failing job cannot loop forever', () => {
    expect(AI_TASK_JOB_OPTIONS.attempts).toBe(3);
    expect(AI_TASK_JOB_OPTIONS.attempts).toBeLessThanOrEqual(5);
  });

  it('backs off exponentially rather than hammering a struggling provider', () => {
    expect(AI_TASK_JOB_OPTIONS.backoff).toMatchObject({ type: 'exponential' });
    expect(AI_TASK_JOB_OPTIONS.backoff.delay).toBeGreaterThanOrEqual(1000);
  });

  it('keeps failures far longer than successes, because failures get investigated', () => {
    expect(AI_TASK_JOB_OPTIONS.removeOnFail.age).toBeGreaterThan(
      AI_TASK_JOB_OPTIONS.removeOnComplete.age,
    );
  });
});

describe('createQueueConnection', () => {
  it('disables the per-request retry limit that BullMQ cannot work with', () => {
    // With a limit set, BullMQ's blocking commands are aborted mid-wait and
    // jobs appear to vanish. This is a correctness requirement, not a tuning
    // preference.
    const connection = createQueueConnection('redis://127.0.0.1:6399');
    expect(connection.options.maxRetriesPerRequest).toBeNull();
    expect(connection.options.enableReadyCheck).toBe(false);
    connection.disconnect();
  });
});
