import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AuthenticatedActor, MolidoRequest } from '../request-context';

/**
 * Injects the authenticated actor.
 *
 * Throws rather than returning `undefined` on an unauthenticated request: a
 * handler that asks for the actor has already assumed one exists, and a silent
 * `undefined` there is how authorisation checks get skipped.
 */
export const Actor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedActor => {
    const request = context.switchToHttp().getRequest<MolidoRequest>();
    if (!request.actor) {
      throw new UnauthorizedException('Authentication required');
    }
    return request.actor;
  },
);
