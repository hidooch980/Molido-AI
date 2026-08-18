import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AiAgentStatus, AiTaskStatus, RoleName, SystemMode } from '@molido/database';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { AiQueueService } from '../src/modules/ai/ai-queue.service';
import { createTestApp, resetData, strongPassword, uniqueEmail } from './setup';
import { grantRole, login, registerUser, request } from './helpers';

let app: NestFastifyApplication;
let prisma: PrismaService;
let enqueued: { taskId: string; agentKey: string; userId: string }[];

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);

  // The queue is replaced with a recorder. These tests are about what the API
  // does — validate, authorise, record, enqueue — not about Redis. The worker's
  // own behaviour is covered in `workers/ai-worker`.
  const queue = app.get(AiQueueService);
  vi.spyOn(queue, 'enqueue').mockImplementation(async (job) => {
    enqueued.push(job);
  });
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetData(prisma);
  enqueued = [];
  await prisma.aiAgent.updateMany({
    where: { key: 'research' },
    data: { status: AiAgentStatus.ACTIVE, maxTasksPerHour: 30 },
  });
  await prisma.systemState.upsert({
    where: { id: 1 },
    update: { mode: SystemMode.NORMAL, reason: null },
    create: { id: 1, mode: SystemMode.NORMAL },
  });
});

async function authenticatedUser(): Promise<{ token: string; userId: string }> {
  const user = await registerUser(app, uniqueEmail(), strongPassword());
  return { token: user.accessToken, userId: user.userId };
}

async function founder(): Promise<string> {
  const email = uniqueEmail('founder');
  const password = strongPassword();
  const user = await registerUser(app, email, password);
  await grantRole(app, user.userId, RoleName.FOUNDER);
  return (await login(app, email, password)).accessToken;
}

describe('POST /api/v1/ai/tasks', () => {
  it('records the task and queues it, returning PENDING', async () => {
    const user = await authenticatedUser();

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'Explain decentralised AI.' },
    });

    expect(response.status).toBe(201);
    expect(response.body['status']).toBe(AiTaskStatus.PENDING);
    expect(response.body['output']).toBeNull();

    const taskId = response.body['taskId'] as unknown as string;
    const task = await prisma.aiTask.findUniqueOrThrow({ where: { id: taskId } });

    expect(task.status).toBe(AiTaskStatus.PENDING);
    expect(task.userId).toBe(user.userId);
    expect(task.agentId).not.toBeNull();
    // The row exists before the work does, so a crash leaves a trace.
    expect(enqueued).toEqual([
      expect.objectContaining({ taskId, agentKey: 'research', userId: user.userId }),
    ]);
  });

  it('writes an audit entry for the submission', async () => {
    const user = await authenticatedUser();
    await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'anything at all' },
    });

    const audits = await prisma.auditLog.findMany({ where: { action: 'ai.task.create' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.outcome).toBe('SUCCESS');
    // The goal itself is not duplicated into the audit row.
    expect(JSON.stringify(audits[0]!.metadata)).not.toContain('anything at all');
  });

  it('marks the task FAILED — never silently lost — if it cannot be queued', async () => {
    const queue = app.get(AiQueueService);
    const spy = vi
      .spyOn(queue, 'enqueue')
      .mockRejectedValueOnce(new Error('redis unreachable'));

    const user = await authenticatedUser();
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'anything' },
    });

    expect(response.body['status']).toBe(AiTaskStatus.FAILED);
    expect(response.body['error']).toMatchObject({ code: 'QUEUE_UNAVAILABLE', retryable: true });

    const task = await prisma.aiTask.findUniqueOrThrow({
      where: { id: response.body['taskId'] as unknown as string },
    });
    expect(task.status).toBe(AiTaskStatus.FAILED);
    // The client is told to retry; the internal reason stays server-side.
    expect(response.raw).not.toContain('redis unreachable');

    spy.mockRestore();
  });

  it('rejects an unknown agent at the edge, creating nothing', async () => {
    const user = await authenticatedUser();
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'shell', input: 'rm -rf /' },
    });

    expect(response.status).toBe(400);
    expect(await prisma.aiTask.count()).toBe(0);
    expect(enqueued).toHaveLength(0);
  });

  it('requires authentication', async () => {
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      payload: { agent: 'research', input: 'anything' },
    });
    expect(response.status).toBe(401);
  });
});

