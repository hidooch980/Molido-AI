import { describe, expect, it } from 'vitest';
import { ConfigValidationError, describeConnection, loadConfig } from './load-config';

const VALID_SECRET = 'f'.repeat(64);

function baseEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://molido:pw@localhost:5433/molido_mvp?schema=public',
    JWT_ACCESS_SECRET: VALID_SECRET,
    ...overrides,
  };
}

describe('loadConfig', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const config = loadConfig(baseEnv());

    expect(config.env).toBe('test');
    expect(config.api.port).toBe(4000);
    expect(config.api.globalPrefix).toBe('api');
    expect(config.api.defaultVersion).toBe('1');
    expect(config.auth.accessTokenTtl).toBe('15m');
    expect(config.auth.refreshTokenTtlDays).toBe(30);
    expect(config.ai.enabled).toBe(false);
  });

  it('refuses to start without an access-token secret', () => {
    const env = baseEnv();
    delete env['JWT_ACCESS_SECRET'];
    expect(() => loadConfig(env)).toThrow(ConfigValidationError);
  });

  it('refuses a short or placeholder secret', () => {
    expect(() => loadConfig(baseEnv({ JWT_ACCESS_SECRET: 'too-short' }))).toThrow(
      ConfigValidationError,
    );
    expect(() =>
      loadConfig(baseEnv({ JWT_ACCESS_SECRET: `change_me${'!'.repeat(30)}` })),
    ).not.toThrow();
    expect(() => loadConfig(baseEnv({ JWT_ACCESS_SECRET: 'change_me' }))).toThrow(
      ConfigValidationError,
    );
  });

  it('never echoes a secret value in the validation error', () => {
    const secret = 'super-secret-but-far-too-short';
    try {
      loadConfig(baseEnv({ JWT_ACCESS_SECRET: secret }));
      expect.unreachable('expected validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError);
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).toContain('JWT_ACCESS_SECRET');
    }
  });

  it('rejects a non-postgres database URL', () => {
    expect(() => loadConfig(baseEnv({ DATABASE_URL: 'mysql://localhost/molido' }))).toThrow(
      ConfigValidationError,
    );
  });

  it('parses a comma-separated CORS list', () => {
    const config = loadConfig(
      baseEnv({ CORS_ORIGINS: 'http://localhost:3000, https://app.molido.ai' }),
    );
    expect(config.api.corsOrigins).toEqual(['http://localhost:3000', 'https://app.molido.ai']);
  });

  it('rejects a wildcard CORS origin', () => {
    expect(() => loadConfig(baseEnv({ CORS_ORIGINS: '*' }))).toThrow(ConfigValidationError);
  });

  it('rejects insecure non-local origins in production', () => {
    expect(() =>
      loadConfig(
        baseEnv({ NODE_ENV: 'production', CORS_ORIGINS: 'http://app.molido.ai' }),
      ),
    ).toThrow(ConfigValidationError);

    expect(() =>
      loadConfig(baseEnv({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.molido.ai' })),
    ).not.toThrow();
  });

  it('requires a model once an AI provider is selected', () => {
    expect(() => loadConfig(baseEnv({ AI_PROVIDER: 'ollama' }))).toThrow(ConfigValidationError);
    expect(() =>
      loadConfig(baseEnv({ AI_PROVIDER: 'ollama', AI_MODEL: 'llama3.1' })),
    ).not.toThrow();
  });

  it('requires a base URL for an openai-compatible provider', () => {
    expect(() =>
      loadConfig(baseEnv({ AI_PROVIDER: 'openai-compatible', AI_MODEL: 'gpt-x' })),
    ).toThrow(ConfigValidationError);
  });

  it('returns a frozen object so configuration cannot drift at runtime', () => {
    const config = loadConfig(baseEnv());
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.auth)).toBe(true);
  });

  it('collects every problem in one pass', () => {
    const env = baseEnv({ JWT_ACCESS_SECRET: 'x', DATABASE_URL: 'nope', API_PORT: '99999' });
    try {
      loadConfig(env);
      expect.unreachable('expected validation to fail');
    } catch (error) {
      expect((error as ConfigValidationError).issues.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('describeConnection', () => {
  it('strips credentials from a connection string', () => {
    const described = describeConnection('postgresql://molido:hunter2@db.internal:5432/molido_mvp');
    expect(described).toBe('postgresql://db.internal:5432/molido_mvp');
    expect(described).not.toContain('hunter2');
    expect(described).not.toContain('molido:');
  });

  it('degrades gracefully on unparseable input', () => {
    expect(describeConnection('not a url')).toBe('(unparseable connection string)');
  });
});
