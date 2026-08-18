import { Injectable, Logger } from '@nestjs/common';
import { type SecurityEventType, Severity, type Prisma } from '@molido/database';
import { redact } from '@molido/security';
import { PrismaService } from '../prisma/prisma.service';

export interface SecurityEventInput {
  type: SecurityEventType;
  severity?: Severity;
  /** Null when the event cannot be attributed to a known account. */
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Default severity per event type, so an alerting threshold means the same
 * thing everywhere.
 */
const DEFAULT_SEVERITY: Record<SecurityEventType, Severity> = {
  LOGIN_SUCCESS: Severity.LOW,
  LOGIN_FAILURE: Severity.MEDIUM,
  LOGOUT: Severity.LOW,
  LOGOUT_ALL: Severity.LOW,
  REGISTER_SUCCESS: Severity.LOW,
  REGISTER_FAILURE: Severity.LOW,
  TOKEN_REFRESH: Severity.LOW,
  // A rotated refresh token being replayed means it leaked. Nothing else in
  // this system is rated higher.
  TOKEN_REUSE_DETECTED: Severity.CRITICAL,
  SESSION_REVOKED: Severity.LOW,
  ACCOUNT_LOCKED: Severity.HIGH,
  AUTHORIZATION_FAILURE: Severity.MEDIUM,
  RATE_LIMIT_TRIGGERED: Severity.MEDIUM,
  SUSPICIOUS_ACTIVITY: Severity.HIGH,
};

@Injectable()
export class SecurityEventService {
  private readonly logger = new Logger(SecurityEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: SecurityEventInput): Promise<void> {
    const severity = input.severity ?? DEFAULT_SEVERITY[input.type];

    try {
      await this.prisma.securityEvent.create({
        data: {
          type: input.type,
          severity,
          userId: input.userId ?? null,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          requestId: input.requestId ?? null,
          metadata: input.metadata
            ? (redact(input.metadata) as Prisma.InputJsonObject)
            : undefined,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist security event ${input.type}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    // High-severity events are mirrored to the log stream so they surface even
    // if the database is the thing that is unwell.
    if (severity === Severity.HIGH || severity === Severity.CRITICAL) {
      this.logger.warn(
        `Security event ${input.type} (${severity}) userId=${input.userId ?? 'unknown'} ip=${input.ipAddress ?? 'unknown'}`,
      );
    }
  }
}
