import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Contract every password hashing implementation must satisfy.
 *
 * The interface exists so the algorithm can be replaced (Argon2id, for example)
 * without touching a single call site. `needsRehash` is what makes an in-place
 * upgrade possible: on a successful login the caller can transparently re-hash
 * a credential that was stored with outdated parameters.
 */
export interface PasswordHasher {
  readonly algorithm: string;
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, encoded: string): Promise<boolean>;
  needsRehash(encoded: string): boolean;
}

export interface ScryptParameters {
  /** CPU/memory cost. Must be a power of two. */
  N: number;
  /** Block size. */
  r: number;
  /** Parallelisation. */
  p: number;
  /** Derived key length in bytes. */
  keyLength: number;
  /** Salt length in bytes. */
  saltLength: number;
}

/**
 * OWASP-aligned scrypt parameters (N=2^17, r=8, p=1).
 *
 * scrypt is chosen over bcrypt because it is memory-hard, and over Argon2id
 * because it ships inside Node's standard library — no native module, no
 * compiler toolchain, no install-time failure mode. That matters for the
 * zero-cost, runs-anywhere policy of the MVP.
 */
export const DEFAULT_SCRYPT_PARAMETERS: Readonly<ScryptParameters> = Object.freeze({
  N: 1 << 17,
  r: 8,
  p: 1,
  keyLength: 32,
  saltLength: 16,
});

/** scrypt needs roughly 128 * N * r bytes; give it headroom so it never throws. */
function maxmemFor(params: ScryptParameters): number {
  return 256 * params.N * params.r;
}

/**
 * Password hasher backed by Node's built-in scrypt.
 *
 * Encoded format (PHC-like, self-describing so parameters can evolve):
 *
 *     scrypt$N=131072,r=8,p=1$<base64 salt>$<base64 derived key>
 */
export class ScryptPasswordHasher implements PasswordHasher {
  readonly algorithm = 'scrypt';

  private readonly params: ScryptParameters;

  constructor(params: Partial<ScryptParameters> = {}) {
    this.params = { ...DEFAULT_SCRYPT_PARAMETERS, ...params };
  }

  async hash(plaintext: string): Promise<string> {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
      throw new TypeError('Password must be a non-empty string');
    }
    const { N, r, p, keyLength, saltLength } = this.params;
    const salt = randomBytes(saltLength);
    const derived = await scryptAsync(plaintext.normalize('NFKC'), salt, keyLength, {
      N,
      r,
      p,
      maxmem: maxmemFor(this.params),
    });
    return `scrypt$N=${N},r=${r},p=${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
  }

  /**
   * Constant-time verification. Returns `false` rather than throwing on a
   * malformed record so a corrupted row cannot be distinguished from a wrong
   * password by timing or by error message.
   */
  async verify(plaintext: string, encoded: string): Promise<boolean> {
    const parsed = parseEncoded(encoded);
    if (!parsed) return false;

    try {
      const derived = await scryptAsync(plaintext.normalize('NFKC'), parsed.salt, parsed.hash.length, {
        N: parsed.N,
        r: parsed.r,
        p: parsed.p,
        maxmem: 256 * parsed.N * parsed.r,
      });
      return derived.length === parsed.hash.length && timingSafeEqual(derived, parsed.hash);
    } catch {
      return false;
    }
  }

  /** True when the stored record was produced with weaker parameters. */
  needsRehash(encoded: string): boolean {
    const parsed = parseEncoded(encoded);
    if (!parsed) return true;
    return (
      parsed.N < this.params.N ||
      parsed.r < this.params.r ||
      parsed.p < this.params.p ||
      parsed.hash.length < this.params.keyLength
    );
  }
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parseEncoded(encoded: string): ParsedHash | null {
  if (typeof encoded !== 'string') return null;
  const parts = encoded.split('$');
  if (parts.length !== 4) return null;
  const [algorithm, paramString, saltB64, hashB64] = parts;
  if (algorithm !== 'scrypt' || !paramString || !saltB64 || !hashB64) return null;

  const params: Record<string, number> = {};
  for (const pair of paramString.split(',')) {
    const [key, rawValue] = pair.split('=');
    if (!key || rawValue === undefined) return null;
    const value = Number.parseInt(rawValue, 10);
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    params[key] = value;
  }

  const N = params['N'];
  const r = params['r'];
  const p = params['p'];
  if (N === undefined || r === undefined || p === undefined) return null;
  // Reject absurd work factors so a poisoned row cannot become a DoS vector.
  if (N > 1 << 22 || r > 32 || p > 16) return null;
  if ((N & (N - 1)) !== 0) return null;

  const salt = Buffer.from(saltB64, 'base64');
  const hash = Buffer.from(hashB64, 'base64');
  if (salt.length === 0 || hash.length === 0) return null;

  return { N, r, p, salt, hash };
}
