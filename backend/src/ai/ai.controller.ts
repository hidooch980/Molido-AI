import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

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
   * گزارش مدیریتی هوشمند — اگر OPENAI_API_KEY تنظیم باشد از GPT استفاده می‌شود،
   * در غیر این صورت گزارش تحلیلی داخلی تولید می‌شود
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
}
