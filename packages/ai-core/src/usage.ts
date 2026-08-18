import type { AIResponse, AIUsage } from './types';

/**
 * One record per provider call, for cost and latency observability.
 *
 * The prompt itself is not stored — only its length. Retaining user prompts by
 * default would turn an ordinary metrics table into a store of personal data.
 */
export interface AIUsageRecord {
  provider: string;
  model: string;
  operation: 'generateText' | 'streamText' | 'generateStructuredOutput' | 'healthCheck';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  status: 'success' | 'error';
  errorCode?: string;
  /** Character count of the prompt. A proxy for size, not the content. */
  promptChars?: number;
}

export const EMPTY_USAGE: AIUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/**
 * Rough token estimate for providers that report no usage of their own.
 *
 * ~4 characters per token is the widely used English approximation. Named
 * `estimate` so no caller mistakes it for a billing-grade number.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function usageFromResponse(response: AIResponse, operation: AIUsageRecord['operation']): AIUsageRecord {
  return {
    provider: response.provider,
    model: response.model,
    operation,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    totalTokens: response.usage.totalTokens,
    latencyMs: response.latencyMs,
    status: 'success',
  };
}
