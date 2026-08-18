import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AiAgentStatus, AiTaskStatus, RoleName } from '@molido/database';
import { AI_ERROR_CODE, AIProviderError, type AIProvider } from '@molido/ai-core';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { AiProviderService } from '../src/modules/ai/ai.provider';
import { ResearchAgent } from '../src/modules/ai/agents/research.agent';
import { createTestApp, resetData, strongPassword, uniqueEmail } from './setup';
import { grantRole, login, registerUser, request } from './helpers';

let app: NestFastifyApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetData(prisma);
  await prisma.aiAgent.updateMany({
    where: { key: 'research' },
    data: { status: AiAgentStatus.ACTIVE, maxTasksPerHour: 30 },
  });
});

const VALID_RESEARCH_OUTPUT = {
  objective: 'Understand local versus hosted model trade-offs',
  summary: 'Local models cost nothing per call but need hardware.',
  findings: [
    { claim: 'Local inference has no per-token cost', basis: 'MODEL_KNOWLEDGE', confidence: 'HIGH' },
    { claim: 'Hosted models are easier to scale', basis: 'ASSUMPTION', confidence: 'MEDIUM' },
  ],
  assumptions: ['The reader has a machine capable of running a small model'],
  uncertainties: ['Current pricing of specific hosted providers'],
  suggestedNextSteps: ['Benchmark a 7B model on the target hardware'],
};

/** A provider that returns exactly what the test dictates. */
function stubProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    name: 'stub',
    defaultModel: 'stub-model',
    generateText: vi.fn(),
    streamText: vi.fn(),
    generateStructuredOutput: vi.fn(async ({ parse }) => ({
      data: parse(VALID_RESEARCH_OUTPUT),
      raw: JSON.stringify(VALID_RESEARCH_OUTPUT),
      model: 'stub-model',
      provider: 'stub',
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      latencyMs: 5,
      finishReason: 'stop' as const,
    })),
    healthCheck: vi.fn(async () => ({ status: 'ok' as const, provider: 'stub' })),
    ...overrides,
  } as AIProvider;
}

/** Swap the live provider for the duration of one test. */
function useProvider(provider: AIProvider): void {
  const service = app.get(AiProviderService);
  Object.defineProperty(service, 'provider', { value: provider, configurable: true });
}

async function authenticatedUser(): Promise<{ token: string; userId: string }> {
  const email = uniqueEmail();
  const password = strongPassword();
  const user = await registerUser(app, email, password);
  return { token: user.accessToken, userId: user.userId };
}

describe('POST /api/v1/ai/tasks — no provider configured', () => {
  it('returns a controlled error rather than crashing or inventing an answer', async () => {
    const user = await authenticatedUser();

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'Explain decentralised AI.' },
    });

    expect(response.status).toBe(201);
    expect(response.body['status']).toBe(AiTaskStatus.FAILED);
    expect(response.body['output']).toBeNull();
    expect(response.body['error']).toMatchObject({
      code: AI_ERROR_CODE.NOT_CONFIGURED,
      retryable: false,
    });
  });

  it('still records the task, so a failure is never silent', async () => {
    const user = await authenticatedUser();
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'Explain decentralised AI.' },
    });

    const task = await prisma.aiTask.findUniqueOrThrow({
      where: { id: response.body['taskId'] as unknown as string },
    });
    expect(task.status).toBe(AiTaskStatus.FAILED);
    expect(task.error).toContain(AI_ERROR_CODE.NOT_CONFIGURED);
    expect(task.userId).toBe(user.userId);
    expect(task.agentId).not.toBeNull();
  });

  it('keeps the API itself healthy', async () => {
    const health = await request(app, { method: 'GET', url: '/api/v1/health/detailed' });
    expect(health.status).toBe(200);
    // Honest reporting: disabled, not "ok", and not "down" either.
    expect((health.body as unknown as { components: { ai: { status: string } } }).components.ai
      .status).toBe('disabled');
  });
});

