import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_ERROR_CODE } from '../errors';
import { extractJson } from './http';
import { OpenAICompatibleProvider } from './openai-compatible.provider';

function mockFetch(response: unknown, init: { ok?: boolean; status?: number } = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => response,
    })),
  );
}

const provider = new OpenAICompatibleProvider({
  baseUrl: 'https://gateway.example/v1/',
  apiKey: 'sk-test-key',
  model: 'test-model',
  timeoutMs: 1000,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAICompatibleProvider', () => {
  it('returns text and usage from a well-formed reply', async () => {
    mockFetch({
      model: 'test-model',
      choices: [{ message: { content: 'hello world' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
    });

    const response = await provider.generateText({
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(response.text).toBe('hello world');
    expect(response.provider).toBe('openai-compatible');
    expect(response.usage).toEqual({ inputTokens: 12, outputTokens: 3, totalTokens: 15 });
    expect(response.finishReason).toBe('stop');
    expect(response.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('estimates usage when the provider omits it, rather than reporting zero', async () => {
    mockFetch({ choices: [{ message: { content: 'some output text' } }] });
    const response = await provider.generateText({
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(response.usage.totalTokens).toBeGreaterThan(0);
  });

  it('normalises the base URL so a trailing slash cannot double up', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'x' } }] }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await provider.generateText({ messages: [{ role: 'user', content: 'hi' }] });

    expect(fetchMock.mock.calls[0]![0]).toBe('https://gateway.example/v1/chat/completions');
  });

  it('maps 429 to a retryable rate-limit error', async () => {
    mockFetch({}, { ok: false, status: 429 });
    await expect(
      provider.generateText({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: AI_ERROR_CODE.RATE_LIMITED, retryable: true });
  });

  it('maps 5xx to a retryable unavailable error', async () => {
    mockFetch({}, { ok: false, status: 503 });
    await expect(
      provider.generateText({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: AI_ERROR_CODE.UNAVAILABLE, retryable: true });
  });

  it('maps 401 to not-configured and does not invite a retry', async () => {
    mockFetch({}, { ok: false, status: 401 });
    await expect(
      provider.generateText({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: AI_ERROR_CODE.NOT_CONFIGURED, retryable: false });
  });

  it('never leaks the API key in an error', async () => {
    mockFetch({ error: 'bad key sk-test-key' }, { ok: false, status: 401 });
    try {
      await provider.generateText({ messages: [{ role: 'user', content: 'hi' }] });
      expect.unreachable('expected the call to fail');
    } catch (error) {
      expect(JSON.stringify({ message: (error as Error).message })).not.toContain('sk-test-key');
    }
  });

  it('rejects a reply with no message content instead of inventing one', async () => {
    mockFetch({ choices: [] });
    await expect(
      provider.generateText({ messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: AI_ERROR_CODE.INVALID_OUTPUT });
  });

  it('parses and validates structured output', async () => {
    mockFetch({ choices: [{ message: { content: '```json\n{"answer":"42"}\n```' } }] });

    const result = await provider.generateStructuredOutput<{ answer: string }>({
      messages: [{ role: 'user', content: 'the answer?' }],
      schemaDescription: '{ answer: string }',
      parse: (value) => {
        const candidate = value as { answer?: unknown };
        if (typeof candidate.answer !== 'string') throw new Error('answer must be a string');
        return { answer: candidate.answer };
      },
    });

    expect(result.data).toEqual({ answer: '42' });
    expect(result.raw).toContain('42');
  });

  it('fails loudly when structured output violates the schema', async () => {
    mockFetch({ choices: [{ message: { content: '{"answer": 42}' } }] });

    await expect(
      provider.generateStructuredOutput<{ answer: string }>({
        messages: [{ role: 'user', content: 'the answer?' }],
        schemaDescription: '{ answer: string }',
        parse: (value) => {
          const candidate = value as { answer?: unknown };
          if (typeof candidate.answer !== 'string') throw new Error('answer must be a string');
          return { answer: candidate.answer };
        },
      }),
    ).rejects.toMatchObject({ code: AI_ERROR_CODE.INVALID_OUTPUT });
  });

  it('reports down — not healthy — when the backend is failing', async () => {
    mockFetch({}, { ok: false, status: 500 });
    const health = await provider.healthCheck();
    expect(health.status).toBe('down');
  });
});

describe('extractJson', () => {
  it('pulls JSON out of a fenced block', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('pulls JSON out of surrounding prose', () => {
    expect(extractJson('Sure! {"a":1} Hope that helps.')).toBe('{"a":1}');
  });

  it('handles arrays', () => {
    expect(extractJson('[1,2,3]')).toBe('[1,2,3]');
  });

  it('returns null when there is no JSON at all', () => {
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('')).toBeNull();
  });
});
