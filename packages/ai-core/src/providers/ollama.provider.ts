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

export interface OllamaOptions {
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
}

interface OllamaChatResponse {
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  model?: string;
}

/**
 * Adapter for a locally hosted Ollama runtime.
 *
 * This is the provider that keeps the zero-cost policy real: it runs on the
 * developer's own machine, needs no account, no key and no credit card, and it
 * is the reason "add AI" does not have to mean "start paying a vendor".
 */
export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  readonly defaultModel: string;

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: OllamaOptions) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
    this.defaultModel = options.model;
    // Local models on modest hardware are slow; a short timeout would report
    // healthy backends as broken.
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async generateText(request: AIRequest): Promise<AIResponse> {
    const startedAt = Date.now();
    const model = request.model ?? this.defaultModel;

    const payload = (await postJson({
      url: `${this.baseUrl}/api/chat`,
      provider: this.name,
      timeoutMs: this.timeoutMs,
      signal: request.signal,
      body: {
        model,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        stream: false,
        options: {
          temperature: request.temperature ?? 0.2,
          num_predict: request.maxOutputTokens ?? 1024,
        },
      },
    })) as OllamaChatResponse;

    const text = payload.message?.content;
    if (typeof text !== 'string') {
      throw new AIProviderError({
        code: AI_ERROR_CODE.INVALID_OUTPUT,
        message: 'Local model returned a response with no message content',
        provider: this.name,
        retryable: true,
      });
    }

    const inputTokens = payload.prompt_eval_count ?? estimateTokens(
      request.messages.map((m) => m.content).join(' '),
    );
    const outputTokens = payload.eval_count ?? estimateTokens(text);

    return {
      text,
      model: payload.model ?? model,
      provider: this.name,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      latencyMs: Date.now() - startedAt,
      finishReason: payload.done_reason === 'length' ? 'length' : 'stop',
    };
  }

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
        message: 'Local model did not return parseable JSON',
        provider: this.name,
        retryable: true,
      });
    }

    let data: T;
    try {
      data = request.parse(JSON.parse(json));
    } catch (error) {
      throw new AIProviderError({
        code: AI_ERROR_CODE.INVALID_OUTPUT,
        message: 'Local model output did not match the required schema',
        provider: this.name,
        retryable: true,
        cause: error,
      });
    }

    const { text, ...rest } = response;
    return { ...rest, data, raw: text };
  }

  async healthCheck(): Promise<AIProviderHealth> {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        return {
          status: 'down',
          provider: this.name,
          model: this.defaultModel,
          detail: `runtime returned HTTP ${response.status}`,
        };
      }
      return {
        status: 'ok',
        provider: this.name,
        model: this.defaultModel,
        latencyMs: Date.now() - startedAt,
      };
    } catch {
      return {
        status: 'down',
        provider: this.name,
        model: this.defaultModel,
        latencyMs: Date.now() - startedAt,
        detail: 'local runtime unreachable',
      };
    }
  }
}
