import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SecurityEventType } from '@molido/database';
import type { Permission } from '@molido/types';
import { SecurityEventService } from '../../modules/oversight/security-event.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { clientIp, clientUserAgent, type MolidoRequest } from '../request-context';

/**
 * Enforces the permissions a route declares.
 *
 * This is the authorisation boundary. The frontend may hide a button, but the
 * decision that matters is made here, on the server, against the permissions
 * the database granted — not against a role name the client sent.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly securityEvents: SecurityEventService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<MolidoRequest>();
    const actor = request.actor;

    if (!actor) {
      // Reaching here means the route required a permission but authentication
      // never ran. That is a wiring bug, and it must fail closed.
      throw new ForbiddenException('Access denied');
    }

    const held = new Set(actor.permissions);
    const missing = required.filter((permission) => !held.has(permission));

    if (missing.length > 0) {
      await this.securityEvents.record({
        type: SecurityEventType.AUTHORIZATION_FAILURE,
        userId: actor.userId,
        ipAddress: clientIp(request),
        userAgent: clientUserAgent(request),
        requestId: request.requestId,
        metadata: {
          route: `${request.method} ${request.url}`,
          required,
          // The missing permissions are recorded for the operator but never
          // returned to the caller — that would map out the permission model.
          missing,
        },
      });
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
