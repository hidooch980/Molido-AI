import { describe, expect, it } from 'vitest';
import { isSensitiveKey, keySpellingVariants, maskEmail, maskToken, redact, REDACTED } from './redaction';

describe('redact', () => {
  it('removes credentials at any nesting level', () => {
    const result = redact({
      email: 'founder@molido.ai',
      password: 'super-secret',
      nested: { refreshToken: 'rt_123', apiKey: 'sk-live-abc', keep: 'visible' },
    }) as Record<string, never>;

    expect(result).toEqual({
      email: 'founder@molido.ai',
      password: REDACTED,
      nested: { refreshToken: REDACTED, apiKey: REDACTED, keep: 'visible' },
    });
  });

  it('matches sensitive keys regardless of casing or separators', () => {
    const result = redact({
      Authorization: 'Bearer x',
      'set-cookie': 'session=1',
      REFRESH_TOKEN: 'rt',
      'api key': 'k',
    }) as Record<string, string>;

    expect(Object.values(result).every((value) => value === REDACTED)).toBe(true);
  });

  it('redacts credentials inside arrays', () => {
    expect(redact({ users: [{ password: 'x', id: 1 }] })).toEqual({
      users: [{ password: REDACTED, id: 1 }],
    });
  });

  it('survives circular references', () => {
    const node: Record<string, unknown> = { name: 'root' };
    node['self'] = node;
    expect(redact(node)).toEqual({ name: 'root', self: '[CIRCULAR]' });
  });

  it('bounds recursion depth', () => {
    expect(redact({ a: { b: { c: 'deep' } } }, 2)).toEqual({ a: { b: '[TRUNCATED]' } });
  });

  it('reduces errors to name and message, dropping the stack', () => {
    expect(redact(new TypeError('boom'))).toEqual({ name: 'TypeError', message: 'boom' });
  });
});

describe('masking', () => {
  it('masks the local part of an email while keeping it correlatable', () => {
    expect(maskEmail('founder@molido.ai')).toBe('f*****r@molido.ai');
    expect(maskEmail('ab@molido.ai')).toBe('**@molido.ai');
    expect(maskEmail('not-an-email')).toBe(REDACTED);
  });

  it('shows only the tail of a token', () => {
    const masked = maskToken('abcdefghijklmnop');
    expect(masked.endsWith('mnop')).toBe(true);
    expect(masked).not.toContain('abcdefghijkl');
    expect(maskToken('')).toBe(REDACTED);
  });
});

describe('keySpellingVariants', () => {
  it('covers the spellings a payload realistically uses', () => {
    const variants = keySpellingVariants('refreshToken');
    expect(variants).toEqual(
      expect.arrayContaining([
        'refreshToken',
        'refreshtoken',
        'refresh_token',
        'refresh-token',
        'REFRESH_TOKEN',
        'RefreshToken',
      ]),
    );
  });

  it('is stable for keys that are already lower-case', () => {
    expect(keySpellingVariants('password')).toEqual(
      expect.arrayContaining(['password', 'PASSWORD', 'Password']),
    );
  });
});

describe('isSensitiveKey', () => {
  it('matches regardless of casing or separators', () => {
    for (const key of ['refreshToken', 'refresh_token', 'REFRESH-TOKEN', 'Refresh Token']) {
      expect(isSensitiveKey(key)).toBe(true);
    }
  });

  it('does not over-match ordinary fields', () => {
    for (const key of ['email', 'userId', 'tokensUsed', 'displayName']) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });
});
