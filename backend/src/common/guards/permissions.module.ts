import { Global, Module } from '@nestjs/common';

import { PermissionsService } from './permissions.service';
import { RolesGuard } from './roles.guard';

/**
 * اختیارات نقش‌ها.
 *
 * `@Global` عمدی است: `RolesGuard` در ۴۹ کنترلر با `@UseGuards` صدا
 * زده می‌شود و نست باید بتواند همه‌جا `PermissionsService` را به آن
 * تزریق کند.  بدون این، هر کنترلر باید این ماژول را جدا وارد می‌کرد —
 * و اولین کنترلری که فراموش می‌شد، هنگام اجرا با خطای تزریق می‌افتاد،
 * نه هنگام ساخت.
 */
@Global()
@Module({
  providers: [PermissionsService, RolesGuard],
  exports: [PermissionsService, RolesGuard],
})
export class PermissionsModule {}
