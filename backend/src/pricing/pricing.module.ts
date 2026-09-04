import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { PricingService, type QuoteLine } from './pricing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';

const MANAGE = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] as const;

@ApiTags('قیمت‌گذاری و تخفیف')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing')
export class PricingController {
  constructor(private readonly service: PricingService) {}

  // ---------- سطح قیمت ----------

  @Get('levels')
  levels(@CurrentUser() user: AuthUser) {
    return this.service.priceLevels(user.companyId!);
  }

  @Post('levels')
  @Roles(...MANAGE)
  createLevel(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createPriceLevel(user.companyId!, dto);
  }

  @Get('products/:id/prices')
  productPrices(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.productPrices(user.companyId!, id);
  }

  @Post('prices')
  @Roles(...MANAGE)
  setPrice(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.setProductPrice(user.companyId!, dto);
  }

  // ---------- تخفیف ----------

  @Get('rules')
  rules(@CurrentUser() user: AuthUser) {
    return this.service.rules(user.companyId!);
  }

  @Post('rules')
  @Roles(...MANAGE)
  createRule(@CurrentUser() user: AuthUser, @Body() dto: any) {
    return this.service.createRule(user.companyId!, dto);
  }

  @Patch('rules/:id/toggle')
  @Roles(...MANAGE)
  toggleRule(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.toggleRule(user.companyId!, id);
  }

  /**
   * قیمت‌گذاری سبد.
   *
   * صندوق پیش از ثبت فاکتور این را صدا می‌زند تا مبلغ نهایی را سرور
   * تعیین کند — نه کلاینت.
   */
  @Post('quote')
  quote(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: {
      lines: QuoteLine[];
      customerId?: string;
      priceLevelId?: string;
      code?: string;
    },
  ) {
    return this.service.quote(user.companyId!, dto?.lines ?? [], {
      customerId: dto?.customerId,
      priceLevelId: dto?.priceLevelId,
      code: dto?.code,
    });
  }
}

@Module({
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
