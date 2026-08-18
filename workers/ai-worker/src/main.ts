import { createAIProvider } from '@molido/ai-core';
import { ConfigValidationError, describeConnection, loadConfig } from '@molido/config';
import { createPrismaClient } from '@molido/database';
import { createLogger } from '@molido/logger';
import { createAiTaskWorker, createQueueConnection, type AiTaskJob } from '@molido/queue';
import type { Job } from 'bullmq';
import { processAiTask } from './task-processor';

/**
 * MOLIDO AI task worker.
 *
 * Consumes the `ai-tasks` queue and executes agents from `@molido/ai-core` —
 * the same implementations the API would have used, so behaviour cannot drift
 * between the two processes.
 */
async function main(): Promise<void> {
  const config = loadConfig(process.env);

  const logger = createLogger({
    service: 'molido-ai-worker',
    level: config.logLevel,
    environment: config.env,
    pretty: config.isDevelopment,
  });

  const prisma = createPrismaClient({ databaseUrl: config.database.url });
  await prisma.$connect();
  logger.info(`Database connected: ${describeConnection(config.database.url)}`);

  const provider = createAIProvider({
    provider: config.ai.provider,
    model: config.ai.model,
    apiKey: config.ai.apiKey,
    baseUrl: config.ai.baseUrl,
  });

  logger.info(
    provider.name === 'null'
      ? 'No AI provider configured — tasks will fail with AI_PROVIDER_NOT_CONFIGURED'
      : `AI provider: ${provider.name} (model: ${provider.defaultModel})`,
  );

  const connection = createQueueConnection(config.redis.url);
  connection.on('error', (error: Error) => {
    logger.warn({ error: error.message }, 'Queue connection error');
  });

  const worker = createAiTaskWorker(connection, async (job: Job<AiTaskJob>) => {
    const result = await processAiTask(job.data, { prisma, provider, logger });

    // Throwing is how BullMQ is told to retry. The processor has already
    // decided whether another attempt is warranted, so this never loops on a
    // permanent failure.
    if (result.retryable) {
      throw new Error(`Task ${job.data.taskId} failed transiently; retrying`);
    }
    return result;
  });

  worker.on('failed', (job, error) => {
    logger.warn({ taskId: job?.data.taskId, error: error.message }, 'Job attempt failed');
  });

  worker.on('error', (error: Error) => {
    logger.error({ error: error.message }, 'Worker error');
  });

  logger.info('MOLIDO AI worker listening on the ai-tasks queue');

  // Graceful shutdown: finish the job in hand before exiting, so a deploy does
  // not strand a half-executed task.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received; finishing current job before exit`);
    await worker.close();
    connection.disconnect();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  if (error instanceof ConfigValidationError) {
    console.error('MOLIDO AI worker failed to start — invalid configuration');
    for (const issue of error.issues) console.error(`  ${issue}`);
  } else {
    console.error('MOLIDO AI worker failed to start', error);
  }
  process.exit(1);
});
