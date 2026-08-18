/**
 * The vocabulary every AI provider speaks.
 *
 * Deliberately the intersection of what real providers offer, not the union.
 * Anything vendor-specific stays behind its adapter, so swapping providers is a
 * configuration change rather than a rewrite.
 */

export type AIRole = 'system' | 'user' | 'assistant';

export interface AIMessage {
  role: AIRole;
  content: string;
}

export interface AIRequest {
  messages: AIMessage[];
  model?: string;
  /** 0 = deterministic. Research work should sit near the bottom of the range. */
  temperature?: number;
  maxOutputTokens?: number;
  /** Abort signal so a hung provider cannot pin a worker indefinitely. */
  signal?: AbortSignal;
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AIResponse {
  text: string;
  model: string;
  provider: string;
  usage: AIUsage;
  /** Wall-clock duration of the call, in milliseconds. */
  latencyMs: number;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error' | 'unknown';
}

export interface AIStructuredRequest<T> extends AIRequest {
  /**
   * Validator for the model's output. Structured generation is only meaningful
   * if something checks the result — an LLM will happily return prose where an
   * object was requested.
   */
  parse: (value: unknown) => T;
  /** Human-readable description of the schema, injected into the prompt. */
  schemaDescription: string;
}

export interface AIStructuredResponse<T> extends Omit<AIResponse, 'text'> {
  data: T;
  /** The raw text the model produced, retained for debugging a parse failure. */
  raw: string;
}

export interface AIProviderHealth {
  status: 'ok' | 'down' | 'not_configured';
  provider: string;
  model?: string;
  latencyMs?: number;
  detail?: string;
}

/**
 * The contract every provider adapter implements.
 *
 * Note what is absent: no vendor client type leaks through, no provider-shaped
 * options object, no "extra" escape hatch. The application depends on this
 * interface and nothing else.
 */
export interface AIProvider {
  readonly name: string;
  readonly defaultModel: string;

  generateText(request: AIRequest): Promise<AIResponse>;

  /** Streams incremental text. Consumers must tolerate zero chunks. */
  streamText(request: AIRequest): AsyncIterable<string>;

  generateStructuredOutput<T>(request: AIStructuredRequest<T>): Promise<AIStructuredResponse<T>>;

  healthCheck(): Promise<AIProviderHealth>;
}
