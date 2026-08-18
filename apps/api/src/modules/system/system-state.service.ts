import { Injectable, Logger } from '@nestjs/common';
import { ActorType, AuditOutcome, SystemMode, type SystemState } from '@molido/database';
import { AuditService } from '../oversight/audit.service';
import { PrismaService } from '../prisma/prisma.service';

/** The single row is fixed at id = 1, enforced by a database check constraint. */
const SINGLE_ROW_ID = 1;

/**
 * The platform's global operating mode.
 *
 * Two properties make this an emergency control rather than a feature flag:
 * it is persisted, so it survives a restart and is observed identically by
 * every API instance; and pausing **rejects new work without destroying
 * existing work**. Queued and running tasks are left alone — silently
 * discarding a user's in-flight job would be a worse failure than the one the
 * Founder is trying to contain.
 */
@Injectable()
export class SystemStateService {
  private readonly logger = new Logger(SystemStateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async current(): Promise<SystemState> {
    // Upsert rather than findUnique: a missing row would otherwise leave the
    // system with no defined mode, and "undefined" must never mean "allowed".
    return this.prisma.systemState.upsert({
      where: { id: SINGLE_ROW_ID },
      update: {},
      create: { id: SINGLE_ROW_ID, mode: SystemMode.NORMAL },
    });
  }

  async isPaused(): Promise<boolean> {
    return (await this.current()).mode === SystemMode.PAUSED;
  }

  async setMode(
    mode: SystemMode,
    actorId: string,
    context: { reason?: string; ipAddress?: string | null; requestId?: string | null },
  ): Promise<SystemState> {
    const state = await this.prisma.systemState.upsert({
      where: { id: SINGLE_ROW_ID },
      update: {
        mode,
        reason: mode === SystemMode.PAUSED ? (context.reason ?? null) : null,
        changedBy: actorId,
        changedAt: new Date(),
      },
      create: { id: SINGLE_ROW_ID, mode, reason: context.reason ?? null, changedBy: actorId },
    });

    // Halting the platform is exactly the kind of privileged act the audit log
    // exists for.
    await this.audit.record({
      actorType: ActorType.USER,
      actorId,
      actorUserId: actorId,
      action: mode === SystemMode.PAUSED ? 'system.pause' : 'system.resume',
      resource: 'system_state',
      resourceId: String(SINGLE_ROW_ID),
      outcome: AuditOutcome.SUCCESS,
      ipAddress: context.ipAddress,
      requestId: context.requestId,
      metadata: { mode, reason: context.reason },
    });

    this.logger.warn(`System mode set to ${mode} by ${actorId}${context.reason ? `: ${context.reason}` : ''}`);

    return state;
  }
}
