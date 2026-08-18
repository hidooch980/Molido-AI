import { describe, expect, it } from 'vitest';
import {
  AI_AGENT_STATUSES,
  AI_AGENT_TYPES,
  AI_TASK_STATUSES,
  ROLE_NAMES,
  SECURITY_EVENT_TYPES,
  SEVERITIES,
  USER_STATUSES,
} from '@molido/types';
import {
  AiAgentStatus,
  AiAgentType,
  AiTaskStatus,
  RoleName,
  SecurityEventType,
  Severity,
  UserStatus,
} from './index';

/**
 * `@molido/types` restates the database enums so the browser bundle never has
 * to import Prisma. Restating them means they can drift — these tests are what
 * stop that from happening silently.
 */
describe('shared enums mirror the Prisma schema', () => {
  const cases: [string, readonly string[], Record<string, string>][] = [
    ['RoleName', ROLE_NAMES, RoleName],
    ['UserStatus', USER_STATUSES, UserStatus],
    ['AiTaskStatus', AI_TASK_STATUSES, AiTaskStatus],
    ['AiAgentStatus', AI_AGENT_STATUSES, AiAgentStatus],
    ['AiAgentType', AI_AGENT_TYPES, AiAgentType],
    ['SecurityEventType', SECURITY_EVENT_TYPES, SecurityEventType],
    ['Severity', SEVERITIES, Severity],
  ];

  for (const [name, shared, prismaEnum] of cases) {
    it(`${name} has identical members in both definitions`, () => {
      expect([...shared].sort()).toEqual(Object.values(prismaEnum).sort());
    });
  }
});

describe('AI task lifecycle', () => {
  it('covers exactly the five states the orchestrator implements', () => {
    expect(Object.values(AiTaskStatus).sort()).toEqual(
      ['CANCELLED', 'COMPLETED', 'FAILED', 'PENDING', 'RUNNING'].sort(),
    );
  });
});
