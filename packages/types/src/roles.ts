/**
 * MOLIDO AI — role and permission vocabulary.
 *
 * Roles are coarse buckets; permissions are what is actually checked. Every
 * enforcement point lives in the API — a frontend role check is a UI hint, not
 * a security control.
 *
 * Permission codes are explicit and flat. There is no wildcard and no implicit
 * inheritance: a grant that is not written down does not exist.
 */

export const ROLE_NAMES = ['FOUNDER', 'ADMIN', 'USER', 'AI_AGENT', 'SERVICE'] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const PERMISSIONS = [
  // Identity. READ is self-scoped; MANAGE covers any user.
  'USER_READ',
  'USER_MANAGE',
  // Sessions. READ/REVOKE are self-scoped; MANAGE covers any user's sessions.
  'SESSION_READ',
  'SESSION_MANAGE',
  // AI tasks. CREATE/READ/CANCEL are self-scoped; MANAGE covers all tasks.
  'AI_TASK_CREATE',
  'AI_TASK_READ',
  'AI_TASK_CANCEL',
  'AI_TASK_MANAGE',
  // Agents.
  'AGENT_READ',
  'AGENT_MANAGE',
  // Oversight.
  'AUDIT_READ',
  'SECURITY_READ',
  'SYSTEM_READ',
  'SYSTEM_MANAGE',
  // Reserved for the Founder approval gate on high-risk actions.
  'APPROVE_HIGH_RISK',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_DESCRIPTIONS: Readonly<Record<Permission, string>> = {
  USER_READ: 'Read your own account.',
  USER_MANAGE: 'Read, update and suspend any user account.',
  SESSION_READ: 'List your own active sessions.',
  SESSION_MANAGE: 'List and revoke any user’s sessions.',
  AI_TASK_CREATE: 'Submit a goal to the AI orchestrator.',
  AI_TASK_READ: 'Read your own AI tasks.',
  AI_TASK_CANCEL: 'Cancel your own AI tasks.',
  AI_TASK_MANAGE: 'Read and cancel any AI task.',
  AGENT_READ: 'View the AI agent registry and its limits.',
  AGENT_MANAGE: 'Pause, disable or reconfigure AI agents.',
  AUDIT_READ: 'Read the audit log.',
  SECURITY_READ: 'Read security events.',
  SYSTEM_READ: 'Read system health and metrics.',
  SYSTEM_MANAGE: 'Change system configuration and halt the platform.',
  APPROVE_HIGH_RISK: 'Approve actions gated behind Founder sign-off.',
};

/**
 * Default grants per role, persisted on seed so they can be adjusted at
 * runtime without a redeploy.
 *
 * Note what the AI_AGENT role does NOT hold: no user access, no session
 * access, no system management. An agent can read the task it was given and
 * nothing else.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<RoleName, readonly Permission[]>> = {
  FOUNDER: PERMISSIONS,
  ADMIN: [
    'USER_READ',
    'USER_MANAGE',
    'SESSION_READ',
    'SESSION_MANAGE',
    'AI_TASK_CREATE',
    'AI_TASK_READ',
    'AI_TASK_CANCEL',
    'AI_TASK_MANAGE',
    'AGENT_READ',
    'AGENT_MANAGE',
    'AUDIT_READ',
    'SECURITY_READ',
    'SYSTEM_READ',
  ],
  USER: ['USER_READ', 'SESSION_READ', 'AI_TASK_CREATE', 'AI_TASK_READ', 'AI_TASK_CANCEL'],
  AI_AGENT: ['AI_TASK_READ'],
  SERVICE: ['SYSTEM_READ'],
} as const;

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
