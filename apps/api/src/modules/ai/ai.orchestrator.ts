import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AI_ERROR_CODE, AIProviderError, isAIProviderError } from '@molido/ai-core';
import {
  ActorType,
  AiAgentStatus,
  AiTaskStatus,
  AuditOutcome,
  UserStatus,
  type AiAgent,
  type Prisma,
} from '@molido/database';
import type { Permission } from '@molido/types';
import { AuditService } from '../oversight/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderService } from './ai.provider';
import type { Agent, AgentContext } from './agents/agent.types';
import { ResearchAgent } from './agents/research.agent';

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
  private readonly agents: Map<string, Agent>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProviderService,
    private readonly audit: AuditService,
    researchAgent: ResearchAgent,
  ) {
    this.agents = new Map<string, Agent>([[researchAgent.key, researchAgent]]);
  }

  async run(request: OrchestrationRequest): Promise<OrchestrationResult> {
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

    const implementation = this.agents.get(agentRecord.key);
    if (!implementation) {
      // Registered in the database but not wired up in code. A configuration
      // fault, not a user error.
      this.logger.error(`Agent ${agentRecord.key} is registered but has no implementation`);
      throw new NotFoundException(`Unknown agent: ${request.agentKey}`);
    }

    // 4. Throughput ceiling, enforced per agent.
    await this.assertWithinRateLimit(agentRecord);

    // 5. Record the task before any work happens, so a crash mid-execution
    //    still leaves a trace rather than a silent disappearance.
    const task = await this.prisma.aiTask.create({
      data: {
        userId: request.userId,
        agentId: agentRecord.id,
        goal: request.goal,
        status: AiTaskStatus.RUNNING,
        maxAttempts: 1,
        attempts: 1,
        startedAt: new Date(),
      },
    });

    try {
      const context: AgentContext = {
        taskId: task.id,
        goal: request.goal,
        configuration: (agentRecord.configuration as Record<string, unknown>) ?? {},
        maxOutputTokens: agentRecord.maxTokensPerTask,
      };

      const result = await implementation.execute(this.providers.provider, context);

      await this.prisma.aiTask.update({
        where: { id: task.id },
        data: {
          status: AiTaskStatus.COMPLETED,
          output: result.output as Prisma.InputJsonObject,
          tokensUsed: result.tokensUsed,
          completedAt: new Date(),
        },
      });

      await this.audit.record({
        actorType: ActorType.USER,
        actorId: request.userId,
        actorUserId: request.userId,
        action: 'ai.task.execute',
        resource: 'ai_task',
        resourceId: task.id,
        outcome: AuditOutcome.SUCCESS,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        requestId: request.requestId,
        metadata: {
          agent: agentRecord.key,
          tokensUsed: result.tokensUsed,
          // The goal text is not copied into the audit row; the task row
          // already holds it, and duplicating user content widens exposure.
          goalChars: request.goal.length,
        },
      });

      return { taskId: task.id, status: AiTaskStatus.COMPLETED, output: result.output, error: null };
    } catch (error) {
      const failure = toPublicFailure(error);

      await this.prisma.aiTask.update({
        where: { id: task.id },
        data: {
          status: AiTaskStatus.FAILED,
          // A redacted, user-safe summary. The full error goes to the log.
          error: `${failure.code}: ${failure.message}`.slice(0, 2000),
          completedAt: new Date(),
        },
      });

      await this.audit.record({
        actorType: ActorType.USER,
        actorId: request.userId,
        actorUserId: request.userId,
        action: 'ai.task.execute',
        resource: 'ai_task',
        resourceId: task.id,
        outcome: AuditOutcome.FAILURE,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        requestId: request.requestId,
        metadata: { agent: agentRecord.key, errorCode: failure.code },
      });

      if (!isAIProviderError(error)) {
        this.logger.error(
          `Agent ${agentRecord.key} failed unexpectedly on task ${task.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }

      return { taskId: task.id, status: AiTaskStatus.FAILED, output: null, error: failure };
    }
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

/**
 * Reduce any thrown value to something safe to hand a client.
 *
 * A provider error keeps its code so the caller can distinguish "not
 * configured" from "try again". Anything else collapses to a generic code —
 * an unexpected exception's message can carry internals.
 */
function toPublicFailure(error: unknown): { code: string; message: string; retryable: boolean } {
  if (isAIProviderError(error)) return error.toPublicJSON();
  if (error instanceof AIProviderError) return error.toPublicJSON();
  return {
    code: AI_ERROR_CODE.UNKNOWN,
    message: 'The AI task could not be completed.',
    retryable: false,
  };
}
