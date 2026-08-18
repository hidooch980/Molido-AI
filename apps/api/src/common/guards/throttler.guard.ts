import { type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SecurityEventType } from '@molido/database';
import {
  getOptionsToken,
  getStorageToken,
  ThrottlerGuard,
  ThrottlerStorage,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { SecurityEventService } from '../../modules/oversight/security-event.service';
import { clientIp, clientUserAgent, type MolidoRequest } from '../request-context';

/**
 * Rate limiting that leaves a trace.
 *
 * A limiter that silently returns 429 protects the endpoint but tells nobody a
 * credential-stuffing run is underway. Every trip is recorded as a security
 * event so the pattern is visible after the fact.
 *
 * The base constructor's parameters are re-declared with their concrete types
 * and injection tokens: Nest resolves constructor dependencies from emitted
 * decorator metadata, and an inferred type erases to `Object`.
 */
@Injectable()
export class MolidoThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(getOptionsToken()) options: ThrottlerModuleOptions,
    @Inject(getStorageToken()) storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly securityEvents: SecurityEventService,
  ) {
    super(options, storageService, reflector);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<MolidoRequest>();

    await this.securityEvents.record({
      type: SecurityEventType.RATE_LIMIT_TRIGGERED,
      userId: request.actor?.userId ?? null,
      ipAddress: clientIp(request),
      userAgent: clientUserAgent(request),
      requestId: request.requestId,
      metadata: {
        route: `${request.method} ${request.url}`,
        limit: throttlerLimitDetail.limit,
        ttlMs: throttlerLimitDetail.ttl,
      },
    });

    return super.throwThrottlingException(context, throttlerLimitDetail);
  }

  /**
   * Identify the caller for counting purposes.
   *
   * An authenticated user is tracked by user id so one abusive account cannot
   * exhaust the shared quota of everyone behind the same NAT. Anonymous traffic
   * falls back to the address Fastify resolved.
   */
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as MolidoRequest;
    return request.actor?.userId ?? clientIp(request) ?? 'unknown';
  }
}
