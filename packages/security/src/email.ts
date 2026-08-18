/**
 * Email normalisation.
 *
 * Addresses are stored lower-cased so that `Founder@Molido.ai` and
 * `founder@molido.ai` cannot become two accounts. Local-part aliasing
 * (dots, `+tags`) is intentionally left alone: stripping it is provider-specific
 * and silently merges addresses their owners consider distinct.
 */

// Deliberately conservative. Full RFC 5322 validation belongs to the mail
// server, not to a registration form.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const MAX_EMAIL_LENGTH = 254;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') return false;
  const normalized = normalizeEmail(email);
  return normalized.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(normalized);
}
