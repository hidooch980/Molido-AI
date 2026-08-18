import { describe, expect, it, vi } from 'vitest';
import { AI_ERROR_CODE } from '../errors';
import type { AIProvider } from '../types';
import { ResearchAgent } from './research.agent';

const VALID_OUTPUT = {
  objective: 'Understand local versus hosted model trade-offs',
  summary: 'Local models cost nothing per call but need hardware.',
  findings: [
    { claim: 'Local inference has no per-token cost', basis: 'MODEL_KNOWLEDGE', confidence: 'HIGH' },
    { claim: 'Hosted models are easier to scale', basis: 'ASSUMPTION', confidence: 'MEDIUM' },
  ],
  assumptions: ['The reader has capable hardware'],
  uncertainties: ['Current hosted pricing'],
  suggestedNextSteps: ['Benchmark a 7B model'],
};

function stubProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    name: 'stub',
    defaultModel: 'stub-model',
    generateText: vi.fn(),
    streamText: vi.fn(),
    generateStructuredOutput: vi.fn(async ({ parse }) => ({
      data: parse(VALID_OUTPUT),
      raw: JSON.stringify(VALID_OUTPUT),
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

const agent = new ResearchAgent();
const context = { taskId: 'task-1', goal: 'Explain X', configuration: {}, maxOutputTokens: 500 };

describe('ResearchAgent', () => {
  it('requests structured output, never free prose', async () => {
    const provider = stubProvider();
    await agent.execute(provider, context);

    expect(provider.generateStructuredOutput).toHaveBeenCalledOnce();
    expect(provider.generateText).not.toHaveBeenCalled();
  });

  it('tells the model plainly that it cannot browse or cite', async () => {
    const provider = stubProvider();
    await agent.execute(provider, context);

    const call = (
      provider.generateStructuredOutput as unknown as {
        mock: { calls: [{ messages: { role: string; content: string }[] }][] };
      }
    ).mock.calls[0]![0];
    const systemPrompt = call.messages.find((message) => message.role === 'system')!.content;

    expect(systemPrompt).toContain('NO ability to browse');
    expect(systemPrompt).toContain('Never invent a citation');
  });

  it('has no schema field in which a fabricated source could be placed', async () => {
    const result = await agent.execute(stubProvider(), context);

    // Structural, not a rule someone has to remember: there is nowhere to put
    // a citation the agent could not have verified.
    expect(Object.keys(result.output)).not.toContain('sources');
    expect(Object.keys(result.output)).toContain('uncertainties');
  });

  it('labels every finding as model knowledge or assumption', async () => {
    const result = await agent.execute(stubProvider(), context);
    const findings = (result.output as { findings: { basis: string }[] }).findings;

    expect(findings.every((f) => ['MODEL_KNOWLEDGE', 'ASSUMPTION'].includes(f.basis))).toBe(true);
  });

  it('rejects output that smuggles a citation into a claim', async () => {
    const provider = stubProvider({
      generateStructuredOutput: vi.fn(async ({ parse }) => ({
        data: parse({
          ...VALID_OUTPUT,
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

    await expect(agent.execute(provider, context)).rejects.toMatchObject({
      code: AI_ERROR_CODE.INVALID_OUTPUT,
    });
  });

  it('rejects output that violates the schema rather than persisting it', async () => {
    const provider = stubProvider({
      generateStructuredOutput: vi.fn(async ({ parse }) => {
        parse({ summary: 'fluent, plausible, and structurally wrong' });
        throw new Error('unreachable');
      }),
    } as Partial<AIProvider>);

    await expect(agent.execute(provider, context)).rejects.toThrow();
  });

  it('honours the configured temperature and token ceiling', async () => {
    const provider = stubProvider();
    await agent.execute(provider, {
      ...context,
      configuration: { temperature: 0.7 },
      maxOutputTokens: 123,
    });

    const call = (
      provider.generateStructuredOutput as unknown as {
        mock: { calls: [{ temperature: number; maxOutputTokens: number }][] };
      }
    ).mock.calls[0]![0];

    expect(call.temperature).toBe(0.7);
    expect(call.maxOutputTokens).toBe(123);
  });

  it('reports the tokens it consumed', async () => {
    const result = await agent.execute(stubProvider(), context);
    expect(result.tokensUsed).toBe(300);
  });

  it('surfaces a missing provider as a controlled error', async () => {
    const { NullProvider } = await import('../providers/null.provider');
    await expect(agent.execute(new NullProvider(), context)).rejects.toMatchObject({
      code: AI_ERROR_CODE.NOT_CONFIGURED,
    });
  });
});
