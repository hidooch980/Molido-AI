import {
  Body,
  Controller,
  Get,
  Global,
  Module,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { OperationsService } from './operations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('عملیات')
@ApiBearerAuth()
@Controller('operations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  // ---------- خطا ----------

  @Get('errors')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  errors(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.operations.errors(user.companyId as string, status ?? 'OPEN');
  }

  @Patch('errors/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { status: string; note?: string },
  ) {
    return this.operations.setErrorStatus(
      user.companyId as string,
      id,
      dto?.status,
      dto?.note,
    );
  }

  // ---------- سلامت ----------

  /**
   * عکس تازه از وضعیت.
   *
   * `POST` است چون سطر جدید می‌سازد؛ `GET` که داده بنویسد، با هر
   * تازه‌سازی مرورگر تاریخچه را پر می‌کند.
   */
  @Post('health')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  snapshot(@CurrentUser() user: AuthUser) {
    return this.operations.snapshot(user.companyId as string);
  }

  @Get('health')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  history(@CurrentUser() user: AuthUser) {
    return this.operations.healthHistory(user.companyId as string);
  }

  // ---------- پشتیبانی ----------

  @Get('support')
  @Roles('SUPER_ADMIN', 'ADMIN')
  sessions(@CurrentUser() user: AuthUser) {
    return this.operations.supportSessions(user.companyId as string);
  }

  /**
   * دادن دسترسی موقت به پشتیبان.
   *
   * فقط مدیر، و کد را **او** می‌سازد نه پشتیبان — این تفاوت بین کمک
   * گرفتن و درِ پشتی است.
   */
  @Post('support')
  @Roles('SUPER_ADMIN', 'ADMIN')
  grant(
    @CurrentUser() user: AuthUser,
    @Body() dto: { minutes?: number; scope?: string; reason?: string },
  ) {
    return this.operations.grantSupport(
      user.companyId as string,
      user.userId,
      dto ?? {},
    );
  }

  @Patch('support/:id/revoke')
  @Roles('SUPER_ADMIN', 'ADMIN')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.operations.revokeSupport(user.companyId as string, id);
  }
}

/**
 * سراسری، چون فیلتر خطا در `main.ts` ساخته می‌شود و باید بتواند سرویس را
 * از کانتینر بگیرد.
 */
@Global()
@Module({
  controllers: [OperationsController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
