import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { TenantInterceptor } from './database/tenant.interceptor';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { DatabaseModule } from './database/database.module';
import { I18nModule } from './i18n/i18n.module';
import { N8nModule } from './n8n/n8n.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { InventoryModule } from './inventory/inventory.module';
import { CustomersModule } from './customers/customers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { TelephonyModule } from './telephony/telephony.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './common/guards/permissions.module';
import { PurchasesModule } from './purchases/purchases.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CashBoxModule } from './cashbox/cashbox.module';
import { AccountingModule } from './accounting/accounting.module';
import { ReportsModule } from './reports/reports.module';
import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ChequesModule } from './cheques/cheques.module';
import { SmsModule } from './sms/sms.module';
import { VoiceModule } from './voice/voice.module';
import { UploadsModule } from './uploads/uploads.module';
import { PosTerminalsModule } from './pos-terminals/pos-terminals.module';
import { TreasuryModule } from './treasury/treasury.module';
import { ContractsModule } from './contracts/contracts.module';
import { PayrollModule } from './payroll/payroll.module';
import { BudgetModule } from './budget/budget.module';
import { AssetsModule } from './assets/assets.module';
import { TendersModule } from './tenders/tenders.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveRequestsModule } from './leave-requests/leave-requests.module';
import { PerformanceModule } from './performance/performance.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { PricingModule } from './pricing/pricing.module';
import { OperationsModule } from './operations/operations.module';
import { TaxModule } from './tax/tax.module';
import { ShopModule } from './shop/shop.module';
import { CrmModule } from './crm/crm.module';
import { SalesOrdersModule } from './sales-orders/sales-orders.module';
import { TrainingModule } from './training/training.module';
import { SurveysModule } from './surveys/surveys.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { RevenueModule } from './revenue/revenue.module';
import { RationModule } from './ration/ration.module';
import { RetailModule } from './retail/retail.module';
import { CashierShiftModule } from './retail/cashier-shift.module';
import { NewsModule } from './news/news.module';
import { LoansModule } from './loans/loans.module';
import { InvestmentsModule } from './investments/investments.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ReturnsModule } from './returns/returns.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { SerialNumbersModule } from './serial-numbers/serial-numbers.module';
import { PriceLevelsModule } from './price-levels/price-levels.module';
import { DiscountRulesModule } from './discount-rules/discount-rules.module';
import { SalesAgentsModule } from './sales-agents/sales-agents.module';
import { QuotationsModule } from './quotations/quotations.module';
import { CustomerTicketsModule } from './customer-tickets/customer-tickets.module';
import { EmailCampaignsModule } from './email-campaigns/email-campaigns.module';
import { GovSsoModule } from './gov-sso/gov-sso.module';
import { ShahkarModule } from './shahkar/shahkar.module';
import { SelfOrderModule } from './self-order/self-order.module';
import { SiteModule } from './site/site.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { HealthModule } from './health/health.module';
import { RestaurantModule } from './restaurant/restaurant.module';
import { FeatureKey, activeProduct } from './product';

/**
 * ماژول‌های هر قابلیت.
 *
 * فهرست عمداً اینجاست نه در `product.ts`: آنجا تعریف *محصول* است و باید بدون
 * وابستگی به Nest خوانده شود؛ اینجا نگاشت به ماژول‌های واقعی است.
 */
const FEATURE_MODULES: Record<FeatureKey, unknown[]> = {
  catalogue: [
    CategoriesModule,
    InventoryModule,
    ProductsModule,
    PurchasesModule,
    PurchasingModule,
    TelephonyModule,
    PermissionsModule,
    RolesModule,
    SerialNumbersModule,
    SuppliersModule,
    WarehousesModule,
  ],

  sales: [
    PricingModule,
    LoyaltyModule,
    TaxModule,
    OperationsModule,
    CashBoxModule,
    CashierShiftModule,
    CustomersModule,
    DiscountRulesModule,
    PaymentsModule,
    PosTerminalsModule,
    PriceLevelsModule,
    QuotationsModule,
    ReturnsModule,
    SalesAgentsModule,
    SalesModule,
    SalesOrdersModule,
    ShipmentsModule,
  ],

  retail: [
    RetailModule,
  ],

  ration: [
    RationModule,
  ],

  restaurant: [
    RestaurantModule,
    // ⚠️ منوی دیجیتال پشتِ همان قابلیت است، نه ماژولِ هسته.
    //
    //    در نمایهٔ فروشگاه هیچ میزی وجود ندارد، پس مسیرِ عمومیِ
    //    `/menu/:token` آنجا فقط سطحِ حمله است بی‌آنکه کاری بکند.
    SelfOrderModule,
  ],

  hr: [
    AttendanceModule,
    LeaveRequestsModule,
    PayrollModule,
    PerformanceModule,
    TrainingModule,
  ],

  finance: [
    AssetsModule,
    BudgetModule,
    ChequesModule,
    ContractsModule,
    ExpensesModule,
    InvestmentsModule,
    LoansModule,
    TendersModule,
    TreasuryModule,
  ],



  shop: [
    ShopModule,
  ],

  crm: [
    CrmModule,
    CustomerTicketsModule,
    EmailCampaignsModule,
    NewsModule,
    SurveysModule,
  ],

};

