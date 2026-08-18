/**
 * Password policy.
 *
 * Follows the NIST SP 800-63B posture: length is the primary control, common
 * and obviously-weak passwords are rejected, and composition rules are kept
 * light because they push users toward predictable substitutions.
 */

export const MIN_PASSWORD_LENGTH = 12;
/** Upper bound guards against a long-input DoS through the KDF. */
export const MAX_PASSWORD_LENGTH = 256;

/**
 * A short deny-list of passwords that are trivially guessable. This is not a
 * substitute for a breached-password corpus check, which belongs in a later
 * phase once an offline dataset can be shipped without a paid service.
 */
const OBVIOUSLY_WEAK = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  '123456789012',
  'qwertyuiop',
  'administrator',
  'letmein12345',
  'molidoai',
  'molido-ai',
  'molidoaimolido',
]);

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

export function validatePassword(password: string, context: { email?: string } = {}): PasswordPolicyResult {
  const errors: string[] = [];

  if (typeof password !== 'string') {
    return { valid: false, errors: ['Password must be a string'] };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Password must be at most ${MAX_PASSWORD_LENGTH} characters long`);
  }

  const normalized = password.trim().toLowerCase();
  if (OBVIOUSLY_WEAK.has(normalized)) {
    errors.push('Password is too common');
  }
  if (/^(.)\1+$/.test(password)) {
    errors.push('Password must not be a single repeated character');
  }

  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 3 && normalized.includes(localPart)) {
    errors.push('Password must not contain your email address');
  }

  return { valid: errors.length === 0, errors };
}
