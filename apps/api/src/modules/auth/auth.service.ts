import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { AppConfig } from '@molido/config';
import {
  ActorType,
  AuditOutcome,
  SecurityEventType,
  SessionRevokeReason,
  UserStatus,
  type Session,
  type User,
} from '@molido/database';
import {
  isValidEmail,
  maskEmail,
  normalizeEmail,
  ScryptPasswordHasher,
  validatePassword,
} from '@molido/security';
import type { AuthResponse, Permission, PublicSession, PublicUser, RoleName } from '@molido/types';
import { APP_CONFIG } from '../../config/config.module';
import { AuditService } from '../oversight/audit.service';
import { SecurityEventService } from '../oversight/security-event.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService, type SessionContext } from './session.service';
import { TokenService } from './token.service';

/**
 * A single message for every authentication failure.
 *
 * "No account with that email" and "wrong password" are the same sentence here.
 * Distinguishing them turns the login form into an account-enumeration oracle.
 */
const AUTH_FAILURE_MESSAGE = 'Invalid email or password';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly hasher = new ScryptPasswordHasher();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly securityEvents: SecurityEventService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ------------------------------------------------------------------
  // Registration
  // ------------------------------------------------------------------

  async register(
    input: { email: string; password: string; displayName?: string; deviceId?: string },
    context: SessionContext,
  ): Promise<AuthResponse> {
    const email = normalizeEmail(input.email);

    if (!isValidEmail(email)) {
      throw new ForbiddenException('A valid email address is required');
    }

    const policy = validatePassword(input.password, { email });
    if (!policy.valid) {
      await this.securityEvents.record({
        type: SecurityEventType.REGISTER_FAILURE,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { reason: 'password policy', email: maskEmail(email) },
      });
      throw new ForbiddenException(policy.errors);
    }

    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      // The address is already taken, but saying so would confirm an account
      // exists. The caller is told the request could not be completed, and the
      // real reason is recorded server-side.
      await this.securityEvents.record({
        type: SecurityEventType.REGISTER_FAILURE,
        userId: existing.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { reason: 'email already registered', email: maskEmail(email) },
      });
      throw new ForbiddenException(
        'Registration could not be completed. If you already have an account, sign in instead.',
      );
    }

    const passwordHash = await this.hasher.hash(input.password);
    const userRole = await this.prisma.role.findUnique({ where: { name: 'USER' } });

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: input.displayName ?? null,
        // New accounts get exactly the USER role. Elevation is a deliberate,
        // audited act — never something a registration payload can request.
        roles: userRole ? { create: [{ roleId: userRole.id }] } : undefined,
      },
    });

    await Promise.all([
      this.audit.record({
        actorType: ActorType.USER,
        actorId: user.id,
        actorUserId: user.id,
        action: 'auth.register',
        resource: 'user',
        resourceId: user.id,
        outcome: AuditOutcome.SUCCESS,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      }),
      this.securityEvents.record({
        type: SecurityEventType.REGISTER_SUCCESS,
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      }),
    ]);

    return this.issueSession(user, context);
  }

  // ------------------------------------------------------------------
  // Login
  // ------------------------------------------------------------------

  async login(
    input: { email: string; password: string; deviceId?: string },
    context: SessionContext,
  ): Promise<AuthResponse> {
    const email = normalizeEmail(input.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      // Hash a dummy value anyway. Returning early would make "unknown email"
      // measurably faster than "wrong password" and hand out an enumeration
      // oracle through timing alone.
      await this.hasher.verify(input.password, DUMMY_HASH);
      await this.securityEvents.record({
        type: SecurityEventType.LOGIN_FAILURE,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { reason: 'unknown account', email: maskEmail(email) },
      });
      throw new UnauthorizedException(AUTH_FAILURE_MESSAGE);
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await this.securityEvents.record({
        type: SecurityEventType.LOGIN_FAILURE,
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { reason: 'account temporarily locked' },
      });
      throw new UnauthorizedException(AUTH_FAILURE_MESSAGE);
    }

    const passwordMatches = await this.hasher.verify(input.password, user.passwordHash);

    if (!passwordMatches) {
      await this.registerFailedLogin(user, context);
      throw new UnauthorizedException(AUTH_FAILURE_MESSAGE);
    }

    if (user.status !== UserStatus.ACTIVE) {
      // Correct credentials, but the account may not be used. This one is safe
      // to state plainly: the caller has already proven they own the account.
      await this.securityEvents.record({
        type: SecurityEventType.LOGIN_FAILURE,
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { reason: `account status ${user.status}` },
      });
      throw new ForbiddenException('This account is not active. Contact an administrator.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    await Promise.all([
      this.audit.record({
        actorType: ActorType.USER,
        actorId: user.id,
        actorUserId: user.id,
        action: 'auth.login',
        resource: 'session',
        outcome: AuditOutcome.SUCCESS,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      }),
      this.securityEvents.record({
        type: SecurityEventType.LOGIN_SUCCESS,
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      }),
    ]);

    return this.issueSession(user, context);
  }

  private async registerFailedLogin(user: User, context: SessionContext): Promise<void> {
    const failedLoginCount = user.failedLoginCount + 1;
    const shouldLock = failedLoginCount >= this.config.auth.maxFailedLogins;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount,
        lockedUntil: shouldLock
          ? new Date(Date.now() + this.config.auth.accountLockMinutes * 60_000)
          : user.lockedUntil,
      },
    });

    await this.securityEvents.record({
      type: SecurityEventType.LOGIN_FAILURE,
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { reason: 'incorrect password', failedLoginCount },
    });

    if (shouldLock) {
      await this.securityEvents.record({
        type: SecurityEventType.ACCOUNT_LOCKED,
        userId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { lockMinutes: this.config.auth.accountLockMinutes, failedLoginCount },
      });
      // Locking out is also a signal that every live session may be at risk.
      await this.sessions.revokeAllForUser(user.id, SessionRevokeReason.ADMIN_REVOKED);
    }
  }

  // ------------------------------------------------------------------
  // Refresh
  // ------------------------------------------------------------------

  async refresh(refreshToken: string, context: SessionContext): Promise<AuthResponse> {
    const result = await this.sessions.rotate(refreshToken, context);

    if (result.kind === 'reuse-detected') {
      await this.audit.record({
        actorType: ActorType.USER,
        actorId: result.userId,
        actorUserId: result.userId,
        action: 'auth.token.reuse',
        resource: 'session',
        resourceId: result.familyId,
        outcome: AuditOutcome.DENIED,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      });
      // The client is told only that the session ended. Confirming "we detected
      // your stolen token" would tell an attacker exactly what tripped.
      throw new UnauthorizedException('Session is no longer valid. Please sign in again.');
    }

    if (result.kind !== 'rotated') {
      await this.securityEvents.record({
        type: SecurityEventType.LOGIN_FAILURE,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { reason: `refresh ${result.kind}` },
      });
      throw new UnauthorizedException('Session is no longer valid. Please sign in again.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: result.session.userId } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      await this.sessions.revokeById(
        result.session.id,
        result.session.userId,
        SessionRevokeReason.ADMIN_REVOKED,
      );
      throw new UnauthorizedException('Session is no longer valid. Please sign in again.');
    }

    await this.securityEvents.record({
      type: SecurityEventType.TOKEN_REFRESH,
      userId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });

    return this.buildAuthResponse(user, result.session, result.refreshToken);
  }

  // ------------------------------------------------------------------
  // Logout
  // ------------------------------------------------------------------

  async logout(
    userId: string,
    sessionId: string,
    refreshToken: string | undefined,
    context: SessionContext,
  ): Promise<{ revoked: number }> {
    let revoked = 0;

    if (refreshToken) {
      revoked += (await this.sessions.revokeByToken(refreshToken, SessionRevokeReason.LOGOUT))
        ? 1
        : 0;
    }
    // Always revoke the session the access token was minted for, so a logout
    // works even when the client has mislaid its refresh token.
    revoked += (await this.sessions.revokeById(sessionId, userId, SessionRevokeReason.LOGOUT))
      ? 1
      : 0;

    await Promise.all([
      this.audit.record({
        actorType: ActorType.USER,
        actorId: userId,
        actorUserId: userId,
        action: 'auth.logout',
        resource: 'session',
        resourceId: sessionId,
        outcome: AuditOutcome.SUCCESS,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      }),
      this.securityEvents.record({
        type: SecurityEventType.LOGOUT,
        userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
      }),
    ]);

    return { revoked };
  }

  async logoutAll(userId: string, context: SessionContext): Promise<{ revoked: number }> {
    const revoked = await this.sessions.revokeAllForUser(userId, SessionRevokeReason.LOGOUT_ALL);

    await Promise.all([
      this.audit.record({
        actorType: ActorType.USER,
        actorId: userId,
        actorUserId: userId,
        action: 'auth.logout.all',
        resource: 'session',
        outcome: AuditOutcome.SUCCESS,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { revoked },
      }),
      this.securityEvents.record({
        type: SecurityEventType.LOGOUT_ALL,
        userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { revoked },
      }),
    ]);

    return { revoked };
  }

  // ------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------

  async getPublicUser(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    });
    if (!user) throw new UnauthorizedException('Session is no longer valid. Please sign in again.');
    return toPublicUser(user);
  }

  async listSessions(userId: string, currentSessionId: string): Promise<PublicSession[]> {
    const sessions = await this.sessions.listActive(userId);
    return sessions.map((session) => ({
      id: session.id,
      ip: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    context: SessionContext,
  ): Promise<boolean> {
    const revoked = await this.sessions.revokeById(
      sessionId,
      userId,
      SessionRevokeReason.ADMIN_REVOKED,
    );

    await this.audit.record({
      actorType: ActorType.USER,
      actorId: userId,
      actorUserId: userId,
      action: 'auth.session.revoke',
      resource: 'session',
      resourceId: sessionId,
      outcome: revoked ? AuditOutcome.SUCCESS : AuditOutcome.FAILURE,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      requestId: context.requestId,
    });

    if (revoked) {
      await this.securityEvents.record({
        type: SecurityEventType.SESSION_REVOKED,
        userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { sessionId },
      });
    }

    return revoked;
  }

  // ------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------

  private async issueSession(user: User, context: SessionContext): Promise<AuthResponse> {
    const { session, refreshToken } = await this.sessions.create(user.id, context);
    return this.buildAuthResponse(user, session, refreshToken);
  }

  private async buildAuthResponse(
    user: User,
    session: Session,
    refreshToken: string,
  ): Promise<AuthResponse> {
    const publicUser = await this.getPublicUser(user.id);

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      sid: session.id,
      email: user.email,
      roles: publicUser.roles,
      permissions: publicUser.permissions,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTokenTtlSeconds,
      user: publicUser,
    };
  }
}

/**
 * A real scrypt hash of a value nobody knows, used to equalise the cost of a
 * login attempt against an address that does not exist.
 */
const DUMMY_HASH =
  'scrypt$N=131072,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

type UserWithRoles = User & {
  roles: { role: { name: RoleName; permissions: { permission: { code: string } }[] } }[];
};

/**
 * Project a user row into its public representation.
 *
 * `passwordHash` is never spread in here — every field is listed explicitly, so
 * a new sensitive column cannot leak into an API response by accident.
 */
export function toPublicUser(user: UserWithRoles): PublicUser {
  const roles = user.roles.map((assignment) => assignment.role.name);
  const permissions = [
    ...new Set(
      user.roles.flatMap((assignment) =>
        assignment.role.permissions.map((grant) => grant.permission.code),
      ),
    ),
  ] as Permission[];

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    roles,
    permissions,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
