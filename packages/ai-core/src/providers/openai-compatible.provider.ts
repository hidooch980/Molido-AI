import { AI_ERROR_CODE, AIProviderError } from '../errors';
import type {
  AIProvider,
  AIProviderHealth,
  AIRequest,
  AIResponse,
  AIStructuredRequest,
  AIStructuredResponse,
} from '../types';
import { estimateTokens } from '../usage';
import { extractJson, postJson } from './http';

export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey?: string;
  model: string;
  timeoutMs?: number;
  /** Label used in logs and errors. */
  name?: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model?: string;
}

/**
 * Adapter for any service exposing the OpenAI chat-completions shape.
 *
 * One adapter covers a large family of backends — hosted vendors, self-hosted
 * gateways, local runtimes in compatibility mode — because they converged on
 * the same wire format. The key always arrives through validated configuration
 * and is never written to a log or an error message.
 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  readonly defaultModel: string;

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  /**
   * A true private field, not a TypeScript `private` — the latter is erased at
   * compile time, leaving the key enumerable and therefore serialisable into
   * any log line or error payload that stringifies the provider.
   */
  readonly #apiKey?: string;

  constructor(options: OpenAICompatibleOptions) {
    if (!options.baseUrl) {
      throw new AIProviderError({
        code: AI_ERROR_CODE.NOT_CONFIGURED,
        message: 'An openai-compatible provider requires a base URL',
        provider: options.name ?? 'openai-compatible',
      });
    }
    this.name = options.name ?? 'openai-compatible';
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#apiKey = options.apiKey;
    this.defaultModel = options.model;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async generateText(request: AIRequest): Promise<AIResponse> {
    const startedAt = Date.now();
    const model = request.model ?? this.defaultModel;

    const payload = await postJson({
      url: `${this.baseUrl}/chat/completions`,
      provider: this.name,
      apiKey: this.#apiKey,
      timeoutMs: this.timeoutMs,
      signal: request.signal,
      body: {
        model,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxOutputTokens ?? 1024,
        stream: false,
      },
    });

    const response = payload as ChatCompletionResponse;
    const text = response.choices?.[0]?.message?.content;

    if (typeof text !== 'string') {
      throw new AIProviderError({
        code: AI_ERROR_CODE.INVALID_OUTPUT,
        message: 'AI provider returned a response with no message content',
        provider: this.name,
        retryable: true,
      });
    }

    const promptChars = request.messages.reduce((sum, m) => sum + m.content.length, 0);

    return {
      text,
      model: response.model ?? model,
      provider: this.name,
      usage: {
        // Falls back to an estimate when the provider omits usage, so cost
        // tracking degrades in accuracy rather than disappearing.
        inputTokens: response.usage?.prompt_tokens ?? estimateTokens(String(promptChars)),
        outputTokens: response.usage?.completion_tokens ?? estimateTokens(text),
        totalTokens:
          response.usage?.total_tokens ??
          estimateTokens(String(promptChars)) + estimateTokens(text),
      },
      latencyMs: Date.now() - startedAt,
      finishReason: mapFinishReason(response.choices?.[0]?.finish_reason),
    };
  }

  /**
   * Streaming is exposed through the same interface but implemented as a single
   * chunk for now. Honest and interface-complete; incremental SSE parsing lands
   * with the first UI that actually consumes a stream.
   */
  async *streamText(request: AIRequest): AsyncIterable<string> {
    const response = await this.generateText(request);
    yield response.text;
  }

  async generateStructuredOutput<T>(
    request: AIStructuredRequest<T>,
  ): Promise<AIStructuredResponse<T>> {
    const response = await this.generateText({
      ...request,
      messages: [
        ...request.messages,
        {
          role: 'system',
          content:
            `Reply with a single JSON value and nothing else. No prose, no code fence.\n` +
            `It must match this shape:\n${request.schemaDescription}`,
        },
      ],
    });

    const json = extractJson(response.text);
    if (!json) {
      throw new AIProviderError({
        code: AI_ERROR_CODE.INVALID_OUTPUT,
        message: 'AI provider did not return parseable JSON',
        provider: this.name,
        retryable: true,
      });
    }

    let data: T;
    try {
      data = request.parse(JSON.parse(json));
    } catch (error) {
      // A schema violation is reported as such rather than being coerced into
      // something that merely looks right.
      throw new AIProviderError({
        code: AI_ERROR_CODE.INVALID_OUTPUT,
        message: 'AI provider output did not match the required schema',
        provider: this.name,
        retryable: true,
        cause: error,
      });
    }

    const { text, ...rest } = response;
    return { ...rest, data, raw: text };
  }

  /**
   * Defence in depth alongside the private field: anything that serialises this
   * object gets a credential-free view.
   */
  toJSON(): Record<string, unknown> {
    return {
      provider: this.name,
      model: this.defaultModel,
      baseUrl: this.baseUrl,
      apiKeyConfigured: this.#apiKey !== undefined,
    };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const startedAt = Date.now();
    try {
      await this.generateText({
        messages: [{ role: 'user', content: 'ping' }],
        maxOutputTokens: 1,
      });
      return {
        status: 'ok',
        provider: this.name,
        model: this.defaultModel,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        status: 'down',
        provider: this.name,
        model: this.defaultModel,
        latencyMs: Date.now() - startedAt,
        detail: error instanceof AIProviderError ? error.code : 'unknown error',
      };
    }
  }
}

function mapFinishReason(reason: string | undefined): AIResponse['finishReason'] {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content_filter';
    default:
      return 'unknown';
  }
}
