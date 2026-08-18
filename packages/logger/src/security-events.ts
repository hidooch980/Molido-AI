import type { EventCategory, EventLevel } from '@molido/types';

/**
 * The canonical list of security-relevant things worth recording.
 *
 * Naming them here — rather than sprinkling string literals through the
 * services — is what makes them queryable, alertable, and testable later.
 */
export const SECURITY_EVENTS = {
  // Authentication
  REGISTER_SUCCEEDED: 'auth.register.succeeded',
  REGISTER_REJECTED: 'auth.register.rejected',
  LOGIN_SUCCEEDED: 'auth.login.succeeded',
  LOGIN_FAILED: 'auth.login.failed',
  LOGIN_BLOCKED_LOCKED: 'auth.login.blocked.locked',
  LOGIN_BLOCKED_STATUS: 'auth.login.blocked.status',
  ACCOUNT_LOCKED: 'auth.account.locked',
  LOGOUT: 'auth.logout',
  LOGOUT_ALL: 'auth.logout.all',
  // Sessions and tokens
  TOKEN_REFRESHED: 'auth.token.refreshed',
  TOKEN_REFRESH_FAILED: 'auth.token.refresh.failed',
  TOKEN_REUSE_DETECTED: 'auth.token.reuse.detected',
  SESSION_REVOKED: 'auth.session.revoked',
  // Authorisation
  AUTHZ_DENIED: 'authz.denied',
  // Transport / abuse
  RATE_LIMIT_EXCEEDED: 'security.rate_limit.exceeded',
  VALIDATION_REJECTED: 'security.validation.rejected',
  SUSPICIOUS_REQUEST: 'security.request.suspicious',
} as const;

export type SecurityEventName = (typeof SECURITY_EVENTS)[keyof typeof SECURITY_EVENTS];

export interface SecurityEvent {
  name: SecurityEventName;
  level: EventLevel;
  category: EventCategory;
  message: string;
  /** Never contains credentials — the writer redacts before persisting. */
  metadata?: Record<string, unknown>;
}

/** Severity floor for each event, so alerting thresholds are consistent. */
export const SECURITY_EVENT_LEVELS: Readonly<Record<SecurityEventName, EventLevel>> = {
  [SECURITY_EVENTS.REGISTER_SUCCEEDED]: 'INFO',
  [SECURITY_EVENTS.REGISTER_REJECTED]: 'INFO',
  [SECURITY_EVENTS.LOGIN_SUCCEEDED]: 'INFO',
  [SECURITY_EVENTS.LOGIN_FAILED]: 'WARN',
  [SECURITY_EVENTS.LOGIN_BLOCKED_LOCKED]: 'WARN',
  [SECURITY_EVENTS.LOGIN_BLOCKED_STATUS]: 'WARN',
  [SECURITY_EVENTS.ACCOUNT_LOCKED]: 'WARN',
  [SECURITY_EVENTS.LOGOUT]: 'INFO',
  [SECURITY_EVENTS.LOGOUT_ALL]: 'INFO',
  [SECURITY_EVENTS.TOKEN_REFRESHED]: 'DEBUG',
  [SECURITY_EVENTS.TOKEN_REFRESH_FAILED]: 'WARN',
  // Refresh-token reuse means a token leaked. Treated as critical, and the
  // whole session family is destroyed when it fires.
  [SECURITY_EVENTS.TOKEN_REUSE_DETECTED]: 'CRITICAL',
  [SECURITY_EVENTS.SESSION_REVOKED]: 'INFO',
  [SECURITY_EVENTS.AUTHZ_DENIED]: 'WARN',
  [SECURITY_EVENTS.RATE_LIMIT_EXCEEDED]: 'WARN',
  [SECURITY_EVENTS.VALIDATION_REJECTED]: 'DEBUG',
  [SECURITY_EVENTS.SUSPICIOUS_REQUEST]: 'WARN',
};