describe('orchestrator guards', () => {
  it('refuses to queue work for a disabled agent', async () => {
    await prisma.aiAgent.updateMany({
      where: { key: 'research' },
      data: { status: AiAgentStatus.DISABLED },
    });
    const user = await authenticatedUser();

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'anything' },
    });

    expect(response.status).toBe(403);
    expect(await prisma.aiTask.count()).toBe(0);
  });

  it('refuses a suspended user holding a still-valid token', async () => {
    const email = uniqueEmail();
    const user = await registerUser(app, email, strongPassword());
    await prisma.user.update({ where: { email }, data: { status: 'SUSPENDED' } });

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.accessToken,
      payload: { agent: 'research', input: 'anything' },
    });

    expect(response.status).toBe(401);
    expect(await prisma.aiTask.count()).toBe(0);
  });

  it("enforces the agent's hourly budget", async () => {
    await prisma.aiAgent.updateMany({ where: { key: 'research' }, data: { maxTasksPerHour: 2 } });
    const user = await authenticatedUser();

    for (let i = 0; i < 2; i += 1) {
      const accepted = await request(app, {
        method: 'POST',
        url: '/api/v1/ai/tasks',
        token: user.token,
        payload: { agent: 'research', input: `request ${i}` },
      });
      expect(accepted.body['status']).toBe(AiTaskStatus.PENDING);
    }

    const overBudget = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'one too many' },
    });
    expect(overBudget.status).toBe(403);
  });
});

describe('emergency pause', () => {
  it('refuses new tasks while paused, and explains why', async () => {
    await prisma.systemState.update({
      where: { id: 1 },
      data: { mode: SystemMode.PAUSED, reason: 'Investigating unusual activity' },
    });
    const user = await authenticatedUser();

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'anything' },
    });

    expect(response.status).toBe(503);
    expect(String(response.body['message'])).toContain('Investigating unusual activity');
    // Nothing is created, and nothing is queued.
    expect(await prisma.aiTask.count()).toBe(0);
    expect(enqueued).toHaveLength(0);
  });

  it('does not destroy work that is already queued or running', async () => {
    const user = await authenticatedUser();
    const created = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'in flight' },
    });
    const taskId = created.body['taskId'] as unknown as string;

    const token = await founder();
    await request(app, {
      method: 'POST',
      url: '/api/v1/founder/pause',
      token,
      payload: { reason: 'incident' },
    });

    // The in-flight task is untouched: a pause stops intake, it does not
    // discard a user's work.
    const task = await prisma.aiTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.status).toBe(AiTaskStatus.PENDING);
  });

  it('accepts tasks again after resuming', async () => {
    const token = await founder();
    await request(app, { method: 'POST', url: '/api/v1/founder/pause', token, payload: {} });
    await request(app, { method: 'POST', url: '/api/v1/founder/resume', token });

    const user = await authenticatedUser();
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'after resume' },
    });
    expect(response.body['status']).toBe(AiTaskStatus.PENDING);
  });

  it('records who paused the system', async () => {
    const token = await founder();
    await request(app, {
      method: 'POST',
      url: '/api/v1/founder/pause',
      token,
      payload: { reason: 'incident' },
    });

    const audits = await prisma.auditLog.findMany({ where: { action: 'system.pause' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorUserId).not.toBeNull();
  });
});

