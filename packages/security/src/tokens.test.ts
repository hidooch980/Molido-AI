import { describe, expect, it } from 'vitest';
import { generateOpaqueToken, hashToken, safeCompareHex, OPAQUE_TOKEN_BYTES } from './tokens';

describe('opaque tokens', () => {
  it('generates 256 bits of URL-safe entropy', () => {
    const token = generateOpaqueToken();
    expect(Buffer.from(token, 'base64url')).toHaveLength(OPAQUE_TOKEN_BYTES);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('never repeats across a large sample', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateOpaqueToken()));
    expect(seen.size).toBe(2000);
  });

  it('hashes deterministically to a 64-character hex digest', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces a digest that does not reveal the token', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).not.toContain(token);
  });

  it('compares digests without leaking on length or content', () => {
    const digest = hashToken('a');
    expect(safeCompareHex(digest, hashToken('a'))).toBe(true);
    expect(safeCompareHex(digest, hashToken('b'))).toBe(false);
    expect(safeCompareHex(digest, '')).toBe(false);
    expect(safeCompareHex('', '')).toBe(false);
    expect(safeCompareHex(digest, digest.slice(0, -2))).toBe(false);
  });
});