/** ماژول‌هایی که هر محصولی — فروشگاه، رستوران یا سازمانی — لازم دارد. */
const CORE_MODULES = [
  DatabaseModule,
  I18nModule,
  N8nModule,
  AuthModule,
  UsersModule,
  CompaniesModule,
  AccountingModule,
  ReportsModule,
  AiModule,
  NotificationsModule,
  AuditLogModule,
  RevenueModule,
  SmsModule,
  VoiceModule,
  UploadsModule,
  WebhooksModule,
  ApiKeysModule,
  // ⚠️ ماژولِ هسته: ورودِ دولتی برای هر سه محصول معنا دارد —
  //    شهروند، مشتریِ فروشگاه و کارمند.  پشتِ `FEATURE_MODULES`
  //    نمی‌رود چون به قابلیتِ خاصی وابسته نیست.
  GovSsoModule,
  // ⚠️ ماژولِ هسته: سایتِ معرفی برای هر نصبی معنا دارد و به
  //    قابلیتِ خاصی وابسته نیست.
  SiteModule,
  // ⚠️ ماژولِ هسته: شاهکار تطبیقِ موبایل و کد ملی است و
  //    هر سه محصول به‌ش تکیه می‌کنند — کالابرگ، ثبت‌نامِ
  //    مشتری، و ساختِ کارمند.  پشتِ `FEATURE_MODULES` نمی‌رود
  //    چون آن‌وقت مسیری که به‌ش `enforce` می‌زند در نمایهٔ
  //    دیگر بی‌صدا احراز را رد می‌کرد.
  ShahkarModule,
  HealthModule,
];

/**
 * ماژول‌های محصول فعال.
 *
 * مشتری رستوران نباید API عوارض شهرداری را ببیند، حتی اگر هرگز صدایش نزند:
 * سطح حملهٔ کمتر، Swagger تمیزتر، و راه‌اندازی سبک‌تر.
 */
function productModules(): unknown[] {
  const product = activeProduct();

  return [
    ...CORE_MODULES,
    ...product.features.flatMap((feature) => FEATURE_MODULES[feature] ?? []),
  ];
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // محدودیت تعداد درخواست.
    //
    // ۱۲۰ در دقیقه برای فروشگاه واقعی کم بود: هر اسکن در صندوق چند
    // درخواست می‌زند، و چند صندوق همزمان به‌راحتی از آن رد می‌شوند.
    // نتیجه‌اش خطای گنگ وسط فروش است — و در آزمون‌ها، شکست‌هایی که
    // ربطی به کد نداشتند.
    //
    // دو سطل جدا: «short» جلوی هجوم لحظه‌ای را می‌گیرد، «long» سقف
    // دقیقه‌ای است.  محدودیتِ سخت روی ورود جداگانه و روی خود مسیر
    // اعمال می‌شود (به `auth.controller.ts` نگاه کنید) — آنجا سخت‌گیری
    // لازم است چون هدفِ حدس رمز همان است.
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: Number(process.env.RATE_LIMIT_BURST ?? 50),
      },
      {
        name: 'long',
        ttl: 60000,
        limit: Number(process.env.RATE_LIMIT ?? 1200),
      },
    ]),

    ...(productModules() as never[]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      // زمینهٔ شرکت را برای RLS برقرار می‌کند — پس از Guardها اجرا می‌شود
      // چون به req.user نیاز دارد.
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}