describe('task visibility and cancellation', () => {
  it("does not let a user read another user's task", async () => {
    const owner = await authenticatedUser();
    const other = await authenticatedUser();

    const created = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: owner.token,
      payload: { agent: 'research', input: 'private research' },
    });
    const taskId = created.body['taskId'] as unknown as string;

    const foreign = await request(app, {
      method: 'GET',
      url: `/api/v1/ai/tasks/${taskId}`,
      token: other.token,
    });

    // 404, not 403 — "forbidden" would confirm the id is real.
    expect(foreign.status).toBe(404);
    expect(foreign.raw).not.toContain('private research');
  });

  it('paginates a task list and reports the true total', async () => {
    const user = await authenticatedUser();
    for (let i = 0; i < 3; i += 1) {
      await request(app, {
        method: 'POST',
        url: '/api/v1/ai/tasks',
        token: user.token,
        payload: { agent: 'research', input: `goal ${i}` },
      });
    }

    const firstPage = await request(app, {
      method: 'GET',
      url: '/api/v1/ai/tasks?page=1&pageSize=2',
      token: user.token,
    });

    expect(firstPage.body['total']).toBe(3);
    expect(firstPage.body['totalPages']).toBe(2);
    expect(firstPage.body['items'] as unknown as unknown[]).toHaveLength(2);
  });

  it('lists only your own tasks', async () => {
    const owner = await authenticatedUser();
    const other = await authenticatedUser();
    await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: owner.token,
      payload: { agent: 'research', input: 'mine' },
    });

    const otherList = await request(app, {
      method: 'GET',
      url: '/api/v1/ai/tasks',
      token: other.token,
    });
    expect(otherList.body['total']).toBe(0);
  });

  it('cancels a pending task and audits it', async () => {
    const user = await authenticatedUser();
    const created = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'to be cancelled' },
    });
    const taskId = created.body['taskId'] as unknown as string;

    const cancelled = await request(app, {
      method: 'POST',
      url: `/api/v1/ai/tasks/${taskId}/cancel`,
      token: user.token,
    });

    expect(cancelled.body['cancelled']).toBe(true);
    const task = await prisma.aiTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.status).toBe(AiTaskStatus.CANCELLED);

    const audits = await prisma.auditLog.findMany({ where: { action: 'ai.task.cancel' } });
    expect(audits).toHaveLength(1);
  });

  it('will not cancel a task that has already finished', async () => {
    const user = await authenticatedUser();
    const created = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'already done' },
    });
    const taskId = created.body['taskId'] as unknown as string;
    await prisma.aiTask.update({
      where: { id: taskId },
      data: { status: AiTaskStatus.COMPLETED, completedAt: new Date() },
    });

    const response = await request(app, {
      method: 'POST',
      url: `/api/v1/ai/tasks/${taskId}/cancel`,
      token: user.token,
    });

    // Reported honestly as "nothing was cancelled" rather than a false success.
    expect(response.body['cancelled']).toBe(false);
  });

  it("cannot cancel another user's task", async () => {
    const owner = await authenticatedUser();
    const attacker = await authenticatedUser();
    const created = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: owner.token,
      payload: { agent: 'research', input: 'not yours' },
    });
    const taskId = created.body['taskId'] as unknown as string;

    const response = await request(app, {
      method: 'POST',
      url: `/api/v1/ai/tasks/${taskId}/cancel`,
      token: attacker.token,
    });

    expect(response.status).toBe(404);
    const task = await prisma.aiTask.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.status).toBe(AiTaskStatus.PENDING);
  });
});

describe('agent registry', () => {
  it('shows the research agent holding a single, narrow permission', async () => {
    const token = await founder();
    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/ai/agents',
      token,
    });

    const agents = response.body as unknown as { key: string; permissions: string[] }[];
    const research = agents.find((agent) => agent.key === 'research')!;

    expect(research.permissions).toEqual(['AI_TASK_READ']);
    for (const forbidden of ['SYSTEM_MANAGE', 'USER_MANAGE', 'APPROVE_HIGH_RISK']) {
      expect(research.permissions).not.toContain(forbidden);
    }
  });
});
