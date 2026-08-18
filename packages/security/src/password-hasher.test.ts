import { describe, expect, it } from 'vitest';
import { ScryptPasswordHasher } from './password-hasher';

// Reduced work factor: these tests exercise the encoding and comparison logic,
// not the cost parameter. Production defaults are asserted separately.
const hasher = new ScryptPasswordHasher({ N: 1 << 12 });

describe('ScryptPasswordHasher', () => {
  it('produces a self-describing encoded hash', async () => {
    const encoded = await hasher.hash('correct horse battery staple');
    const [algorithm, params, salt, digest] = encoded.split('$');

    expect(algorithm).toBe('scrypt');
    expect(params).toBe('N=4096,r=8,p=1');
    expect(Buffer.from(salt!, 'base64')).toHaveLength(16);
    expect(Buffer.from(digest!, 'base64')).toHaveLength(32);
  });

  it('never stores the plaintext', async () => {
    const encoded = await hasher.hash('correct horse battery staple');
    expect(encoded).not.toContain('correct horse battery staple');
  });

  it('salts every hash, so identical passwords differ at rest', async () => {
    const a = await hasher.hash('same-password-here');
    const b = await hasher.hash('same-password-here');
    expect(a).not.toBe(b);
    await expect(hasher.verify('same-password-here', a)).resolves.toBe(true);
    await expect(hasher.verify('same-password-here', b)).resolves.toBe(true);
  });

  it('verifies a correct password', async () => {
    const encoded = await hasher.hash('a-very-good-password');
    await expect(hasher.verify('a-very-good-password', encoded)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const encoded = await hasher.hash('a-very-good-password');
    await expect(hasher.verify('a-very-good-passwore', encoded)).resolves.toBe(false);
    await expect(hasher.verify('', encoded)).resolves.toBe(false);
  });

  it('normalises unicode so equivalent inputs match', async () => {
    // "é" as a single code point vs. "e" + combining acute accent.
    const composed = 'passwordé-long-enough';
    const decomposed = 'passwordé-long-enough';
    const encoded = await hasher.hash(composed);
    await expect(hasher.verify(decomposed, encoded)).resolves.toBe(true);
  });

  it('returns false — never throws — for malformed records', async () => {
    for (const malformed of [
      '',
      'not-a-hash',
      'scrypt$N=4096$only-three-parts',
      'bcrypt$N=4096,r=8,p=1$c2FsdA==$aGFzaA==',
      'scrypt$N=0,r=8,p=1$c2FsdA==$aGFzaA==',
      // N must be a power of two.
      'scrypt$N=4097,r=8,p=1$c2FsdA==$aGFzaA==',
      // Absurd work factor would otherwise be a denial-of-service vector.
      'scrypt$N=8388608,r=8,p=1$c2FsdA==$aGFzaA==',
    ]) {
      await expect(hasher.verify('anything', malformed)).resolves.toBe(false);
    }
  });

  it('rejects empty passwords at hash time', async () => {
    await expect(hasher.hash('')).rejects.toThrow(TypeError);
  });

  it('flags weaker stored parameters for rehash', async () => {
    const weak = await new ScryptPasswordHasher({ N: 1 << 12 }).hash('some-password-x');
    const strong = new ScryptPasswordHasher({ N: 1 << 14 });

    expect(strong.needsRehash(weak)).toBe(true);
    expect(strong.needsRehash(await strong.hash('some-password-x'))).toBe(false);
    expect(strong.needsRehash('garbage')).toBe(true);
  });
});
