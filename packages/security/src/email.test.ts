import { describe, expect, it } from 'vitest';
import { isValidEmail, normalizeEmail } from './email';

describe('email', () => {
  it('lower-cases and trims so one address cannot become two accounts', () => {
    expect(normalizeEmail('  Founder@Molido.AI ')).toBe('founder@molido.ai');
  });

  it('preserves provider-specific aliasing instead of guessing at it', () => {
    expect(normalizeEmail('founder+build@molido.ai')).toBe('founder+build@molido.ai');
  });

  it('accepts ordinary addresses', () => {
    for (const email of ['founder@molido.ai', 'a.b+c@sub.example.co.uk']) {
      expect(isValidEmail(email)).toBe(true);
    }
  });

  it('rejects malformed addresses', () => {
    for (const email of ['', 'no-at-sign', 'no@tld', 'two@@at.com', 'spaces in@mail.com']) {
      expect(isValidEmail(email)).toBe(false);
    }
  });

  it('rejects addresses beyond the maximum length', () => {
    expect(isValidEmail(`${'a'.repeat(250)}@molido.ai`)).toBe(false);
  });
});
