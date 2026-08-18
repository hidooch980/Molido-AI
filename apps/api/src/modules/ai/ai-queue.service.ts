import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { AppConfig } from '@molido/config';
import { createAiTaskQueue, createQueueConnection, type AiTaskJob, type Queue } from '@molido/queue';
import type { Redis } from 'ioredis';
import { APP_CONFIG } from '../../config/config.module';

/**
 * Producer side of the AI task queue.
 *
 * Enqueue failures are surfaced to the caller rather than swallowed: a task
 * recorded as PENDING that no worker will ever see is worse than an honest
 * error at submission time.
 */
@Injectable()
export class AiQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiQueueService.name);
  private connection?: Redis;
  private queue?: Queue<AiTaskJob>;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  onModuleInit(): void {
    this.connection = createQueueConnection(this.config.redis.url);
    // A listener is required: an unhandled 'error' event would take the process
    // down on a transient Redis blip.
    this.connection.on('error', (error: Error) => {
      this.logger.warn(`Queue connection error: ${error.message}`);
    });
    this.queue = createAiTaskQueue(this.connection);
    this.logger.log('AI task queue ready');
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
    this.connection?.disconnect();
  }

  async enqueue(job: AiTaskJob): Promise<void> {
    if (!this.queue) throw new Error('AI task queue is not initialised');
    // jobId = taskId makes enqueueing idempotent: a retried submission cannot
    // put the same task on the queue twice.
    await this.queue.add('execute', job, { jobId: job.taskId });
  }

  /** Queue depth, for the Founder overview and health reporting. */
  async counts(): Promise<{ waiting: number; active: number; failed: number }> {
    if (!this.queue) return { waiting: 0, active: 0, failed: 0 };
    try {
      const counts = await this.queue.getJobCounts('waiting', 'active', 'failed');
      return {
        waiting: counts['waiting'] ?? 0,
        active: counts['active'] ?? 0,
        failed: counts['failed'] ?? 0,
      };
    } catch {
      return { waiting: 0, active: 0, failed: 0 };
    }
  }
}
