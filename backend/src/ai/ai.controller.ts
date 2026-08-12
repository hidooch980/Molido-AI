import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { AiService } from './ai.service';
import { AssistantService } from './assistant.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly assistant: AssistantService,
  ) {}

  // ---------- دستیار ----------

  /** پرسش به زبان فارسی از دادهٔ فروشگاه. */
  @Post('ask')
  ask(@Body() body: { question: string }, @CurrentUser() user: AuthUser) {
    return this.assistant.ask(user.companyId as string, body?.question ?? '');
  }

  /** آنچه مدیر باید امروز بداند، بدون آنکه بپرسد. */
  @Get('briefing')
  briefing(@CurrentUser() user: AuthUser) {
    return this.assistant.briefing(user.companyId as string);
  }

  @Get('sales-analysis')
  salesAnalysis(@CurrentUser() user: AuthUser) {
    return this.aiService.salesAnalysis(user.companyId as string);
  }

  @Get('inventory-analysis')
  inventoryAnalysis(@CurrentUser() user: AuthUser) {
    return this.aiService.inventoryAnalysis(user.companyId as string);
  }

  @Get('price-suggestions')
  priceSuggestions(
    @CurrentUser() user: AuthUser,
    @Query('targetMargin') targetMargin?: string,
  ) {
    return this.aiService.priceSuggestions(
      user.companyId as string,
      targetMargin ? Number(targetMargin) : 25,
    );
  }

  @Get('expiry-analysis')
  expiryAnalysis(
    @CurrentUser() user: AuthUser,
    @Query('daysAhead') daysAhead?: string,
  ) {
    return this.aiService.expiryAnalysis(
      user.companyId as string,
      daysAhead ? Number(daysAhead) : 30,
    );
  }

  /**
   * گزارش مدیریتی هوشمند — اگر AI_API_KEY تنظیم باشد از مدل زبانی استفاده
   * می‌شود، در غیر این صورت گزارش تحلیلی داخلی تولید می‌شود
   */
  @Get('manager-report')
  managerReport(
    @CurrentUser() user: AuthUser,
    @Query('lang') lang?: string,
  ) {
    return this.aiService.managerReport(
      user.companyId as string,
      lang === 'en' || lang === 'ar' ? lang : 'fa',
    );
  }

  // ---------- تحلیل‌های فروشگاهی ----------

  /** پیشنهاد سفارش خرید بر پایهٔ سرعت فروش و زمان تأمین */
  @Get('reorder-suggestions')
  reorderSuggestions(
    @CurrentUser() user: AuthUser,
    @Query('leadTimeDays') leadTimeDays?: string,
    @Query('coverDays') coverDays?: string,
  ) {
    return this.aiService.reorderSuggestions(user.companyId as string, {
      leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
      coverDays: coverDays ? Number(coverDays) : undefined,
    });
  }

  /** کالای راکد و سرمایهٔ خوابیده */
  @Get('dead-stock')
  deadStock(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.aiService.deadStock(
      user.companyId as string,
      days ? Number(days) : undefined,
    );
  }

  /** مغایرت غیرعادی صندوق */
  @Get('cashier-anomalies')
  cashierAnomalies(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.aiService.cashierAnomalies(
      user.companyId as string,
      days ? Number(days) : undefined,
    );
  }

  /** پیش‌بینی فروش روزهای آینده */
  @Get('sales-forecast')
  salesForecast(@CurrentUser() user: AuthUser, @Query('daysAhead') daysAhead?: string) {
    return this.aiService.salesForecast(
      user.companyId as string,
      daysAhead ? Number(daysAhead) : undefined,
    );
  }
}
