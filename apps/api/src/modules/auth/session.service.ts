import { Injectable, Logger } from '@nestjs/common';
import { SecurityEventType, SessionRevokeReason, type Session } from '@molido/database';
import { generateSessionFamilyId } from '@molido/security';
import { PrismaService } from '../prisma/prisma.service';
import { SecurityEventService } from '../oversight/security-event.service';
import { TokenService } from './token.service';

export interface SessionContext {
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
  requestId?: string | null;
}

export interface CreatedSession {
  session: Session;
  /** Plaintext refresh token. Returned once, never stored. */
  refreshToken: string;
}

/** Outcome of presenting a refresh token. */
export type RotationResult =
  | { kind: 'rotated'; session: Session; refreshToken: string; previous: Session }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'reuse-detected'; userId: string; familyId: string };

/**
 * Owns the refresh-token lifecycle.
 *
 * The rotation model: every refresh mints a new token and marks the presented
 * one as ROTATED, linking old to new. A token is therefore valid exactly once.
 * If a *rotated* token is presented again, the only explanations are theft or a
 * clone — so the entire session family is revoked and a CRITICAL security event
 * is raised. That is the difference between detecting a stolen token and never
 * finding out.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly securityEvents: SecurityEventService,
  ) {}

  /** Start a new session family. Called on a successful login. */
  async create(userId: string, context: SessionContext): Promise<CreatedSession> {
    const issued = this.tokens.issueRefreshToken();

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: issued.hash,
        familyId: generateSessionFamilyId(),
        expiresAt: issued.expiresAt,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
        deviceId: context.deviceId ?? null,
      },
    });

    return { session, refreshToken: issued.token };
  }

  /**
   * Exchange a refresh token for a new one.
   *
   * Every rejection path returns a coarse result. The caller must not tell the
   * client which of "unknown token", "expired" or "revoked" applied.
   */
  async rotate(presentedToken: string, context: SessionContext): Promise<RotationResult> {
    const hash = this.tokens.hashRefreshToken(presentedToken);
    const existing = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash } });

    if (!existing) return { kind: 'invalid' };

    if (existing.revokedAt) {
      // A revoked token was presented. If it was revoked because it had already
      // been rotated, this is replay of a token that should no longer exist
      // anywhere — treat the whole family as compromised.
      if (existing.revokedReason === SessionRevokeReason.ROTATED) {
        await this.revokeFamily(
          existing.familyId,
          SessionRevokeReason.REUSE_DETECTED,
        );
        await this.securityEvents.record({
          type: SecurityEventType.TOKEN_REUSE_DETECTED,
          userId: existing.userId,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          requestId: context.requestId,
          metadata: {
            familyId: existing.familyId,
            replayedSessionId: existing.id,
            action: 'entire session family revoked',
          },
        });
        this.logger.warn(
          `Refresh token reuse detected for user ${existing.userId}; session family ${existing.familyId} revoked`,
        );
        return { kind: 'reuse-detected', userId: existing.userId, familyId: existing.familyId };
      }
      return { kind: 'invalid' };
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      await this.prisma.session.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), revokedReason: SessionRevokeReason.EXPIRED },
      });
      return { kind: 'expired' };
    }

    const issued = this.tokens.issueRefreshToken();

    // Both writes in one transaction: a crash between them would either leave
    // two live tokens or none, and both are worse than failing the refresh.
    const [, created] = await this.prisma.$transaction([
      this.prisma.session.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), revokedReason: SessionRevokeReason.ROTATED },
      }),
      this.prisma.session.create({
        data: {
          userId: existing.userId,
          refreshTokenHash: issued.hash,
          familyId: existing.familyId,
          expiresAt: issued.expiresAt,
          ipAddress: context.ipAddress ?? existing.ipAddress,
          userAgent: context.userAgent ?? existing.userAgent,
          deviceId: context.deviceId ?? existing.deviceId,
        },
      }),
    ]);

    await this.prisma.session.update({
      where: { id: existing.id },
      data: { replacedById: created.id },
    });

    return { kind: 'rotated', session: created, refreshToken: issued.token, previous: existing };
  }

  /** Revoke one session by id, if it belongs to `userId` and is still active. */
  async revokeById(
    sessionId: string,
    userId: string,
    reason: SessionRevokeReason,
  ): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count > 0;
  }

  /** Revoke the session behind a presented refresh token. */
  async revokeByToken(token: string, reason: SessionRevokeReason): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: { refreshTokenHash: this.tokens.hashRefreshToken(token), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count > 0;
  }

  /** Revoke every active session for a user. Returns how many were revoked. */
  async revokeAllForUser(userId: string, reason: SessionRevokeReason): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  private async revokeFamily(familyId: string, reason: SessionRevokeReason): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return result.count;
  }

  /** Active sessions for a user, newest first. */
  async listActive(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  /** True when the session backing an access token is still usable. */
  async isActive(sessionId: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true, expiresAt: true },
    });
    return Boolean(session && !session.revokedAt && session.expiresAt.getTime() > Date.now());
  }

  async touch(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { lastUsedAt: new Date() },
    });
  }
}
