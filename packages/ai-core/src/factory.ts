import { NullProvider } from './providers/null.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider';
import type { AIProvider } from './types';

export type AIProviderName = 'null' | 'ollama' | 'openai-compatible';

export interface AIProviderConfig {
  provider: AIProviderName;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Build the configured provider.
 *
 * The application asks for "the AI provider" and receives something satisfying
 * `AIProvider`. It never learns which one, which is the entire point of the
 * abstraction: adding a vendor means adding a case here and shipping an
 * adapter, with no change anywhere else.
 *
 * An unconfigured or incompletely configured setup resolves to `NullProvider`
 * rather than throwing, so the platform still starts and reports its state
 * honestly.
 */
export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.provider) {
    case 'ollama':
      if (!config.model) return new NullProvider();
      return new OllamaProvider({
        model: config.model,
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
      });

    case 'openai-compatible':
      if (!config.model || !config.baseUrl) return new NullProvider();
      return new OpenAICompatibleProvider({
        model: config.model,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        timeoutMs: config.timeoutMs,
      });

    case 'null':
    default:
      return new NullProvider();
  }
}