describe('POST /api/v1/ai/tasks — with a provider', () => {
  it('completes a task and persists the structured output', async () => {
    useProvider(stubProvider());
    const user = await authenticatedUser();

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'Local versus hosted models?' },
    });

    expect(response.body['status']).toBe(AiTaskStatus.COMPLETED);
    const output = response.body['output'] as unknown as typeof VALID_RESEARCH_OUTPUT;
    expect(output.findings).toHaveLength(2);
    expect(output.findings.every((f) => ['MODEL_KNOWLEDGE', 'ASSUMPTION'].includes(f.basis))).toBe(
      true,
    );

    const task = await prisma.aiTask.findUniqueOrThrow({
      where: { id: response.body['taskId'] as unknown as string },
    });
    expect(task.tokensUsed).toBe(300);
    expect(task.completedAt).not.toBeNull();
  });

  it('writes an audit entry for every execution', async () => {
    useProvider(stubProvider());
    const user = await authenticatedUser();

    await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'Local versus hosted models?' },
    });

    const audits = await prisma.auditLog.findMany({ where: { action: 'ai.task.execute' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.outcome).toBe('SUCCESS');
    expect(audits[0]!.actorUserId).toBe(user.userId);
  });

  it('fails the task when the model returns output that violates the schema', async () => {
    useProvider(
      stubProvider({
        generateStructuredOutput: vi.fn(async ({ parse }) => {
          // Fluent, plausible, and structurally wrong.
          parse({ summary: 'looks fine but has no objective or findings' });
          throw new Error('unreachable');
        }),
      } as Partial<AIProvider>),
    );
    const user = await authenticatedUser();

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'anything' },
    });

    expect(response.body['status']).toBe(AiTaskStatus.FAILED);
    expect(response.body['output']).toBeNull();
  });

  it('surfaces a provider outage as a retryable error', async () => {
    useProvider(
      stubProvider({
        generateStructuredOutput: vi.fn(async () => {
          throw new AIProviderError({
            code: AI_ERROR_CODE.UNAVAILABLE,
            message: 'AI provider is unreachable',
            provider: 'stub',
            retryable: true,
          });
        }),
      } as Partial<AIProvider>),
    );
    const user = await authenticatedUser();

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'anything' },
    });

    expect(response.body['error']).toMatchObject({
      code: AI_ERROR_CODE.UNAVAILABLE,
      retryable: true,
    });
  });

  it('reduces an unexpected internal error to a generic code', async () => {
    useProvider(
      stubProvider({
        generateStructuredOutput: vi.fn(async () => {
          throw new Error('connect ECONNREFUSED 10.0.0.5:5432 /home/app/secrets.env');
        }),
      } as Partial<AIProvider>),
    );
    const user = await authenticatedUser();

    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'anything' },
    });

    expect(response.body['error']).toMatchObject({ code: AI_ERROR_CODE.UNKNOWN });
    expect(response.raw).not.toContain('ECONNREFUSED');
    expect(response.raw).not.toContain('/home/app');
  });
});

