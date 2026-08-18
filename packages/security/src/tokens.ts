import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

/** Entropy of an opaque refresh token, in bytes. 256 bits. */
export const OPAQUE_TOKEN_BYTES = 32;

/**
 * Generate a high-entropy, URL-safe opaque token.
 *
 * Refresh tokens are deliberately NOT JWTs: a JWT is self-validating, which
 * makes server-side revocation a bolt-on. An opaque token is meaningless
 * without the database row that backs it, so revoking the row revokes the
 * token — immediately and unconditionally.
 */
export function generateOpaqueToken(bytes: number = OPAQUE_TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Digest used for at-rest storage of opaque tokens.
 *
 * SHA-256 (not a password KDF) is the right tool here: the input already has
 * 256 bits of entropy, so brute force is infeasible and a slow KDF would only
 * add latency to every refresh. What matters is that a database leak yields
 * digests, never usable tokens.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function safeCompareHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length === 0 || bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/** Identifier shared by every session descended from one login. */
export function generateSessionFamilyId(): string {
  return randomUUID();
}

/** Correlation id attached to a request and to every log line it produces. */
export function generateRequestId(): string {
  return randomUUID();
}
