import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@molido/types';

export const PERMISSIONS_KEY = 'molido:permissions';

/**
 * Declares the permissions a route requires. All listed permissions must be
 * held — the check is AND, never OR.
 */
export const RequirePermissions = (
  ...permissions: Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);
