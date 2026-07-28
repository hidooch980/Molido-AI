import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CrmService } from './crm.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('CRM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm')
export class CrmController {
  constructor(private readonly service: CrmService) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser) {
    return this.service.stats(user.companyId!);
  }

  // ───────── کوپن تخفیف ─────────
  // پیش از مسیر ':id' تعریف می‌شوند وگرنه «coupons» به عنوان شناسه
  // تفسیر می‌شود و همیشه ۴۰۴ می‌گیرد.

  @Get('coupons')
  coupons(@CurrentUser() user: AuthUser) {
    return this.service.coupons(user.companyId!);
  }

  @Post('coupons')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createCoupon(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createCoupon(user.companyId!, dto);
  }

  /** اعتبارسنجی بدون ثبت مصرف — برای نمایش تخفیف در صندوق. */
  @Post('coupons/validate')
  validateCoupon(
    @CurrentUser() user: AuthUser,
    @Body() dto: { code: string; orderAmount?: number },
  ) {
    return this.service.validateCoupon(
      user.companyId!,
      dto?.code,
      dto?.orderAmount ?? 0,
    );
  }

  /** ثبت مصرف کوپن — شمارنده استفاده را یکی زیاد می‌کند. */
  @Post('coupons/redeem')
  redeemCoupon(
    @CurrentUser() user: AuthUser,
    @Body() dto: { code: string; orderAmount?: number },
  ) {
    return this.service.redeemCoupon(
      user.companyId!,
      dto?.code,
      dto?.orderAmount ?? 0,
    );
  }

  @Patch('coupons/:id/active')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  setCouponActive(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { isActive: boolean },
  ) {
    return this.service.setCouponActive(user.companyId!, id, !!dto?.isActive);
  }

  // ───────── باشگاه مشتریان ─────────

  @Get()
  findAll(@CurrentUser() user: AuthUser, @Query() q: any) {
    return this.service.findAll(user.companyId!, q);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  create(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.create(user.companyId!, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user.companyId!, id);
  }

  /** افزودن یا کسر امتیاز؛ delta منفی یعنی استفاده از امتیاز. */
  @Patch(':id/points')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER')
  addPoints(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: { delta: number },
  ) {
    return this.service.addPoints(user.companyId!, id, Number(dto?.delta ?? 0));
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: any) {
    return this.service.update(user.companyId!, id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user.companyId!, id);
  }
}
