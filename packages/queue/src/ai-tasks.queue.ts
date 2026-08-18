import { Queue, Worker, type ConnectionOptions, type Processor, type WorkerOptions } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';

/** The single AI task queue. Named once, so producer and consumer cannot drift. */
export const AI_TASKS_QUEUE = 'ai-tasks';

/**
 * What travels on the wire.
 *
 * Deliberately minimal: an id and the goal. The worker re-reads the task row
 * before doing anything, so a job that is stale, cancelled or already finished
 * is detected rather than acted on. Putting the full task state in the payload
 * would mean trusting a snapshot taken at enqueue time.
 */
export interface AiTaskJob {
  taskId: string;
  agentKey: string;
  userId: string;
  /** Correlates the queued work with the request that created it. */
  requestId?: string | null;
}

/** Retry policy. Bounded, so a permanently failing job cannot loop forever. */
export const AI_TASK_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  // Completed jobs are trimmed; the durable record is the AiTask row, not the
  // queue entry.
  removeOnComplete: { age: 3600, count: 100 },
  // Failures are kept longer, because they are what an operator investigates.
  removeOnFail: { age: 24 * 3600, count: 500 },
};

/**
 * A Redis connection configured the way BullMQ requires.
 *
 * `maxRetriesPerRequest: null` is mandatory for BullMQ's blocking commands —
 * with a limit set, a long poll is aborted mid-wait and jobs appear to vanish.
 */
export function createQueueConnection(redisUrl: string): Redis {
  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function createAiTaskQueue(connection: ConnectionOptions): Queue<AiTaskJob> {
  return new Queue<AiTaskJob>(AI_TASKS_QUEUE, {
    connection,
    defaultJobOptions: AI_TASK_JOB_OPTIONS,
  });
}

export function createAiTaskWorker(
  connection: ConnectionOptions,
  processor: Processor<AiTaskJob>,
  options: Partial<WorkerOptions> = {},
): Worker<AiTaskJob> {
  return new Worker<AiTaskJob>(AI_TASKS_QUEUE, processor, {
    connection,
    // One task at a time by default: AI calls are expensive, and unbounded
    // concurrency is how a budget is blown by accident.
    concurrency: 1,
    ...options,
  });
}

export { Queue, Worker };
export type { ConnectionOptions, Processor };
