import { Module } from '@nestjs/common';

import { RolesController } from './roles.controller';

/**
 * ویرایش اختیارات نقش‌ها.
 *
 * `PermissionsService` از `PermissionsModule` می‌آید که `@Global` است،
 * پس اینجا وارد نمی‌شود.
 */
@Module({
  controllers: [RolesController],
})
export class RolesModule {}
