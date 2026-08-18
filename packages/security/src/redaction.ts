/**
 * Redaction helpers.
 *
 * Phase 11 of the MOLIDO build states plainly what must never reach a log
 * sink: passwords, API keys, refresh tokens, and sensitive personal data. This
 * module is the single definition of "what is sensitive", shared by the logger,
 * the audit writer and the error serialiser.
 */

/**
 * Keys whose values must never be logged.
 *
 * Listed in their most common real-world spelling. Matching is done on a
 * normalised form (lower-cased, separators stripped), so `refreshToken`,
 * `refresh_token`, `REFRESH-TOKEN` and `Refresh Token` all resolve to the same
 * entry. Consumers that need exact key spellings — pino's `redact` option, for
 * one — should expand each entry with `keySpellingVariants`.
 */
export const SENSITIVE_KEYS: readonly string[] = [
  'password',
  'newPassword',
  'currentPassword',
  'passwordHash',
  'passwordConfirmation',
  'token',
  'accessToken',
  'refreshToken',
  'refreshTokenHash',
  'idToken',
  'apiKey',
  'secret',
  'clientSecret',
  'authorization',
  'cookie',
  'setCookie',
  'sessionId',
  'privateKey',
  'mnemonic',
  'seedPhrase',
  'otp',
  'totp',
  'creditCard',
  'cardNumber',
  'cvv',
  'ssn',
];

export const REDACTED = '[REDACTED]';

/** Lower-case, separator-free form used for comparison. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s.]/g, '');
}

const SENSITIVE_KEY_SET = new Set(SENSITIVE_KEYS.map(normalizeKey));

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_SET.has(normalizeKey(key));
}

/**
 * Every spelling of a key that a real payload might use.
 *
 * Needed because some redaction engines — pino's, for one — match property
 * paths literally and case-sensitively. Expanding `refreshToken` into
 * `refresh_token`, `refresh-token`, `REFRESH_TOKEN` and friends is what closes
 * the gap between "we declared it sensitive" and "it was actually stripped".
 */
export function keySpellingVariants(key: string): string[] {
  const snake = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const kebab = snake.replace(/_/g, '-');
  const flat = normalizeKey(key);
  const pascal = key.charAt(0).toUpperCase() + key.slice(1);
  return [...new Set([key, flat, snake, kebab, snake.toUpperCase(), pascal])];
}

/**
 * Deep-clone a value with every sensitive field replaced by `[REDACTED]`.
 *
 * Cycles are tolerated, depth is bounded, and unknown exotic objects are
 * stringified rather than walked — a logger must never be able to crash the
 * process it is instrumenting.
 */
export function redact<T>(value: T, maxDepth = 8): unknown {
  return redactInternal(value, maxDepth, new WeakSet());
}

function redactInternal(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (depth <= 0) return '[TRUNCATED]';

  const primitive = typeof value;
  if (primitive === 'string' || primitive === 'number' || primitive === 'boolean') return value;
  if (primitive === 'bigint') return `${(value as bigint).toString()}n`;
  if (primitive === 'function' || primitive === 'symbol') return `[${primitive}]`;

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => redactInternal(item, depth - 1, seen));
    }

    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      output[key] = isSensitiveKey(key) ? REDACTED : redactInternal(source[key], depth - 1, seen);
    }
    return output;
  }

  return String(value);
}

/**
 * Mask an email for display in logs and audit trails: `founder@example.com`
 * becomes `f*****r@example.com`. Enough to correlate incidents, not enough to
 * turn a log dump into a mailing list.
 */
export function maskEmail(email: string): string {
  if (typeof email !== 'string' || !email.includes('@')) return REDACTED;
  const atIndex = email.lastIndexOf('@');
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (local.length <= 2) return `${'*'.repeat(local.length)}@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}

/** Show only the last 4 characters of a token-like string. */
export function maskToken(token: string, visible = 4): string {
  if (typeof token !== 'string' || token.length === 0) return REDACTED;
  if (token.length <= visible) return '*'.repeat(token.length);
  return `${'*'.repeat(Math.min(token.length - visible, 12))}${token.slice(-visible)}`;
}
