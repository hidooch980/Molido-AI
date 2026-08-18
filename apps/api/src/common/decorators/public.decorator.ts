import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'molido:isPublic';

/**
 * Marks a route as reachable without authentication.
 *
 * Authentication is applied globally, so every route is protected unless it
 * opts out here. Forgetting the decorator makes a route private — the safe
 * failure mode.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
