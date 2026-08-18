/**
 * Enumerations shared between the API, the workers and the web client.
 *
 * These mirror the Prisma enums in `packages/database/prisma/schema.prisma`.
 * `packages/database` re-exports the generated Prisma enums; this module gives
 * the frontend the same vocabulary without pulling in the Prisma runtime.
 */

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const AI_TASK_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const;
export type AiTaskStatus = (typeof AI_TASK_STATUSES)[number];

export const AI_AGENT_STATUSES = ['ACTIVE', 'PAUSED', 'DISABLED', 'MAINTENANCE'] as const;
export type AiAgentStatus = (typeof AI_AGENT_STATUSES)[number];

export const AI_AGENT_TYPES = ['RESEARCH', 'ANALYSIS', 'AUTOMATION'] as const;
export type AiAgentType = (typeof AI_AGENT_TYPES)[number];

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Severity = (typeof SEVERITIES)[number];

/**
 * Security event taxonomy. Mirrors the `SecurityEventType` Prisma enum; the two
 * are kept in step by a test in `packages/database`.
 */
export const SECURITY_EVENT_TYPES = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'LOGOUT',
  'LOGOUT_ALL',
  'REGISTER_SUCCESS',
  'REGISTER_FAILURE',
  'TOKEN_REFRESH',
  'TOKEN_REUSE_DETECTED',
  'SESSION_REVOKED',
  'ACCOUNT_LOCKED',
  'AUTHORIZATION_FAILURE',
  'RATE_LIMIT_TRIGGERED',
  'SUSPICIOUS_ACTIVITY',
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const ACTOR_TYPES = ['USER', 'AI_AGENT', 'SERVICE', 'SYSTEM', 'ANONYMOUS'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const AUDIT_OUTCOMES = ['SUCCESS', 'FAILURE', 'DENIED'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const EVENT_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'] as const;
export type EventLevel = (typeof EVENT_LEVELS)[number];

export const EVENT_CATEGORIES = [
  'AUTH',
  'AUTHZ',
  'SECURITY',
  'AI',
  'SYSTEM',
  'QUEUE',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const SESSION_REVOKE_REASONS = [
  'LOGOUT',
  'LOGOUT_ALL',
  'ROTATED',
  'REUSE_DETECTED',
  'ADMIN_REVOKED',
  'EXPIRED',
  'PASSWORD_CHANGED',
] as const;
export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number];
