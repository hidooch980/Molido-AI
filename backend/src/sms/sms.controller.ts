import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { SmsService } from './sms.service';
import { SmsCampaignService } from './sms-campaign.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import {
  SmsOptOutDto,
  SmsPreviewDto,
  SmsSendDto,
  SmsTemplateDto,
} from './dto/sms.dto';

@Controller('sms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SmsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly campaigns: SmsCampaignService,
  ) {}

  // ---------- ارسال ----------

  /**
   * پیش‌نمایش پیش از ارسال — هیچ پیامی فرستاده نمی‌شود.
   *
   * دکمه‌ای که مستقیم به هزار مشتری پیام می‌دهد بدون اینکه بگوید چند
   * نفر و چند قبض، دیر یا زود یک اشتباه گران می‌سازد.
   */
  @Post('preview')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  preview(@CurrentUser() user: AuthUser, @Body() dto: SmsPreviewDto) {
    return this.campaigns.preview(user.companyId as string, dto);
  }

  @Post('send')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  send(@CurrentUser() user: AuthUser, @Body() dto: SmsSendDto) {
    return this.campaigns.send(user.companyId as string, dto);
  }

  // ---------- تاریخچه ----------

  @Get('history')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  history(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('phone') phone?: string,
    @Query('limit') limit?: string,
  ) {
    return this.campaigns.history(user.companyId as string, {
      status,
      phone,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('stats')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  stats(@CurrentUser() user: AuthUser) {
    return this.campaigns.stats(user.companyId as string);
  }

  // ---------- انصراف ----------

  @Get('opt-out')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  optedOut(@CurrentUser() user: AuthUser) {
    return this.campaigns.optedOut(user.companyId as string);
  }

  /**
   * ثبت انصراف یا بازگشت مشتری.
   *
   * صندوق‌دار هم می‌تواند: مشتری معمولاً همان لحظه‌ای که پای صندوق است
   * می‌گوید «دیگر پیامک نفرستید»، و اگر ثبتش نیاز به مدیر داشته باشد،
   * ثبت نمی‌شود.
   */
  @Post('opt-out')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER')
  setOptOut(@CurrentUser() user: AuthUser, @Body() dto: SmsOptOutDto) {
    return this.campaigns.setOptOut(
      user.companyId as string,
      dto.phone,
      dto.optOut ?? true,
    );
  }

  // ---------- قالب ----------

  @Get('templates')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  templates(@CurrentUser() user: AuthUser) {
    return this.campaigns.templates(user.companyId as string);
  }

  @Post('templates')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  saveTemplate(@CurrentUser() user: AuthUser, @Body() dto: SmsTemplateDto) {
    return this.campaigns.saveTemplate(user.companyId as string, dto);
  }

  @Delete('templates/:id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  removeTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.campaigns.removeTemplate(user.companyId as string, id);
  }

  // ---------- ارسال تکی (سازگاری با کد موجود) ----------

  @Post('send-one')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  sendOne(@Body() body: SmsPreviewDto & { to?: string }) {
    return this.smsService.send(String(body.to ?? ''), body.body);
  }
}
