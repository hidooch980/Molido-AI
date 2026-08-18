import { Injectable, Logger } from '@nestjs/common';
import { type ActorType, type AuditOutcome, type Prisma } from '@molido/database';
import { redact } from '@molido/security';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorType: ActorType;
  /** Identifier of the acting principal, whatever its type. */
  actorId?: string | null;
  /** Set only when the actor is a real user row. */
  actorUserId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only record of who did what.
 *
 * Two properties matter more than anything else here:
 *
 *  1. Metadata is redacted on the way in. An audit trail that accumulates
 *     credentials is a breach waiting to be read.
 *  2. A failure to write an audit row never fails the request. Losing one log
 *     line is bad; refusing a legitimate login because the log was briefly
 *     unavailable is worse. The failure is loudly logged instead.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorType: entry.actorType,
          actorId: entry.actorId ?? null,
          actorUserId: entry.actorUserId ?? null,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId ?? null,
          outcome: entry.outcome,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
          requestId: entry.requestId ?? null,
          metadata: entry.metadata
            ? (redact(entry.metadata) as Prisma.InputJsonObject)
            : undefined,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit entry for ${entry.action}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
