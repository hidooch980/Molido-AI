import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { SubscriptionService } from './subscription.service';

@ApiTags('اشتراک')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly service: SubscriptionService) {}

  /**
   * اشتراکِ شرکتِ خودم.
   *
   * ⚠️ هر کاربری می‌تواند ببیندش، عمداً.
   *
   *    «چند روز مانده» را باید صندوق‌دار هم بداند، نه فقط مدیر.
   *    غافلگیری در لحظهٔ قطعِ سرویس، بدترین حالتِ ممکن است.
   */
  @Get('mine')
  @ApiOperation({ summary: 'اشتراکِ شرکتِ جاری' })
  async mine(@CurrentUser() user: AuthUser) {
    const sub = await this.service.forCompany(user.companyId as string);
    const state = this.service.effective(sub);

    return {
      plan: sub?.plan ?? null,
      status: sub?.status ?? null,
      endsOn: sub?.endsOn ?? null,
      maxUsers: sub?.maxUsers ?? null,
      active: state.active,
      daysLeft: state.daysLeft,
      reason: state.reason,
    };
  }

  /**
   * سه نسخهٔ فروش و سقف‌هایشان.
   *
   * ⚠️ باز برای همه: صفحهٔ «ارتقا» باید بتواند نشان بدهد نسخهٔ بعدی
   *    چه می‌دهد.
   */
  @Get('plans')
  @ApiOperation({ summary: 'نسخه‌های فروش و سقف‌هایشان' })
  plans() {
    return this.service.plans();
  }

  // ═══════════════ فروشنده ═══════════════

  /**
   * فهرستِ همهٔ مشتریان.
   *
   * ⚠️ فقط `SUPER_ADMIN` — این تنها مسیری است که مرزِ شرکت را عبور
   *    می‌کند.  اگر روزی نقشِ دیگری اضافه شود، هر مشتری فهرستِ
   *    مشتریانِ دیگر را می‌بیند.
   */
  @Get('customers')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'فهرست مشتریان و وضعیت اشتراکشان' })
  customers() {
    return this.service.listAll();
  }

  @Put('customers/:companyId')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'ثبت یا تمدید اشتراکِ یک مشتری' })
  upsert(
    @Param('companyId') companyId: string,
    @Body()
    body: {
      plan?: string;
      status?: string;
      endsOn?: string | null;
      maxUsers?: number | null;
      maxBranches?: number | null;
      product?: string | null;
      note?: string | null;
    },
  ) {
    return this.service.upsert(companyId, body ?? {});
  }
}
