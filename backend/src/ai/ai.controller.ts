import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { AiService } from './ai.service';
import { AssistantService } from './assistant.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

/**
 * ⚠️ هوش مصنوعی نمی‌تواند اختیارات کاربر را زیاد کند.
 *
 *    تا امروز این کنترلر فقط `JwtAuthGuard` داشت — یعنی **هر** کاربرِ
 *    واردشده به همهٔ تحلیل‌ها دسترسی داشت.  با آزمون زنده تأیید شد:
 *
 *      کاربر با نقشِ CASHIER
 *        /ai/manager-report      ۲۰۰
 *        /ai/cashier-anomalies   ۲۰۰   ← بدترینش
 *        /ai/sales-forecast      ۲۰۰
 *        /ai/dead-stock          ۲۰۰
 *
 *    `cashier-anomalies` مغایرتِ غیرعادیِ صندوق را می‌دهد — یعنی
 *    ابزاری که برای گرفتنِ صندوق‌دار ساخته شده، در دسترسِ خودِ
 *    صندوق‌دار بود.  می‌توانست ببیند چه چیزی از او ثبت شده و چه چیزی
 *    نه.
 *
 *    جداسازیِ شرکت همیشه درست بود (`companyId` از پایگاه داده می‌آید و
 *    هرگز به مدل داده نمی‌شود).  چیزی که نبود، جداسازیِ **نقش** بود.
 *
 * ⚠️ `ask` و `briefing` عمداً برای همه بازند.
 *
 *    دستیار فقط دادهٔ همان شرکت را می‌بیند و ابزارهایش محدودند.  بستنش
 *    روی کارمند یعنی هیچ‌کس جز مدیر از آن استفاده نمی‌کند — و آن‌وقت
 *    ساختنش بی‌معنی بود.
 */
@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  @Get('sales-analysis')
  salesAnalysis(@CurrentUser() user: AuthUser) {
    return this.aiService.salesAnalysis(user.companyId as string);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  @Get('inventory-analysis')
  inventoryAnalysis(@CurrentUser() user: AuthUser) {
    return this.aiService.inventoryAnalysis(user.companyId as string);
  }

  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
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

  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
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
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
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
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
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
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY')
  @Get('dead-stock')
  deadStock(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.aiService.deadStock(
      user.companyId as string,
      days ? Number(days) : undefined,
    );
  }

  /** مغایرت غیرعادی صندوق */
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Get('cashier-anomalies')
  cashierAnomalies(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.aiService.cashierAnomalies(
      user.companyId as string,
      days ? Number(days) : undefined,
    );
  }

  /** پیش‌بینی فروش روزهای آینده */
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ACCOUNTANT')
  @Get('sales-forecast')
  salesForecast(@CurrentUser() user: AuthUser, @Query('daysAhead') daysAhead?: string) {
    return this.aiService.salesForecast(
      user.companyId as string,
      daysAhead ? Number(daysAhead) : undefined,
    );
  }
}
