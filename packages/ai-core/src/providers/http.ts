import { AI_ERROR_CODE, AIProviderError } from '../errors';

export interface HttpCallOptions {
  url: string;
  body: unknown;
  apiKey?: string;
  provider: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

/**
 * Shared JSON POST used by the HTTP-backed adapters.
 *
 * Two things matter here. First, every call is bounded by a timeout — a provider
 * that never answers must not be able to hold a worker forever. Second, the
 * error mapping is centralised, so "429 means retry later" is decided once
 * rather than in each adapter.
 */
export async function postJson(options: HttpCallOptions): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  // Honour a caller-supplied signal as well as our own deadline.
  const onExternalAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await fetch(options.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
      },
      body: JSON.stringify(options.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      // The vendor's error body is not propagated: it can echo the request,
      // and with it the prompt and sometimes the key.
      throw new AIProviderError({
        code: mapStatusToCode(response.status),
        message: `AI provider returned HTTP ${response.status}`,
        provider: options.provider,
        retryable: response.status === 429 || response.status >= 500,
        statusCode: response.status,
      });
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AIProviderError) throw error;

    if (error instanceof Error && error.name === 'AbortError') {
      throw new AIProviderError({
        code: AI_ERROR_CODE.TIMEOUT,
        message: `AI provider did not respond within ${options.timeoutMs}ms`,
        provider: options.provider,
        retryable: true,
        cause: error,
      });
    }

    throw new AIProviderError({
      code: AI_ERROR_CODE.UNAVAILABLE,
      message: 'AI provider is unreachable',
      provider: options.provider,
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

function mapStatusToCode(status: number): AIProviderError['code'] {
  if (status === 429) return AI_ERROR_CODE.RATE_LIMITED;
  if (status === 400 || status === 422) return AI_ERROR_CODE.INVALID_REQUEST;
  if (status === 401 || status === 403) return AI_ERROR_CODE.NOT_CONFIGURED;
  if (status >= 500) return AI_ERROR_CODE.UNAVAILABLE;
  return AI_ERROR_CODE.UNKNOWN;
}

/** Pull the first JSON object or array out of a model's prose reply. */
export function extractJson(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();

  const firstBrace = candidate.search(/[[{]/);
  if (firstBrace === -1) return null;

  const opening = candidate[firstBrace];
  const closing = opening === '{' ? '}' : ']';
  const lastClose = candidate.lastIndexOf(closing);
  if (lastClose <= firstBrace) return null;

  return candidate.slice(firstBrace, lastClose + 1);
}
