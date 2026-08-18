/**
 * @molido/database — the only module that talks to PostgreSQL.
 *
 * Re-exports the generated Prisma types so no other package needs a direct
 * dependency on `@prisma/client`. Swapping or upgrading the ORM stays a change
 * inside this package.
 */

export * from './client';
export * from './errors';
export * from './health';

export {
  ActorType,
  AiAgentStatus,
  AiAgentType,
  AiTaskStatus,
  AuditOutcome,
  EventCategory,
  EventLevel,
  RoleName,
  SecurityEventType,
  SessionRevokeReason,
  Severity,
  UserStatus,
} from '@prisma/client';

export type {
  AiAgent,
  AiTask,
  AuditLog,
  Permission,
  Role,
  RolePermission,
  SecurityEvent,
  Session,
  SystemEvent,
  User,
  UserRole,
} from '@prisma/client';
