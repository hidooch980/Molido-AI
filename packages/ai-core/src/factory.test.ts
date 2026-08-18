import { describe, expect, it } from 'vitest';
import { createAIProvider } from './factory';
import { NullProvider } from './providers/null.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenAICompatibleProvider } from './providers/openai-compatible.provider';

describe('createAIProvider', () => {
  it('returns the null provider when nothing is configured', () => {
    expect(createAIProvider({ provider: 'null' })).toBeInstanceOf(NullProvider);
  });

  it('builds a local provider for ollama', () => {
    const provider = createAIProvider({ provider: 'ollama', model: 'llama3.1' });
    expect(provider).toBeInstanceOf(OllamaProvider);
    expect(provider.name).toBe('ollama');
    expect(provider.defaultModel).toBe('llama3.1');
  });

  it('builds an openai-compatible provider when model and base URL are present', () => {
    const provider = createAIProvider({
      provider: 'openai-compatible',
      model: 'some-model',
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'sk-test',
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('degrades to the null provider on incomplete configuration rather than throwing', () => {
    // Half-configured is a real deployment mistake. The platform must still
    // boot and report "AI not configured" instead of crash-looping.
    expect(createAIProvider({ provider: 'ollama' })).toBeInstanceOf(NullProvider);
    expect(createAIProvider({ provider: 'openai-compatible', model: 'm' })).toBeInstanceOf(
      NullProvider,
    );
    expect(
      createAIProvider({ provider: 'openai-compatible', baseUrl: 'https://x/v1' }),
    ).toBeInstanceOf(NullProvider);
  });

  it('never exposes the API key when the provider is serialised', () => {
    // A provider object can end up inside a log line, an error payload or a
    // debug dump. TypeScript's `private` would not survive any of those.
    const provider = createAIProvider({
      provider: 'openai-compatible',
      model: 'm',
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'sk-super-secret',
    });

    expect(JSON.stringify(provider)).not.toContain('sk-super-secret');
    expect(JSON.stringify({ nested: { provider } })).not.toContain('sk-super-secret');
    expect(Object.values(provider as unknown as Record<string, unknown>)).not.toContain(
      'sk-super-secret',
    );
    expect(String(JSON.stringify(provider))).toContain('"apiKeyConfigured":true');
  });
});
