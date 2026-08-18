import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, AuditOutcome, type AiTaskStatus } from '@molido/database';
import type { PublicAiAgent, PublicAiTask } from '@molido/types';
import type { AuthenticatedActor } from '../../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../oversight/audit.service';
import { AiOrchestrator, type OrchestrationRequest } from './ai.orchestrator';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface PagedTasks {
  items: PublicAiTask[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Read side of the AI module, plus the thin wrapper over the orchestrator.
 *
 * Ownership is enforced in every read: `AI_TASK_READ` means "your own tasks",
 * and seeing someone else's requires the separate `AI_TASK_MANAGE` grant.
 */
@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: AiOrchestrator,
    private readonly audit: AuditService,
  ) {}

  async createTask(request: OrchestrationRequest): ReturnType<AiOrchestrator['run']> {
    return this.orchestrator.run(request);
  }

  /**
   * List tasks, newest first.
   *
   * Paginated rather than capped: a silent cap looks like "you have 50 tasks"
   * when you have five hundred. The total is returned so a client can tell the
   * difference.
   */
  async listTasks(actor: AuthenticatedActor, pagination: Partial<Pagination> = {}): Promise<PagedTasks> {
    const canSeeAll = actor.permissions.includes('AI_TASK_MANAGE');
    const page = Math.max(1, pagination.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pagination.pageSize ?? DEFAULT_PAGE_SIZE));
    const where = canSeeAll ? {} : { userId: actor.userId };

    const [tasks, total] = await Promise.all([
      this.prisma.aiTask.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { agent: { select: { key: true } } },
      }),
      this.prisma.aiTask.count({ where }),
    ]);

    return {
      items: tasks.map(toPublicTask),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getTask(
    taskId: string,
    actor: AuthenticatedActor,
  ): Promise<PublicAiTask & { output: Record<string, unknown> | null }> {
    const task = await this.prisma.aiTask.findUnique({
      where: { id: taskId },
      include: { agent: { select: { key: true } } },
    });

    // A task that exists but belongs to someone else is reported as not found,
    // not as forbidden. "Forbidden" would confirm the id is real.
    if (!task) throw new NotFoundException('Task not found');

    const canSeeAll = actor.permissions.includes('AI_TASK_MANAGE');
    if (!canSeeAll && task.userId !== actor.userId) {
      throw new NotFoundException('Task not found');
    }

    return {
      ...toPublicTask(task),
      output: (task.output as Record<string, unknown> | null) ?? null,
    };
  }

  async listAgents(): Promise<PublicAiAgent[]> {
    const agents = await this.prisma.aiAgent.findMany({ orderBy: { key: 'asc' } });
    return agents.map((agent) => ({
      id: agent.id,
      key: agent.key,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      permissions: agent.permissions,
    }));
  }

  async cancelTask(
    taskId: string,
    actor: AuthenticatedActor,
    context: { ipAddress?: string | null; userAgent?: string | null; requestId?: string | null } = {},
  ): Promise<boolean> {
    const task = await this.prisma.aiTask.findUnique({
      where: { id: taskId },
      select: { userId: true, status: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const canManageAll = actor.permissions.includes('AI_TASK_MANAGE');
    if (!canManageAll && task.userId !== actor.userId) {
      // Not yours: reported as missing, so the id is not confirmed to exist.
      throw new NotFoundException('Task not found');
    }
    if (!actor.permissions.includes('AI_TASK_CANCEL') && !canManageAll) {
      throw new ForbiddenException('Access denied');
    }

    const cancellable: AiTaskStatus[] = ['PENDING', 'RUNNING'];
    if (!cancellable.includes(task.status)) return false;

    // Guarded by status in the WHERE clause as well: between the read above and
    // this write the worker may have finished the task, and a cancellation must
    // not overwrite a completed result.
    const result = await this.prisma.aiTask.updateMany({
      where: { id: taskId, status: { in: cancellable } },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    const cancelled = result.count > 0;

    if (cancelled) {
      await this.audit.record({
        actorType: ActorType.USER,
        actorId: actor.userId,
        actorUserId: actor.userId,
        action: 'ai.task.cancel',
        resource: 'ai_task',
        resourceId: taskId,
        outcome: AuditOutcome.SUCCESS,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      });
    }

    return cancelled;
  }
}

type TaskWithAgent = {
  id: string;
  goal: string;
  status: AiTaskStatus;
  attempts: number;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  agent: { key: string } | null;
};

function toPublicTask(task: TaskWithAgent): PublicAiTask {
  return {
    id: task.id,
    goal: task.goal,
    status: task.status,
    agentKey: task.agent?.key ?? null,
    attempts: task.attempts,
    error: task.error,
    createdAt: task.createdAt.toISOString(),
    startedAt: task.startedAt?.toISOString() ?? null,
    finishedAt: task.completedAt?.toISOString() ?? null,
  };
}
