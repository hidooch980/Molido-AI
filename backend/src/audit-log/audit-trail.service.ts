import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';

export type AuditEntry = {
  /** Domain object the change happened to, e.g. 'MunicipalBill'. */
  entity: string;
  entityId: string;
  /** Verb in past tense, e.g. 'PAID', 'APPROVED', 'CANCELLED'. */
  action: string;
  userId?: string | null;
  userEmail?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
};

/**
 * Writes the audit trail.  Separate from AuditLogService (which only reads the
 * table through the generic CRUD) so that callers cannot accidentally expose a
 * write endpoint for it.
 *
 * An audit write must never break the operation it is recording: `record` logs
 * and swallows its own failures.  Use `recordIn` when the entry has to live or
 * die with an enclosing transaction.
 */
@Injectable()
export class AuditTrailService {
  private readonly logger = new Logger(AuditTrailService.name);

  constructor(private readonly db: DatabaseService) {}

  private args(companyId: string, entry: AuditEntry): unknown[] {
    return [
      randomUUID(),
      companyId,
      entry.userId ?? null,
      entry.userEmail ?? null,
      entry.action,
      entry.entity,
      entry.entityId,
      entry.oldValue === undefined ? null : JSON.stringify(entry.oldValue),
      entry.newValue === undefined ? null : JSON.stringify(entry.newValue),
      entry.ipAddress ?? null,
    ];
  }

  private static readonly INSERT = `
    INSERT INTO "AuditLog"
      (id, "companyId", "userId", "userEmail", action, entity, "entityId",
       "oldValue", "newValue", "ipAddress")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

  /** Best-effort write; a failure here never propagates to the caller. */
  async record(companyId: string, entry: AuditEntry): Promise<void> {
    try {
      await this.db.execute(AuditTrailService.INSERT, this.args(companyId, entry));
    } catch (error) {
      this.logger.error(
        `Failed to record audit entry ${entry.entity}/${entry.action}`,
        error as Error,
      );
    }
  }

  /** Writes inside an open transaction, so the entry rolls back with it. */
  async recordIn(tx: PoolClient, companyId: string, entry: AuditEntry): Promise<void> {
    await tx.query(AuditTrailService.INSERT, this.args(companyId, entry));
  }
}
