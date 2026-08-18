import { AIProviderError } from '../errors';
import type {
  AIProvider,
  AIProviderHealth,
  AIRequest,
  AIResponse,
  AIStructuredRequest,
  AIStructuredResponse,
} from '../types';

/**
 * The provider used when none is configured.
 *
 * It is a real implementation of the interface, not a stub that returns fake
 * answers: every generation method fails with AI_PROVIDER_NOT_CONFIGURED, and
 * `healthCheck` reports `not_configured` rather than pretending to be healthy.
 *
 * This is what lets MOLIDO boot, serve, and tell the truth on the status page
 * with no AI backend at all — and it guarantees that a misconfigured deployment
 * produces a clear error instead of a plausible hallucination.
 */
export class NullProvider implements AIProvider {
  readonly name = 'null';
  readonly defaultModel = 'none';

  async generateText(_request: AIRequest): Promise<AIResponse> {
    throw AIProviderError.notConfigured(this.name);
  }

  // eslint-disable-next-line require-yield
  async *streamText(_request: AIRequest): AsyncIterable<string> {
    throw AIProviderError.notConfigured(this.name);
  }

  async generateStructuredOutput<T>(
    _request: AIStructuredRequest<T>,
  ): Promise<AIStructuredResponse<T>> {
    throw AIProviderError.notConfigured(this.name);
  }

  async healthCheck(): Promise<AIProviderHealth> {
    return {
      status: 'not_configured',
      provider: this.name,
      detail: 'No AI provider configured. Set AI_PROVIDER and AI_MODEL to enable AI features.',
    };
  }
}
