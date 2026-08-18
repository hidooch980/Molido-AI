import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH, validatePassword } from './password-policy';

describe('validatePassword', () => {
  it('accepts a long passphrase', () => {
    expect(validatePassword('correct horse battery staple').valid).toBe(true);
  });

  it('rejects passwords below the minimum length', () => {
    const result = validatePassword('short1!');
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it('rejects absurdly long input that would only burden the KDF', () => {
    expect(validatePassword('a'.repeat(300)).valid).toBe(false);
  });

  it('rejects well-known weak passwords', () => {
    expect(validatePassword('password123').valid).toBe(false);
    expect(validatePassword('aaaaaaaaaaaaaaaa').valid).toBe(false);
  });

  it('rejects a password containing the account email', () => {
    const result = validatePassword('founder-is-here-2026', { email: 'founder@molido.ai' });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('email');
  });

  it('reports every violation at once', () => {
    expect(validatePassword('aaa').errors.length).toBeGreaterThan(0);
  });
});
