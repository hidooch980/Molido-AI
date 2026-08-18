import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AiTaskStatus } from '@molido/database';
import type { PublicAiAgent, PublicAiTask } from '@molido/types';
import type { AuthenticatedActor } from '../../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { AiOrchestrator, type OrchestrationRequest } from './ai.orchestrator';

const MAX_TASKS_PER_PAGE = 50;

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
  ) {}

  async createTask(request: OrchestrationRequest): ReturnType<AiOrchestrator['run']> {
    return this.orchestrator.run(request);
  }

  async listTasks(actor: AuthenticatedActor): Promise<PublicAiTask[]> {
    const canSeeAll = actor.permissions.includes('AI_TASK_MANAGE');

    const tasks = await this.prisma.aiTask.findMany({
      where: canSeeAll ? {} : { userId: actor.userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_TASKS_PER_PAGE,
      include: { agent: { select: { key: true } } },
    });

    return tasks.map(toPublicTask);
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

  async cancelTask(taskId: string, actor: AuthenticatedActor): Promise<boolean> {
    const task = await this.prisma.aiTask.findUnique({
      where: { id: taskId },
      select: { userId: true, status: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const canManageAll = actor.permissions.includes('AI_TASK_MANAGE');
    if (!canManageAll && task.userId !== actor.userId) {
      throw new NotFoundException('Task not found');
    }
    if (!actor.permissions.includes('AI_TASK_CANCEL') && !canManageAll) {
      throw new ForbiddenException('Access denied');
    }

    const cancellable: AiTaskStatus[] = ['PENDING', 'RUNNING'];
    if (!cancellable.includes(task.status)) return false;

    const result = await this.prisma.aiTask.updateMany({
      where: { id: taskId, status: { in: cancellable } },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    return result.count > 0;
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
