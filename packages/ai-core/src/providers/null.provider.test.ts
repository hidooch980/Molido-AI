import { describe, expect, it } from 'vitest';
import { AI_ERROR_CODE, AIProviderError, isAIProviderError } from '../errors';
import { NullProvider } from './null.provider';

const provider = new NullProvider();

describe('NullProvider', () => {
  it('satisfies the full AIProvider contract', () => {
    for (const method of [
      'generateText',
      'streamText',
      'generateStructuredOutput',
      'healthCheck',
    ] as const) {
      expect(typeof provider[method]).toBe('function');
    }
  });

  it('fails generateText with a controlled, actionable error', async () => {
    await expect(
      provider.generateText({ messages: [{ role: 'user', content: 'hello' }] }),
    ).rejects.toMatchObject({ code: AI_ERROR_CODE.NOT_CONFIGURED, retryable: false });
  });

  it('fails structured output with the same code', async () => {
    await expect(
      provider.generateStructuredOutput({
        messages: [{ role: 'user', content: 'hello' }],
        parse: (value) => value,
        schemaDescription: '{}',
      }),
    ).rejects.toMatchObject({ code: AI_ERROR_CODE.NOT_CONFIGURED });
  });

  it('fails streaming rather than yielding a fabricated chunk', async () => {
    const consume = async (): Promise<string[]> => {
      const chunks: string[] = [];
      for await (const chunk of provider.streamText({
        messages: [{ role: 'user', content: 'hello' }],
      })) {
        chunks.push(chunk);
      }
      return chunks;
    };

    await expect(consume()).rejects.toMatchObject({ code: AI_ERROR_CODE.NOT_CONFIGURED });
  });

  it('reports not_configured instead of claiming to be healthy', async () => {
    const health = await provider.healthCheck();
    expect(health.status).toBe('not_configured');
    expect(health.provider).toBe('null');
    expect(health.detail).toContain('AI_PROVIDER');
  });

  it('produces a client-safe error payload', () => {
    const error = AIProviderError.notConfigured('null');
    expect(isAIProviderError(error)).toBe(true);
    expect(error.toPublicJSON()).toEqual({
      code: 'AI_PROVIDER_NOT_CONFIGURED',
      message: expect.stringContaining('AI_PROVIDER'),
      retryable: false,
    });
    // A public payload must never carry a stack or a cause chain.
    expect(Object.keys(error.toPublicJSON())).toEqual(['code', 'message', 'retryable']);
  });
});
