import { Injectable } from '@nestjs/common';
import { AiTaskStatus, SecurityEventType, Severity, UserStatus } from '@molido/database';
import { checkDatabaseHealth } from '@molido/database';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SystemStateService } from '../system/system-state.service';
import { AiProviderService } from '../ai/ai.provider';

export interface FounderOverview {
  users: { total: number; active: number; suspended: number; newLast7Days: number };
  aiTasks: { total: number; completed: number; failed: number; pending: number; running: number; cancelled: number };
  sessions: { active: number };
  security: { events: number; highOrCritical: number; last24h: number };
  /** Revenue is zero because there is no revenue. It is not a placeholder. */
  revenue: { amount: number; currency: string; note: string };
  /** The network does not exist yet. Reported as zero, never as "coming soon". */
  network: { nodes: number; note: string };
  system: { mode: string; reason: string | null; changedAt: string };
  health: {
    api: 'ok';
    database: 'ok' | 'down';
    redis: 'ok' | 'down';
    ai: 'configured' | 'not_configured' | 'down';
  };
  generatedAt: string;
}

export interface FounderSecurityFeed {
  counts: Record<string, number>;
  bySeverity: Record<string, number>;
  recent: {
    id: string;
    type: SecurityEventType;
    severity: Severity;
    createdAt: string;
    /** Masked. The feed shows that something happened, not who to target. */
    ipAddress: string | null;
    userId: string | null;
  }[];
}

/**
 * Read-only view of what is actually in the database.
 *
 * Every number here is a real count. Nothing is estimated, projected, or
 * rounded up, and zero is reported as zero — a dashboard that invents growth
 * is worse than no dashboard, because it destroys the Founder's ability to
 * tell whether the thing is working.
 */
@Injectable()
export class FounderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly systemState: SystemStateService,
    private readonly aiProvider: AiProviderService,
  ) {}

  async overview(): Promise<FounderOverview> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();

    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      newUsers,
      taskCounts,
      activeSessions,
      securityEvents,
      severeEvents,
      recentEvents,
      state,
      database,
      redis,
      aiHealth,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.aiTask.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
      this.prisma.securityEvent.count(),
      this.prisma.securityEvent.count({
        where: { severity: { in: [Severity.HIGH, Severity.CRITICAL] } },
      }),
      this.prisma.securityEvent.count({ where: { createdAt: { gte: dayAgo } } }),
      this.systemState.current(),
      checkDatabaseHealth(this.prisma),
      this.redis.health(),
      this.aiProvider.health(),
    ]);

    const byStatus = (status: AiTaskStatus): number =>
      taskCounts.find((row) => row.status === status)?._count._all ?? 0;

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        suspended: suspendedUsers,
        newLast7Days: newUsers,
      },
      aiTasks: {
        total: taskCounts.reduce((sum, row) => sum + row._count._all, 0),
        completed: byStatus(AiTaskStatus.COMPLETED),
        failed: byStatus(AiTaskStatus.FAILED),
        pending: byStatus(AiTaskStatus.PENDING),
        running: byStatus(AiTaskStatus.RUNNING),
        cancelled: byStatus(AiTaskStatus.CANCELLED),
      },
      sessions: { active: activeSessions },
      security: {
        events: securityEvents,
        highOrCritical: severeEvents,
        last24h: recentEvents,
      },
      revenue: {
        amount: 0,
        currency: 'USD',
        note: 'No billing exists yet. This is a real zero, not a placeholder.',
      },
      network: {
        nodes: 0,
        note: 'No network exists yet. Nothing is deployed, staked, or mined.',
      },
      system: {
        mode: state.mode,
        reason: state.reason,
        changedAt: state.changedAt.toISOString(),
      },
      health: {
        api: 'ok',
        database: database.status,
        redis: redis.status,
        ai:
          aiHealth.status === 'not_configured'
            ? 'not_configured'
            : aiHealth.status === 'ok'
              ? 'configured'
              : 'down',
      },
      generatedAt: new Date().toISOString(),
    };
  }

  async securityFeed(limit = 50): Promise<FounderSecurityFeed> {
    const [byType, bySeverity, recent] = await Promise.all([
      this.prisma.securityEvent.groupBy({ by: ['type'], _count: { _all: true } }),
      this.prisma.securityEvent.groupBy({ by: ['severity'], _count: { _all: true } }),
      this.prisma.securityEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: Math.min(limit, 100),
        select: {
          id: true,
          type: true,
          severity: true,
          createdAt: true,
          ipAddress: true,
          userId: true,
        },
      }),
    ]);

    return {
      counts: Object.fromEntries(byType.map((row) => [row.type, row._count._all])),
      bySeverity: Object.fromEntries(bySeverity.map((row) => [row.severity, row._count._all])),
      // `metadata` is deliberately not returned. The feed answers "what is
      // happening"; the full record stays in the database for an investigation
      // that warrants it.
      recent: recent.map((event) => ({
        id: event.id,
        type: event.type,
        severity: event.severity,
        createdAt: event.createdAt.toISOString(),
        ipAddress: maskIp(event.ipAddress),
        userId: event.userId,
      })),
    };
  }
}

/**
 * Mask the final octet of an IPv4 address, or the tail of an IPv6 one.
 *
 * Enough to spot "many failures from one network" without turning the Founder
 * dashboard into a list of individually identifiable people.
 */
function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.x` : ip;
  }
  const segments = ip.split(':');
  return segments.length > 2 ? `${segments.slice(0, 3).join(':')}::x` : ip;
}
