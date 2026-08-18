import { describe, expect, it, vi } from 'vitest';
import { AI_ERROR_CODE, AIProviderError, type AIProvider } from '@molido/ai-core';
import { processAiTask } from './task-processor';

/** Minimal in-memory stand-ins: these tests are about the decision logic. */
function makeDeps(task: Record<string, unknown> | null, provider?: Partial<AIProvider>) {
  const updates: Record<string, unknown>[] = [];
  const audits: Record<string, unknown>[] = [];

  const prisma = {
    aiTask: {
      findUnique: vi.fn(async () => task),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return {};
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return {};
      }),
    },
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const aiProvider = {
    name: 'stub',
    defaultModel: 'stub',
    generateText: vi.fn(),
    streamText: vi.fn(),
    generateStructuredOutput: vi.fn(async ({ parse }: { parse: (v: unknown) => unknown }) => ({
      data: parse({
        objective: 'o',
        summary: 's',
        findings: [],
        assumptions: [],
        uncertainties: [],
        suggestedNextSteps: [],
      }),
      raw: '{}',
      model: 'stub',
      provider: 'stub',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      latencyMs: 1,
      finishReason: 'stop' as const,
    })),
    healthCheck: vi.fn(),
    ...provider,
  } as unknown as AIProvider;

  return {
    deps: { prisma, provider: aiProvider, logger } as never,
    updates,
    audits,
    prisma,
  };
}

const ACTIVE_AGENT = {
  key: 'research',
  status: 'ACTIVE',
  configuration: {},
  maxTokensPerTask: 1000,
};

const JOB = { taskId: 't1', agentKey: 'research', userId: 'u1' };

