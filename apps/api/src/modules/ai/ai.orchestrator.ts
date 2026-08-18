import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ActorType,
  AiAgentStatus,
  AiTaskStatus,
  AuditOutcome,
  UserStatus,
  type AiAgent,
} from '@molido/database';
import type { Permission } from '@molido/types';
import { AuditService } from '../oversight/audit.service';
import { SystemStateService } from '../system/system-state.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiQueueService } from './ai-queue.service';

export interface OrchestrationRequest {
  userId: string;
  goal: string;
  agentKey: string;
  actorPermissions: Permission[];
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface OrchestrationResult {
  taskId: string;
  status: AiTaskStatus;
  output: Record<string, unknown> | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

/**
 * The single path from a user goal to an agent execution.
 *
 * Every step is deliberate and ordered: validate the request, confirm the actor
 * may act, confirm the agent is allowed to run, record the task *before* doing
 * any work, execute, validate the output, persist, audit. Nothing calls an
 * agent except this class, so there is no route around the checks.
 */
@Injectable()
export class AiOrchestrator {
  private readonly logger = new Logger(AiOrchestrator.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly systemState: SystemStateService,
    private readonly queue: AiQueueService,
  ) {}

  async run(request: OrchestrationRequest): Promise<OrchestrationResult> {
    // 0. Global mode. A paused platform refuses *new* work and says so
    //    plainly. Tasks already queued or running are deliberately left
    //    untouched — silently destroying a user's in-flight job would be a
    //    worse failure than the one a pause is meant to contain.
    const state = await this.systemState.current();
    if (state.mode === 'PAUSED') {
      await this.recordDenied(request, 'system paused');
      throw new ServiceUnavailableException(
        state.reason
          ? `MOLIDO AI is paused: ${state.reason}`
          : 'MOLIDO AI is paused. New AI tasks are not being accepted right now.',
      );
    }

    // 1. Permission. Checked here as well as at the route, because the
    //    orchestrator is the thing that must never execute an agent for an
    //    actor who is not entitled to one.
    if (!request.actorPermissions.includes('AI_TASK_CREATE')) {
      await this.recordDenied(request, 'missing AI_TASK_CREATE');
      throw new ForbiddenException('Access denied');
    }

    // 2. Account state. A suspended user keeps a valid token until it expires;
    //    that must not be enough to spend AI budget.
    const user = await this.prisma.user.findUnique({
      where: { id: request.userId },
      select: { status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.recordDenied(request, `account status ${user?.status ?? 'missing'}`);
      throw new ForbiddenException('This account is not active.');
    }

    // 3. Agent selection and eligibility.
    const agentRecord = await this.prisma.aiAgent.findUnique({
      where: { key: request.agentKey },
    });
    if (!agentRecord) {
      throw new NotFoundException(`Unknown agent: ${request.agentKey}`);
    }
    if (agentRecord.status !== AiAgentStatus.ACTIVE) {
      await this.recordDenied(request, `agent ${agentRecord.key} is ${agentRecord.status}`);
      throw new ForbiddenException(
        `The ${agentRecord.key} agent is currently ${agentRecord.status.toLowerCase()}.`,
      );
    }

    // 4. Throughput ceiling, enforced per agent.
    await this.assertWithinRateLimit(agentRecord);

    // 5. Record the task before any work happens, so a crash still leaves a
    //    trace rather than a silent disappearance.
    const task = await this.prisma.aiTask.create({
      data: {
        userId: request.userId,
        agentId: agentRecord.id,
        goal: request.goal,
        status: AiTaskStatus.PENDING,
        maxAttempts: 3,
      },
    });

    // 6. Hand it to the queue. Execution happens in the worker, so a slow model
    //    cannot hold an HTTP request open, and a restart does not lose work.
    try {
      await this.queue.enqueue({
        taskId: task.id,
        agentKey: agentRecord.key,
        userId: request.userId,
        requestId: request.requestId,
      });
    } catch (error) {
      // A task recorded as PENDING that no worker will ever see is worse than
      // an honest failure at submission time, so the row is marked FAILED and
      // the caller is told.
      this.logger.error(
        `Failed to enqueue task ${task.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.prisma.aiTask.update({
        where: { id: task.id },
        data: {
          status: AiTaskStatus.FAILED,
          error: 'QUEUE_UNAVAILABLE: the task could not be queued for processing',
          completedAt: new Date(),
        },
      });
      await this.audit.record({
        actorType: ActorType.USER,
        actorId: request.userId,
        actorUserId: request.userId,
        action: 'ai.task.enqueue',
        resource: 'ai_task',
        resourceId: task.id,
        outcome: AuditOutcome.FAILURE,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        requestId: request.requestId,
      });
      return {
        taskId: task.id,
        status: AiTaskStatus.FAILED,
        output: null,
        error: {
          code: 'QUEUE_UNAVAILABLE',
          message: 'The task could not be queued for processing. Please try again.',
          retryable: true,
        },
      };
    }

    await this.audit.record({
      actorType: ActorType.USER,
      actorId: request.userId,
      actorUserId: request.userId,
      action: 'ai.task.create',
      resource: 'ai_task',
      resourceId: task.id,
      outcome: AuditOutcome.SUCCESS,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      requestId: request.requestId,
      metadata: {
        agent: agentRecord.key,
        // The goal text is not copied here; the task row already holds it, and
        // duplicating user content widens exposure for no benefit.
        goalChars: request.goal.length,
      },
    });

    return { taskId: task.id, status: AiTaskStatus.PENDING, output: null, error: null };
  }

  /** Agent-level throughput ceiling, counted over the trailing hour. */
  private async assertWithinRateLimit(agent: AiAgent): Promise<void> {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await this.prisma.aiTask.count({
      where: { agentId: agent.id, createdAt: { gte: since } },
    });

    if (recent >= agent.maxTasksPerHour) {
      throw new ForbiddenException(
        `The ${agent.key} agent has reached its hourly limit. Try again later.`,
      );
    }
  }

  private async recordDenied(request: OrchestrationRequest, reason: string): Promise<void> {
    await this.audit.record({
      actorType: ActorType.USER,
      actorId: request.userId,
      actorUserId: request.userId,
      action: 'ai.task.create',
      resource: 'ai_task',
      outcome: AuditOutcome.DENIED,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      requestId: request.requestId,
      metadata: { reason, agent: request.agentKey },
    });
  }
}
