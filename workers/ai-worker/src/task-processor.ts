import {
  AI_ERROR_CODE,
  isAIProviderError,
  ResearchAgent,
  type Agent,
  type AIProvider,
} from '@molido/ai-core';
import {
  ActorType,
  AiAgentStatus,
  AiTaskStatus,
  AuditOutcome,
  type PrismaClient,
} from '@molido/database';
import { redact } from '@molido/security';
import type { AiTaskJob } from '@molido/queue';
import type { Logger } from '@molido/logger';

/** The agents this worker knows how to run, by registry key. */
const AGENTS: ReadonlyMap<string, Agent> = new Map<string, Agent>([
  ['research', new ResearchAgent()],
]);

export interface ProcessResult {
  status: AiTaskStatus;
  /** True when the failure is worth another attempt. */
  retryable: boolean;
}

/**
 * Execute one queued AI task.
 *
 * The job payload carries only ids. The task row is re-read here and its state
 * re-checked, so a job that was cancelled, already completed, or belongs to a
 * now-disabled agent is skipped rather than acted on — a queue message is a
 * snapshot from enqueue time and must never be trusted as current truth.
 */
export async function processAiTask(
  job: AiTaskJob,
  deps: { prisma: PrismaClient; provider: AIProvider; logger: Logger },
): Promise<ProcessResult> {
  const { prisma, provider, logger } = deps;

  const task = await prisma.aiTask.findUnique({
    where: { id: job.taskId },
    include: { agent: true },
  });

  if (!task) {
    logger.warn({ taskId: job.taskId }, 'Task no longer exists; dropping job');
    return { status: AiTaskStatus.CANCELLED, retryable: false };
  }

  // A user may have cancelled between enqueue and pickup. Respect it.
  if (task.status === AiTaskStatus.CANCELLED) {
    logger.info({ taskId: task.id }, 'Task was cancelled before execution');
    return { status: AiTaskStatus.CANCELLED, retryable: false };
  }

  // Guards against a duplicate delivery re-running finished work.
  if (task.status === AiTaskStatus.COMPLETED || task.status === AiTaskStatus.FAILED) {
    logger.info({ taskId: task.id, status: task.status }, 'Task already finished; ignoring');
    return { status: task.status, retryable: false };
  }

  if (!task.agent || task.agent.status !== AiAgentStatus.ACTIVE) {
    await failTask(prisma, task.id, 'AGENT_UNAVAILABLE: the agent is not active');
    return { status: AiTaskStatus.FAILED, retryable: false };
  }

  const implementation = AGENTS.get(task.agent.key);
  if (!implementation) {
    // Registered in the database but not built into this worker: a deployment
    // fault, not a user error, and retrying will not fix it.
    logger.error({ agent: task.agent.key }, 'Agent registered but not implemented in this worker');
    await failTask(prisma, task.id, 'AGENT_NOT_IMPLEMENTED: no implementation for this agent');
    return { status: AiTaskStatus.FAILED, retryable: false };
  }

  // Claim the task. The status guard makes this safe if two workers race: only
  // one transition from PENDING succeeds.
  const claimed = await prisma.aiTask.updateMany({
    where: { id: task.id, status: { in: [AiTaskStatus.PENDING, AiTaskStatus.RUNNING] } },
    data: { status: AiTaskStatus.RUNNING, startedAt: task.startedAt ?? new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    logger.info({ taskId: task.id }, 'Task was claimed by another worker');
    return { status: AiTaskStatus.RUNNING, retryable: false };
  }

  const startedAt = Date.now();

  try {
    const result = await implementation.execute(provider, {
      taskId: task.id,
      goal: task.goal,
      configuration: (task.agent.configuration as Record<string, unknown>) ?? {},
      maxOutputTokens: task.agent.maxTokensPerTask,
    });

    await prisma.aiTask.update({
      where: { id: task.id },
      data: {
        status: AiTaskStatus.COMPLETED,
        output: redact(result.output) as object,
        tokensUsed: result.tokensUsed,
        error: null,
        completedAt: new Date(),
      },
    });

    await recordAudit(prisma, task.id, task.userId, AuditOutcome.SUCCESS, {
      agent: task.agent.key,
      tokensUsed: result.tokensUsed,
      latencyMs: Date.now() - startedAt,
    });

    logger.info(
      { taskId: task.id, tokens: result.tokensUsed, latencyMs: Date.now() - startedAt },
      'Task completed',
    );

    return { status: AiTaskStatus.COMPLETED, retryable: false };
  } catch (error) {
    const failure = describeFailure(error);
    const attempts = task.attempts + 1;
    // Retry only when the failure is transient *and* attempts remain. Anything
    // else is marked FAILED now, so a permanently broken task cannot loop.
    const willRetry = failure.retryable && attempts < task.maxAttempts;

    if (willRetry) {
      logger.warn(
        { taskId: task.id, attempts, maxAttempts: task.maxAttempts, code: failure.code },
        'Task failed; will retry',
      );
      // Left RUNNING; BullMQ redelivers and the next attempt re-claims it.
      return { status: AiTaskStatus.RUNNING, retryable: true };
    }

    await failTask(prisma, task.id, `${failure.code}: ${failure.message}`);
    await recordAudit(prisma, task.id, task.userId, AuditOutcome.FAILURE, {
      agent: task.agent.key,
      errorCode: failure.code,
      attempts,
    });

    if (!isAIProviderError(error)) {
      // An unexpected exception is a defect: log it in full, here, where an
      // operator can see it — never in the response.
      logger.error(
        { taskId: task.id, error: error instanceof Error ? error.stack : String(error) },
        'Task failed with an unexpected error',
      );
    } else {
      logger.warn({ taskId: task.id, code: failure.code }, 'Task failed');
    }

    return { status: AiTaskStatus.FAILED, retryable: false };
  }
}

async function failTask(prisma: PrismaClient, taskId: string, message: string): Promise<void> {
  await prisma.aiTask.update({
    where: { id: taskId },
    data: {
      status: AiTaskStatus.FAILED,
      // Truncated to the column width, and already free of internals.
      error: message.slice(0, 2000),
      completedAt: new Date(),
    },
  });
}

async function recordAudit(
  prisma: PrismaClient,
  taskId: string,
  userId: string | null,
  outcome: AuditOutcome,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        // The worker acts on the system's behalf, not the user's, so the actor
        // type reflects that even though the task belongs to a user.
        actorType: ActorType.SERVICE,
        actorId: null,
        actorUserId: userId,
        action: 'ai.task.execute',
        resource: 'ai_task',
        resourceId: taskId,
        outcome,
        metadata: redact(metadata) as object,
      },
    });
  } catch {
    // Losing an audit line must never turn a completed task into a failed one.
  }
}

/** Reduce any thrown value to a user-safe code, message and retry decision. */
function describeFailure(error: unknown): { code: string; message: string; retryable: boolean } {
  if (isAIProviderError(error)) {
    const publicView = error.toPublicJSON();
    return { code: publicView.code, message: publicView.message, retryable: publicView.retryable };
  }
  return {
    code: AI_ERROR_CODE.UNKNOWN,
    message: 'The AI task could not be completed.',
    retryable: false,
  };
}