describe('orchestrator guards', () => {
  it('refuses to run a disabled agent', async () => {
    useProvider(stubProvider());
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

  it('refuses a suspended user even with a still-valid token', async () => {
    useProvider(stubProvider());
    const email = uniqueEmail();
    const password = strongPassword();
    const user = await registerUser(app, email, password);
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
    useProvider(stubProvider());
    await prisma.aiAgent.updateMany({ where: { key: 'research' }, data: { maxTasksPerHour: 2 } });
    const user = await authenticatedUser();

    for (let i = 0; i < 2; i += 1) {
      const ok = await request(app, {
        method: 'POST',
        url: '/api/v1/ai/tasks',
        token: user.token,
        payload: { agent: 'research', input: `request ${i}` },
      });
      expect(ok.body['status']).toBe(AiTaskStatus.COMPLETED);
    }

    const overBudget = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'research', input: 'one too many' },
    });
    expect(overBudget.status).toBe(403);
  });

  it('rejects an unknown agent at the edge', async () => {
    const user = await authenticatedUser();
    const response = await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: user.token,
      payload: { agent: 'shell', input: 'rm -rf /' },
    });

    expect(response.status).toBe(400);
    expect(await prisma.aiTask.count()).toBe(0);
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

describe('task visibility', () => {
  it("does not let a user read another user's task", async () => {
    useProvider(stubProvider());
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

  it('lists only your own tasks', async () => {
    useProvider(stubProvider());
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
    expect(otherList.body as unknown as unknown[]).toHaveLength(0);

    const ownerList = await request(app, {
      method: 'GET',
      url: '/api/v1/ai/tasks',
      token: owner.token,
    });
    expect(ownerList.body as unknown as unknown[]).toHaveLength(1);
  });

  it('lets an admin with AI_TASK_MANAGE see every task', async () => {
    useProvider(stubProvider());
    const owner = await authenticatedUser();
    await request(app, {
      method: 'POST',
      url: '/api/v1/ai/tasks',
      token: owner.token,
      payload: { agent: 'research', input: 'mine' },
    });

    const email = uniqueEmail('admin');
    const password = strongPassword();
    const admin = await registerUser(app, email, password);
    await grantRole(app, admin.userId, RoleName.ADMIN);
    const elevated = await login(app, email, password);

    const list = await request(app, {
      method: 'GET',
      url: '/api/v1/ai/tasks',
      token: elevated.accessToken,
    });
    expect(list.body as unknown as unknown[]).toHaveLength(1);
  });
});

describe('ResearchAgent', () => {
  const agent = new ResearchAgent();

  it('asks the provider for structured output, never free prose', async () => {
    const provider = stubProvider();
    await agent.execute(provider, {
      taskId: 'task-1',
      goal: 'Explain X',
      configuration: { temperature: 0.1 },
      maxOutputTokens: 500,
    });

    expect(provider.generateStructuredOutput).toHaveBeenCalledOnce();
    expect(provider.generateText).not.toHaveBeenCalled();
  });

  it('tells the model plainly that it cannot browse', async () => {
    const provider = stubProvider();
    await agent.execute(provider, {
      taskId: 'task-1',
      goal: 'Explain X',
      configuration: {},
      maxOutputTokens: 500,
    });

    const call = (provider.generateStructuredOutput as unknown as { mock: { calls: [{ messages: { role: string; content: string }[] }][] } })
      .mock.calls[0]![0];
    const systemPrompt = call.messages.find((m) => m.role === 'system')!.content;

    expect(systemPrompt).toContain('NO ability to browse');
    expect(systemPrompt).toContain('Never invent a citation');
  });

  it('has no field in which to place a fabricated source', async () => {
    const provider = stubProvider();
    const result = await agent.execute(provider, {
      taskId: 'task-1',
      goal: 'Explain X',
      configuration: {},
      maxOutputTokens: 500,
    });

    // The schema simply has no `sources` key — fabrication has nowhere to go.
    expect(Object.keys(result.output)).not.toContain('sources');
    expect(Object.keys(result.output)).toContain('uncertainties');
  });

  it('rejects output that smuggles a citation into a claim', async () => {
    const provider = stubProvider({
      generateStructuredOutput: vi.fn(async ({ parse }) => ({
        data: parse({
          ...VALID_RESEARCH_OUTPUT,
          findings: [
            {
              claim: 'According to a study at https://example.com/paper, X is true',
              basis: 'MODEL_KNOWLEDGE',
              confidence: 'HIGH',
            },
          ],
        }),
        raw: '{}',
        model: 'stub-model',
        provider: 'stub',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        latencyMs: 1,
        finishReason: 'stop' as const,
      })),
    } as Partial<AIProvider>);

    await expect(
      agent.execute(provider, {
        taskId: 'task-1',
        goal: 'Explain X',
        configuration: {},
        maxOutputTokens: 500,
      }),
    ).rejects.toMatchObject({ code: AI_ERROR_CODE.INVALID_OUTPUT });
  });

  it('reports the tokens it consumed', async () => {
    const result = await agent.execute(stubProvider(), {
      taskId: 'task-1',
      goal: 'Explain X',
      configuration: {},
      maxOutputTokens: 500,
    });
    expect(result.tokensUsed).toBe(300);
  });
});

describe('agent registry', () => {
  it('shows the research agent holding a single, narrow permission', async () => {
    const email = uniqueEmail('admin');
    const password = strongPassword();
    const admin = await registerUser(app, email, password);
    await grantRole(app, admin.userId, RoleName.ADMIN);
    const elevated = await login(app, email, password);

    const response = await request(app, {
      method: 'GET',
      url: '/api/v1/ai/agents',
      token: elevated.accessToken,
    });

    const agents = response.body as unknown as { key: string; permissions: string[] }[];
    const research = agents.find((a) => a.key === 'research')!;

    expect(research.permissions).toEqual(['AI_TASK_READ']);
    // Explicitly none of the dangerous capabilities.
    for (const forbidden of ['SYSTEM_MANAGE', 'USER_MANAGE', 'APPROVE_HIGH_RISK']) {
      expect(research.permissions).not.toContain(forbidden);
    }
  });
});
