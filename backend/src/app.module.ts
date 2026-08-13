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
import { PurchasesModule } from './purchases/purchases.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CashBoxModule } from './cashbox/cashbox.module';
import { AccountingModule } from './accounting/accounting.module';
import { ReportsModule } from './reports/reports.module';
import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TechnicalOfficeModule } from './technical-office/technical-office.module';
import { FireDepartmentModule } from './fire-department/fire-department.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { MunicipalFeesModule } from './municipal-fees/municipal-fees.module';
import { ChequesModule } from './cheques/cheques.module';
import { SmsModule } from './sms/sms.module';
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
import { ConstructionProjectsModule } from './construction-projects/construction-projects.module';
import { FleetModule } from './fleet/fleet.module';
import { ServiceZonesModule } from './service-zones/service-zones.module';
import { LettersModule } from './letters/letters.module';
import { PricingModule } from './pricing/pricing.module';
import { ShopModule } from './shop/shop.module';
import { CrmModule } from './crm/crm.module';
import { SalesOrdersModule } from './sales-orders/sales-orders.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { ECityModule } from './e-city/e-city.module';
import { CemeteryModule } from './cemetery/cemetery.module';
import { TaxiModule } from './taxi/taxi.module';
import { BusinessLicensesModule } from './business-licenses/business-licenses.module';
import { MunicipalPropertiesModule } from './municipal-properties/municipal-properties.module';
import { PropertyAuditModule } from './property-audit/property-audit.module';
import { CrisisModule } from './crisis/crisis.module';
import { ParkingModule } from './parking/parking.module';
import { StreetLightsModule } from './street-lights/street-lights.module';
import { CouncilModule } from './council/council.module';
import { HelpdeskModule } from './helpdesk/helpdesk.module';
import { TrainingModule } from './training/training.module';
import { DmsModule } from './dms/dms.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { SurveysModule } from './surveys/surveys.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { RevenueModule } from './revenue/revenue.module';
import { RationModule } from './ration/ration.module';
import { RetailModule } from './retail/retail.module';
import { CashierShiftModule } from './retail/cashier-shift.module';
import { ClinicModule } from './clinic/clinic.module';
import { IotModule } from './iot/iot.module';
import { CctvModule } from './cctv/cctv.module';
import { UtilityMetersModule } from './utility-meters/utility-meters.module';
import { NewsModule } from './news/news.module';
import { LoansModule } from './loans/loans.module';
import { InvestmentsModule } from './investments/investments.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ReturnsModule } from './returns/returns.module';
import { ShipmentsModule } from './shipments/shipments.module';
import { SerialNumbersModule } from './serial-numbers/serial-numbers.module';
import { PriceLevelsModule } from './price-levels/price-levels.module';
import { DiscountRulesModule } from './discount-rules/discount-rules.module';
import { ProjectsModule } from './projects/projects.module';
import { SalesAgentsModule } from './sales-agents/sales-agents.module';
import { QuotationsModule } from './quotations/quotations.module';
import { CustomerTicketsModule } from './customer-tickets/customer-tickets.module';
import { EmailCampaignsModule } from './email-campaigns/email-campaigns.module';
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
    SerialNumbersModule,
    SuppliersModule,
    WarehousesModule,
  ],

  sales: [
    PricingModule,
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

  municipal: [
    BusinessLicensesModule,
    CctvModule,
    ComplaintsModule,
    CouncilModule,
    CrisisModule,
    ECityModule,
    FireDepartmentModule,
    IotModule,
    MunicipalFeesModule,
    MunicipalPropertiesModule,
    PropertyAuditModule,
    ServiceZonesModule,
    StreetLightsModule,
    TechnicalOfficeModule,
    UtilityMetersModule,
  ],

  verticals: [
    AppointmentsModule,
    CemeteryModule,
    ClinicModule,
    ParkingModule,
    TaxiModule,
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

  operations: [
    ApprovalsModule,
    ConstructionProjectsModule,
    DmsModule,
    FleetModule,
    HelpdeskModule,
    LettersModule,
    ProjectsModule,
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
  UploadsModule,
  WebhooksModule,
  ApiKeysModule,
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

    // محدودیت تعداد درخواست (Rate Limiting): ۱۲۰ درخواست در دقیقه
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120,
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
