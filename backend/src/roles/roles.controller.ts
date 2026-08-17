import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';

import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsService } from '../common/guards/permissions.service';
import { PERMISSION_CATALOG, ROLE_LABELS, isKnownPermission } from './permission-catalog';
import { SetRolePermissionDto } from './dto/role-permission.dto';

/**
 * ویرایش اختیارات نقش‌ها.
 *
 * ⚠️ خودِ این مسیرها عمداً `@Permission` ندارند.
 *
 *    یعنی قابلِ بازنویسی نیستند و همیشه فقط مدیر ارشد و مدیر می‌توانند
 *    صدایشان بزنند.  اگر بازنویسی‌پذیر بودند، یک نقش می‌توانست به خودش
 *    اختیارِ تغییرِ اختیارات بدهد و از آنجا هر در دیگری را باز کند.
 */
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(private readonly permissions: PermissionsService) {}

  /**
   * فهرست اختیارات و وضعیت فعلی‌شان.
   *
   * رابط از این می‌سازد: هر اختیار، پیش‌فرضِ کد، و اینکه آیا برای این
   * نقش بازنویسی شده.
   */
  @Get('permissions')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  async catalog(@CurrentUser() user: AuthUser) {
    const overrides = await this.permissions.listFor(user.companyId as string);

    const byKey = new Map(
      overrides.map((o) => [`${o.role}:${o.permission}`, o.allowed]),
    );

    return {
      roles: ROLE_LABELS,
      groups: PERMISSION_CATALOG.map((group) => ({
        group: group.group,
        label: group.label,
        items: group.items.map((item) => ({
          key: item.key,
          label: item.label,
          // پیش‌فرضِ کد — همان چیزی که `@Roles` می‌گوید.
          defaultRoles: item.defaultRoles,
          // و بازنویسی‌ها، اگر باشند.  `undefined` یعنی «دست‌نخورده».
          overrides: Object.fromEntries(
            ROLE_LABELS.map((r) => [r.code, byKey.get(`${r.code}:${item.key}`)]).filter(
              ([, v]) => v !== undefined,
            ),
          ),
        })),
      })),
    };
  }

  /** دادن یا گرفتن یک اختیار از یک نقش. */
  @Put()
  @Roles('SUPER_ADMIN', 'ADMIN')
  async set(@CurrentUser() user: AuthUser, @Body() dto: SetRolePermissionDto) {
    if (!isKnownPermission(dto.permission)) {
      // اختیارِ ناشناس یعنی رابط و کد از هم دور افتاده‌اند.  پذیرفتنش
      // ردیفی می‌سازد که هیچ‌وقت خوانده نمی‌شود و کسی هم نمی‌فهمد چرا
      // تنظیمش اثر ندارد.
      throw new BadRequestException(`اختیار «${dto.permission}» شناخته نشد`);
    }
    if (dto.role === 'SUPER_ADMIN' && !dto.allowed) {
      throw new BadRequestException(
        'اختیار مدیر ارشد گرفته نمی‌شود؛ وگرنه راه برگشتی نمی‌ماند',
      );
    }

    return this.permissions.set(
      user.companyId as string,
      dto.role,
      dto.permission,
      dto.allowed,
      user.userId,
    );
  }

  /**
   * برگرداندن یک اختیار به پیش‌فرضِ کد.
   *
   * حذفِ ردیف، نه گذاشتنِ `false`: نبودِ ردیف یعنی «هرچه کد گفته»، که
   * با «ممنوع» فرق دارد.
   */
  @Delete(':role/:permission')
  @Roles('SUPER_ADMIN', 'ADMIN')
  async reset(
    @CurrentUser() user: AuthUser,
    @Param('role') role: string,
    @Param('permission') permission: string,
  ) {
    return this.permissions.reset(user.companyId as string, role, permission);
  }
}
