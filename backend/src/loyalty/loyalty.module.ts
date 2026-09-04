import {
  Body,
  Controller,
  Get,
  Module,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CheckinService } from './checkin.service';
import { LoyaltyService, type Segment } from './loyalty.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { SmsModule } from '../sms/sms.module';

@ApiTags('باشگاه مشتریان')
@ApiBearerAuth()
@Controller('loyalty')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoyaltyController {
  constructor(
    private readonly loyalty: LoyaltyService,
    private readonly checkin: CheckinService,
  ) {}

  /** شمارش هر بخش — پیش از ارسال باید معلوم باشد چند نفر هدف‌اند. */
  @Get('segments')
  segments(@CurrentUser() user: AuthUser) {
    return this.loyalty.segments(user.companyId as string);
  }

  @Get('audience')
  audience(
    @CurrentUser() user: AuthUser,
    @Query('segment') segment: Segment = 'ALL',
    @Query('limit') limit?: string,
  ) {
    return this.loyalty.audience(
      user.companyId as string,
      segment,
      Number(limit) || 100,
    );
  }

  @Get('campaigns')
  campaigns(@CurrentUser() user: AuthUser) {
    return this.loyalty.campaigns(user.companyId as string);
  }

  @Get('campaigns/:id/codes')
  campaignCodes(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.loyalty.campaignCodes(user.companyId as string, id);
  }

  /** ساخت کارزار: صدور کد شخصی برای هر مشتری و ارسال پیامک. */
  @Post('campaigns')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  createCampaign(
    @CurrentUser() user: AuthUser,
    @Body()
    dto: {
      ruleId: string;
      name: string;
      segment: Segment;
      messageTemplate: string;
      expiresAt?: string;
      maxUses?: number;
    },
  ) {
    return this.loyalty.createCampaign(
      user.companyId as string,
      user.userId,
      dto,
    );
  }

  /**
   * خواندن QR شناسایی در صندوق.
   *
   * فقط می‌خواند و مصرف نمی‌کند: صندوق‌دار ممکن است مشتری را بشناسد و بعد
   * فروش را لغو کند.  مصرف در لحظهٔ ثبت فاکتور انجام می‌شود.
   */
  @Post('checkin/resolve')
  resolveCheckin(@CurrentUser() user: AuthUser, @Body() dto: { token: string }) {
    return this.checkin.resolve(user.companyId as string, dto.token);
  }
}

@Module({
  imports: [SmsModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, CheckinService],
  exports: [LoyaltyService, CheckinService],
})
export class LoyaltyModule {}