describe('processAiTask', () => {
  it('completes a task and stores the validated output', async () => {
    const { deps, updates } = makeDeps({
      id: 't1',
      status: 'PENDING',
      goal: 'Explain X',
      attempts: 0,
      maxAttempts: 3,
      userId: 'u1',
      startedAt: null,
      agent: ACTIVE_AGENT,
    });

    const result = await processAiTask(JOB, deps);

    expect(result.status).toBe('COMPLETED');
    expect(updates.at(-1)).toMatchObject({ status: 'COMPLETED', tokensUsed: 3 });
  });

  it('skips a task the user cancelled before pickup', async () => {
    const { deps, prisma } = makeDeps({
      id: 't1',
      status: 'CANCELLED',
      goal: 'g',
      attempts: 0,
      maxAttempts: 3,
      userId: 'u1',
      agent: ACTIVE_AGENT,
    });

    const result = await processAiTask(JOB, deps);

    expect(result.status).toBe('CANCELLED');
    // A cancelled task must not be resurrected by a queued message.
    expect(prisma.aiTask.update).not.toHaveBeenCalled();
  });

  it('ignores a duplicate delivery of finished work', async () => {
    const { deps, prisma } = makeDeps({
      id: 't1',
      status: 'COMPLETED',
      goal: 'g',
      attempts: 1,
      maxAttempts: 3,
      userId: 'u1',
      agent: ACTIVE_AGENT,
    });

    const result = await processAiTask(JOB, deps);

    expect(result.status).toBe('COMPLETED');
    expect(prisma.aiTask.update).not.toHaveBeenCalled();
  });

  it('drops a job whose task no longer exists', async () => {
    const { deps } = makeDeps(null);
    const result = await processAiTask(JOB, deps);
    expect(result.status).toBe('CANCELLED');
    expect(result.retryable).toBe(false);
  });

  it('fails without retrying when the agent is not active', async () => {
    const { deps, updates } = makeDeps({
      id: 't1',
      status: 'PENDING',
      goal: 'g',
      attempts: 0,
      maxAttempts: 3,
      userId: 'u1',
      agent: { ...ACTIVE_AGENT, status: 'DISABLED' },
    });

    const result = await processAiTask(JOB, deps);

    expect(result).toMatchObject({ status: 'FAILED', retryable: false });
    expect(String(updates.at(-1)?.['error'])).toContain('AGENT_UNAVAILABLE');
  });

  it('retries a transient provider failure while attempts remain', async () => {
    const { deps } = makeDeps(
      {
        id: 't1',
        status: 'PENDING',
        goal: 'g',
        attempts: 0,
        maxAttempts: 3,
        userId: 'u1',
        agent: ACTIVE_AGENT,
      },
      {
        generateStructuredOutput: vi.fn(async () => {
          throw new AIProviderError({
            code: AI_ERROR_CODE.UNAVAILABLE,
            message: 'unreachable',
            provider: 'stub',
            retryable: true,
          });
        }),
      },
    );

    const result = await processAiTask(JOB, deps);
    expect(result).toMatchObject({ status: 'RUNNING', retryable: true });
  });

  it('stops retrying once the attempt ceiling is reached', async () => {
    const { deps, updates } = makeDeps(
      {
        id: 't1',
        status: 'RUNNING',
        goal: 'g',
        // One short of the ceiling: this attempt is the last.
        attempts: 2,
        maxAttempts: 3,
        userId: 'u1',
        agent: ACTIVE_AGENT,
      },
      {
        generateStructuredOutput: vi.fn(async () => {
          throw new AIProviderError({
            code: AI_ERROR_CODE.UNAVAILABLE,
            message: 'unreachable',
            provider: 'stub',
            retryable: true,
          });
        }),
      },
    );

    const result = await processAiTask(JOB, deps);

    // Bounded: a permanently failing task cannot loop forever.
    expect(result).toMatchObject({ status: 'FAILED', retryable: false });
    expect(String(updates.at(-1)?.['error'])).toContain(AI_ERROR_CODE.UNAVAILABLE);
  });

  it('never retries a non-retryable provider error', async () => {
    const { deps } = makeDeps(
      {
        id: 't1',
        status: 'PENDING',
        goal: 'g',
        attempts: 0,
        maxAttempts: 3,
        userId: 'u1',
        agent: ACTIVE_AGENT,
      },
      {
        generateStructuredOutput: vi.fn(async () => {
          throw new AIProviderError({
            code: AI_ERROR_CODE.NOT_CONFIGURED,
            message: 'no provider',
            provider: 'null',
            retryable: false,
          });
        }),
      },
    );

    const result = await processAiTask(JOB, deps);
    expect(result).toMatchObject({ status: 'FAILED', retryable: false });
  });

  it('stores a safe summary, never an internal error message', async () => {
    const { deps, updates } = makeDeps(
      {
        id: 't1',
        status: 'PENDING',
        goal: 'g',
        attempts: 0,
        maxAttempts: 3,
        userId: 'u1',
        agent: ACTIVE_AGENT,
      },
      {
        generateStructuredOutput: vi.fn(async () => {
          throw new Error('connect ECONNREFUSED 10.0.0.5:5432 /home/app/secrets.env');
        }),
      },
    );

    await processAiTask(JOB, deps);

    const stored = String(updates.at(-1)?.['error']);
    expect(stored).toContain(AI_ERROR_CODE.UNKNOWN);
    expect(stored).not.toContain('ECONNREFUSED');
    expect(stored).not.toContain('/home/app');
  });

  it('records an audit entry for the execution', async () => {
    const { deps, audits } = makeDeps({
      id: 't1',
      status: 'PENDING',
      goal: 'g',
      attempts: 0,
      maxAttempts: 3,
      userId: 'u1',
      startedAt: null,
      agent: ACTIVE_AGENT,
    });

    await processAiTask(JOB, deps);

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'ai.task.execute', outcome: 'SUCCESS' });
  });

  it('yields to another worker that already claimed the task', async () => {
    const { deps, prisma } = makeDeps({
      id: 't1',
      status: 'PENDING',
      goal: 'g',
      attempts: 0,
      maxAttempts: 3,
      userId: 'u1',
      agent: ACTIVE_AGENT,
    });
    prisma.aiTask.updateMany = vi.fn(async () => ({ count: 0 }));

    const result = await processAiTask(JOB, deps);

    expect(result.status).toBe('RUNNING');
    expect(result.retryable).toBe(false);
  });
});
