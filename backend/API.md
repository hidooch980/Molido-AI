# مستندات API

> ⚠️ این فایل **ساخته می‌شود**، دستی ویرایش نکنید.
>
> `npx tsx tools/generate-api-docs.ts`
>
> نسخهٔ زندهٔ تعاملی: `http://localhost:3000/api-docs`

**466 عملیات در 69 گروه**

همهٔ مسیرها جز `/auth/login` و `/shop/*` توکن می‌خواهند:
`Authorization: Bearer <token>`

## Accounting

| متد | مسیر | شرح |
|---|---|---|
| GET | `/accounting/accounts` | `findAllAccounts` |
| POST | `/accounting/accounts` | `createAccount` |
| DELETE | `/accounting/accounts/{id}` | `removeAccount` |
| GET | `/accounting/accounts/{id}` | `findAccount` |
| PATCH | `/accounting/accounts/{id}` | `updateAccount` |
| GET | `/accounting/summary` | `summary` |

## Ai

| متد | مسیر | شرح |
|---|---|---|
| POST | `/ai/ask` | `ask` |
| GET | `/ai/briefing` | `briefing` |
| GET | `/ai/cashier-anomalies` | `cashierAnomalies` |
| GET | `/ai/dead-stock` | `deadStock` |
| GET | `/ai/expiry-analysis` | `expiryAnalysis` |
| GET | `/ai/inventory-analysis` | `inventoryAnalysis` |
| GET | `/ai/manager-report` | `managerReport` |
| GET | `/ai/price-suggestions` | `priceSuggestions` |
| GET | `/ai/reorder-suggestions` | `reorderSuggestions` |
| GET | `/ai/sales-analysis` | `salesAnalysis` |
| GET | `/ai/sales-forecast` | `salesForecast` |

## App

| متد | مسیر | شرح |
|---|---|---|
| GET | `/` | `getHello` |

## Auth

| متد | مسیر | شرح |
|---|---|---|
| POST | `/auth/change-password` | `changePassword` |
| POST | `/auth/login` | `login` |
| GET | `/auth/me` | `me` |
| POST | `/auth/refresh` | `refresh` |
| POST | `/auth/register` | `register` |

## CRM

| متد | مسیر | شرح |
|---|---|---|
| GET | `/crm/funnel` | `funnel` |
| GET | `/crm/interactions` | `interactions` |
| POST | `/crm/interactions` | `createInteraction` |
| PATCH | `/crm/interactions/{id}/done` | `completeFollowUp` |
| GET | `/crm/leads` | `leads` |
| POST | `/crm/leads` | `createLead` |
| GET | `/crm/leads/{id}` | `lead` |
| PATCH | `/crm/leads/{id}` | `updateLead` |
| POST | `/crm/leads/{id}/convert` | `convertLead` |
| GET | `/crm/opportunities` | `opportunities` |
| POST | `/crm/opportunities` | `createOpportunity` |
| PATCH | `/crm/opportunities/{id}/stage` | `moveStage` |
| GET | `/crm/stats` | `stats` |

## CashBox

| متد | مسیر | شرح |
|---|---|---|
| GET | `/cashbox` | `findAll` |
| POST | `/cashbox` | `create` |
| DELETE | `/cashbox/{id}` | `remove` |
| GET | `/cashbox/{id}` | `findOne` |
| PATCH | `/cashbox/{id}/deposit` | `deposit` |
| PATCH | `/cashbox/{id}/withdraw` | `withdraw` |

## Cheques

| متد | مسیر | شرح |
|---|---|---|
| GET | `/cheques` | `findAll` |
| POST | `/cheques` | `create` |
| DELETE | `/cheques/{id}` | `remove` |
| GET | `/cheques/{id}` | `findOne` |
| PATCH | `/cheques/{id}/status` | `updateStatus` |
| GET | `/cheques/stats` | `stats` |

## Companies

| متد | مسیر | شرح |
|---|---|---|
| GET | `/company` | `findMine` |
| PATCH | `/company` | `update` |
| GET | `/company/currency` | `currency` |

## Contracts

| متد | مسیر | شرح |
|---|---|---|
| GET | `/contracts` | `findAll` |
| POST | `/contracts` | `create` |
| GET | `/contracts/{id}` | `findOne` |
| PATCH | `/contracts/{id}` | `update` |
| POST | `/contracts/{id}/payments` | `addPayment` |
| PATCH | `/contracts/{id}/status` | `updateStatus` |
| PATCH | `/contracts/payments/{paymentId}/pay` | `payPayment` |
| GET | `/contracts/stats` | `stats` |

## Customers

| متد | مسیر | شرح |
|---|---|---|
| GET | `/customers` | `findAll` |
| POST | `/customers` | `create` |
| DELETE | `/customers/{id}` | `remove` |
| GET | `/customers/{id}` | `findOne` |
| PATCH | `/customers/{id}` | `update` |
| GET | `/customers/{id}/balance` | `balance` |

## Expenses

| متد | مسیر | شرح |
|---|---|---|
| GET | `/expenses` | `findAll` |
| POST | `/expenses` | `create` |
| DELETE | `/expenses/{id}` | `remove` |
| GET | `/expenses/{id}` | `findOne` |
| PATCH | `/expenses/{id}` | `update` |

## Inventory

| متد | مسیر | شرح |
|---|---|---|
| GET | `/inventory` | `findAll` |
| GET | `/inventory/{id}` | `findOne` |
| POST | `/inventory/adjust` | `adjust` |
| GET | `/inventory/expiring` | `expiring` |
| GET | `/inventory/low-stock` | `lowStock` |
| POST | `/inventory/transfer` | `transfer` |

## Ledger

| متد | مسیر | شرح |
|---|---|---|
| GET | `/ledger/accounts/{code}` | `accountLedger` |
| GET | `/ledger/balance-sheet` | `balanceSheet` |
| GET | `/ledger/entries` | `entries` |
| POST | `/ledger/entries` | `post` |
| GET | `/ledger/entries/{id}` | `entry` |
| POST | `/ledger/entries/{id}/reverse` | `reverse` |
| GET | `/ledger/fiscal-years` | `fiscalYears` |
| POST | `/ledger/fiscal-years` | `createFiscalYear` |
| PATCH | `/ledger/fiscal-years/{id}/close` | `closeFiscalYear` |
| GET | `/ledger/income-statement` | `incomeStatement` |
| GET | `/ledger/trial-balance` | `trialBalance` |

## N8n

| متد | مسیر | شرح |
|---|---|---|
| GET | `/n8n/health` | `health` |
| POST | `/n8n/incoming` | `incoming` |

## Notifications

| متد | مسیر | شرح |
|---|---|---|
| GET | `/notifications` | `getAllAlerts` |
| GET | `/notifications/expiry` | `getExpiryAlerts` |
| GET | `/notifications/low-stock` | `getLowStockAlerts` |
| GET | `/notifications/recent-sales` | `getRecentSalesAlerts` |
| GET | `/notifications/unpaid-sales` | `getUnpaidSales` |

## Payments

| متد | مسیر | شرح |
|---|---|---|
| GET | `/payments` | `findAll` |
| POST | `/payments` | `create` |
| GET | `/payments/{id}` | `findOne` |

## Payroll

| متد | مسیر | شرح |
|---|---|---|
| GET | `/payroll/employees` | `findAllEmployees` |
| POST | `/payroll/employees` | `createEmployee` |
| GET | `/payroll/employees/{id}` | `findOneEmployee` |
| PATCH | `/payroll/employees/{id}` | `updateEmployee` |
| GET | `/payroll/slips` | `findSlips` |
| POST | `/payroll/slips` | `createSlip` |
| PATCH | `/payroll/slips/{id}/approve` | `approveSlip` |
| PATCH | `/payroll/slips/{id}/pay` | `paySlip` |
| GET | `/payroll/stats` | `stats` |

## PosTerminals

| متد | مسیر | شرح |
|---|---|---|
| GET | `/pos-terminals` | `findAll` |
| POST | `/pos-terminals` | `create` |
| DELETE | `/pos-terminals/{id}` | `remove` |
| GET | `/pos-terminals/{id}` | `findOne` |
| PATCH | `/pos-terminals/{id}` | `update` |
| PATCH | `/pos-terminals/{id}/status` | `updateStatus` |
| GET | `/pos-terminals/banks` | `banks` |
| GET | `/pos-terminals/stats` | `stats` |

## Products

| متد | مسیر | شرح |
|---|---|---|
| GET | `/products` | `findAll` |
| POST | `/products` | `create` |
| DELETE | `/products/{id}` | `remove` |
| GET | `/products/{id}` | `findOne` |
| PATCH | `/products/{id}` | `update` |
| GET | `/products/barcode/{barcode}` | `findByBarcode` |
| POST | `/products/import` | `runImport` |
| POST | `/products/import/preview` | `previewImport` |

## Purchases

| متد | مسیر | شرح |
|---|---|---|
| GET | `/purchases` | `findAll` |
| POST | `/purchases` | `create` |
| GET | `/purchases/{id}` | `findOne` |
| PATCH | `/purchases/{id}/cancel` | `cancel` |
| PATCH | `/purchases/{id}/receive` | `receive` |

## Purchasing

| متد | مسیر | شرح |
|---|---|---|
| GET | `/purchasing/inquiries` | `list` |
| POST | `/purchasing/inquiries` | `create` |
| GET | `/purchasing/inquiries/{id}` | `detail` |
| GET | `/purchasing/inquiries/{id}/call-list` | `callList` |
| POST | `/purchasing/inquiries/{id}/calls` | `recordCall` |
| GET | `/purchasing/inquiries/{id}/compare` | `compare` |
| POST | `/purchasing/inquiries/{id}/dial` | `dial` |
| POST | `/purchasing/inquiries/{id}/order` | `order` |
| GET | `/purchasing/price-history/{productId}` | `priceHistory` |
| GET | `/purchasing/scorecard` | `scorecard` |
| GET | `/purchasing/suggestions` | `suggestions` |

## Ration

| متد | مسیر | شرح |
|---|---|---|
| GET | `/ration/accounts` | `findAll` |
| POST | `/ration/accounts` | `create` |
| GET | `/ration/accounts/{id}` | `findOne` |
| PATCH | `/ration/accounts/{id}` | `update` |
| POST | `/ration/accounts/{id}/allocate` | `allocate` |
| GET | `/ration/accounts/by-national-code/{nationalCode}` | `byNationalCode` |
| POST | `/ration/eligibility` | `eligibility` |
| GET | `/ration/settlement` | `settlement` |

## Reports

| متد | مسیر | شرح |
|---|---|---|
| GET | `/reports/dashboard` | `dashboard` |
| GET | `/reports/inventory` | `inventoryReport` |
| GET | `/reports/inventory/export` | `inventoryExport` |
| GET | `/reports/profit` | `profitReport` |
| GET | `/reports/purchases` | `purchasesReport` |
| GET | `/reports/sales` | `salesReport` |
| GET | `/reports/sales/breakdown` | `breakdown` |
| GET | `/reports/sales/export` | `salesExport` |
| GET | `/reports/top-products` | `topProducts` |

## Retail

| متد | مسیر | شرح |
|---|---|---|
| GET | `/retail/parked` | `listParked` |
| POST | `/retail/parked` | `park` |
| DELETE | `/retail/parked/{id}` | `removeParked` |
| POST | `/retail/parked/{id}/resume` | `resumeParked` |
| GET | `/retail/quick-keys` | `quickKeyLayout` |
| POST | `/retail/quick-keys` | `addQuickKey` |
| DELETE | `/retail/quick-keys/{id}` | `removeQuickKey` |
| GET | `/retail/quick-keys/groups` | `quickKeyGroups` |
| POST | `/retail/quick-keys/groups` | `createQuickKeyGroup` |
| DELETE | `/retail/quick-keys/groups/{id}` | `removeQuickKeyGroup` |
| PATCH | `/retail/quick-keys/groups/{id}` | `updateQuickKeyGroup` |
| POST | `/retail/quick-keys/reorder` | `reorderQuickKeys` |
| GET | `/retail/scan` | `scan` |
| GET | `/retail/search` | `search` |
| GET | `/retail/shifts` | `findAll` |
| GET | `/retail/shifts/{id}` | `findOne` |
| PATCH | `/retail/shifts/{id}/close` | `close` |
| GET | `/retail/shifts/current` | `current` |
| POST | `/retail/shifts/open` | `open` |

## Revenue

| متد | مسیر | شرح |
|---|---|---|
| GET | `/revenue/receipts` | `findAll` |
| GET | `/revenue/stats` | `stats` |

## Roles

| متد | مسیر | شرح |
|---|---|---|
| PUT | `/roles` | `set` |
| DELETE | `/roles/{role}/{permission}` | `reset` |
| GET | `/roles/permissions` | `catalog` |

## Sales

| متد | مسیر | شرح |
|---|---|---|
| GET | `/sales` | `findAll` |
| POST | `/sales` | `create` |
| GET | `/sales/{id}` | `findOne` |
| PATCH | `/sales/{id}/cancel` | `cancel` |
| GET | `/sales/{id}/installments` | `listInstallments` |
| POST | `/sales/{id}/installments` | `createInstallments` |
| GET | `/sales/{id}/print` | `print` |
| PATCH | `/sales/installments/{installmentId}/pay` | `payInstallment` |

## Sms

| متد | مسیر | شرح |
|---|---|---|
| GET | `/sms/history` | `history` |
| GET | `/sms/opt-out` | `optedOut` |
| POST | `/sms/opt-out` | `setOptOut` |
| POST | `/sms/preview` | `preview` |
| POST | `/sms/send` | `send` |
| POST | `/sms/send-one` | `sendOne` |
| GET | `/sms/stats` | `stats` |
| GET | `/sms/templates` | `templates` |
| POST | `/sms/templates` | `saveTemplate` |
| DELETE | `/sms/templates/{id}` | `removeTemplate` |

## Suppliers

| متد | مسیر | شرح |
|---|---|---|
| GET | `/suppliers` | `findAll` |
| POST | `/suppliers` | `create` |
| DELETE | `/suppliers/{id}` | `remove` |
| GET | `/suppliers/{id}` | `findOne` |
| PATCH | `/suppliers/{id}` | `update` |

## Telephony

| متد | مسیر | شرح |
|---|---|---|
| GET | `/telephony/status` | `status` |

## Treasury

| متد | مسیر | شرح |
|---|---|---|
| GET | `/treasury/accounts` | `findAllAccounts` |
| POST | `/treasury/accounts` | `createAccount` |
| GET | `/treasury/accounts/{id}` | `findOneAccount` |
| PATCH | `/treasury/accounts/{id}` | `updateAccount` |
| GET | `/treasury/stats` | `stats` |
| GET | `/treasury/transactions` | `findTransactions` |
| POST | `/treasury/transactions` | `createTransaction` |
| POST | `/treasury/transfer` | `transfer` |

## Uploads

| متد | مسیر | شرح |
|---|---|---|
| GET | `/uploads` | `findAll` |
| POST | `/uploads` | `upload` |
| DELETE | `/uploads/{id}` | `remove` |

## Users

| متد | مسیر | شرح |
|---|---|---|
| GET | `/users` | `findAll` |
| POST | `/users` | `create` |
| DELETE | `/users/{id}` | `remove` |
| GET | `/users/{id}` | `findOne` |
| PATCH | `/users/{id}` | `update` |

## Voice

| متد | مسیر | شرح |
|---|---|---|
| GET | `/voice/dialects` | `dialects` |
| POST | `/voice/dictionary` | `importDictionary` |
| GET | `/voice/manifest` | `manifest` |
| GET | `/voice/phrases` | `phrases` |
| PATCH | `/voice/phrases/{id}` | `setTarget` |
| POST | `/voice/phrases/build` | `build` |
| GET | `/voice/phrases/suggest` | `suggest` |
| POST | `/voice/samples` | `addSample` |
| PATCH | `/voice/samples/{id}` | `review` |
| GET | `/voice/samples/pending` | `pending` |
| GET | `/voice/status` | `status` |

## آموزش کارکنان

| متد | مسیر | شرح |
|---|---|---|
| GET | `/training` | `findAll` |
| POST | `/training` | `create` |
| DELETE | `/training/{id}` | `remove` |
| GET | `/training/{id}` | `findOne` |
| PATCH | `/training/{id}` | `update` |
| GET | `/training/stats` | `stats` |

## ارزیابی عملکرد

| متد | مسیر | شرح |
|---|---|---|
| GET | `/performance` | `findAll` |
| POST | `/performance` | `create` |
| DELETE | `/performance/{id}` | `remove` |
| GET | `/performance/{id}` | `findOne` |
| PATCH | `/performance/{id}` | `update` |
| GET | `/performance/stats` | `stats` |

## ارسال‌ها

| متد | مسیر | شرح |
|---|---|---|
| GET | `/shipments` | `findAll` |
| POST | `/shipments` | `create` |
| DELETE | `/shipments/{id}` | `remove` |
| GET | `/shipments/{id}` | `findOne` |
| PATCH | `/shipments/{id}` | `update` |
| GET | `/shipments/stats` | `stats` |

## انبار

| متد | مسیر | شرح |
|---|---|---|
| GET | `/warehouses` | `findAll` |
| POST | `/warehouses` | `create` |
| DELETE | `/warehouses/{id}` | `remove` |
| GET | `/warehouses/{id}` | `findOne` |
| PATCH | `/warehouses/{id}` | `update` |
| GET | `/warehouses/{id}/contents` | `contents` |

## انبارگردانی و کاردکس

| متد | مسیر | شرح |
|---|---|---|
| GET | `/stock-count` | `list` |
| POST | `/stock-count` | `open` |
| GET | `/stock-count/{id}` | `detail` |
| POST | `/stock-count/{id}/apply` | `apply` |
| POST | `/stock-count/{id}/cancel` | `cancel` |
| PATCH | `/stock-count/{id}/lines/{lineId}` | `setCounted` |
| GET | `/stock-count/kardex/{productId}` | `kardex` |

## باشگاه مشتریان

| متد | مسیر | شرح |
|---|---|---|
| GET | `/loyalty/audience` | `audience` |
| GET | `/loyalty/campaigns` | `campaigns` |
| POST | `/loyalty/campaigns` | `createCampaign` |
| GET | `/loyalty/campaigns/{id}/codes` | `campaignCodes` |
| POST | `/loyalty/checkin/resolve` | `resolveCheckin` |
| GET | `/loyalty/segments` | `segments` |

## بودجه

| متد | مسیر | شرح |
|---|---|---|
| GET | `/budget` | `findAll` |
| POST | `/budget` | `create` |
| DELETE | `/budget/{id}` | `remove` |
| GET | `/budget/{id}` | `findOne` |
| PATCH | `/budget/{id}` | `update` |
| GET | `/budget/stats` | `stats` |

## تیکت مشتری

| متد | مسیر | شرح |
|---|---|---|
| GET | `/customer-tickets` | `findAll` |
| POST | `/customer-tickets` | `create` |
| DELETE | `/customer-tickets/{id}` | `remove` |
| GET | `/customer-tickets/{id}` | `findOne` |
| PATCH | `/customer-tickets/{id}` | `update` |
| GET | `/customer-tickets/stats` | `stats` |

## حضور و غیاب

| متد | مسیر | شرح |
|---|---|---|
| GET | `/attendance` | `findAll` |
| POST | `/attendance` | `record` |
| GET | `/attendance/balances` | `balances` |
| POST | `/attendance/balances` | `setEntitlement` |
| GET | `/attendance/leaves` | `leaves` |
| POST | `/attendance/leaves` | `requestLeave` |
| PATCH | `/attendance/leaves/{id}/decide` | `decideLeave` |
| GET | `/attendance/stats` | `stats` |
| GET | `/attendance/summary` | `summary` |

## دارایی ثابت

| متد | مسیر | شرح |
|---|---|---|
| GET | `/assets` | `findAll` |
| POST | `/assets` | `create` |
| GET | `/assets/{id}` | `findOne` |
| PATCH | `/assets/{id}` | `update` |
| POST | `/assets/{id}/dispose` | `dispose` |
| POST | `/assets/depreciation/run` | `runDepreciation` |
| GET | `/assets/stats` | `stats` |

## دسته‌بندی

| متد | مسیر | شرح |
|---|---|---|
| GET | `/categories` | `findAll` |
| POST | `/categories` | `create` |
| DELETE | `/categories/{id}` | `remove` |
| GET | `/categories/{id}` | `findOne` |
| PATCH | `/categories/{id}` | `update` |
| GET | `/categories/tree` | `tree` |

## روابط عمومی

| متد | مسیر | شرح |
|---|---|---|
| GET | `/news` | `findAll` |
| POST | `/news` | `create` |
| DELETE | `/news/{id}` | `remove` |
| GET | `/news/{id}` | `findOne` |
| PATCH | `/news/{id}` | `update` |
| GET | `/news/stats` | `stats` |

## زنجیرهٔ فروش

| متد | مسیر | شرح |
|---|---|---|
| GET | `/sales-chain/orders/{id}` | `orderDetail` |
| POST | `/sales-chain/orders/{id}/invoice` | `invoice` |
| POST | `/sales-chain/quotations` | `createQuotation` |
| POST | `/sales-chain/quotations/{id}/convert` | `convert` |
| POST | `/sales-chain/shipments` | `ship` |
| POST | `/sales-chain/shipments/{id}/deliver` | `deliver` |
| GET | `/sales-chain/stats` | `stats` |

## سامانهٔ مؤدیان

| متد | مسیر | شرح |
|---|---|---|
| POST | `/tax/enqueue-pending` | `enqueuePending` |
| GET | `/tax/invoices` | `list` |
| POST | `/tax/invoices/{saleId}` | `enqueue` |
| POST | `/tax/process` | `process` |
| GET | `/tax/settings` | `settings` |
| POST | `/tax/settings` | `saveSettings` |
| GET | `/tax/stats` | `stats` |

## سرمایه‌گذاری

| متد | مسیر | شرح |
|---|---|---|
| GET | `/investments` | `findAll` |
| POST | `/investments` | `create` |
| DELETE | `/investments/{id}` | `remove` |
| GET | `/investments/{id}` | `findOne` |
| PATCH | `/investments/{id}` | `update` |
| GET | `/investments/stats` | `stats` |

## سطح قیمت

| متد | مسیر | شرح |
|---|---|---|
| GET | `/price-levels` | `findAll` |
| POST | `/price-levels` | `create` |
| DELETE | `/price-levels/{id}` | `remove` |
| GET | `/price-levels/{id}` | `findOne` |
| PATCH | `/price-levels/{id}` | `update` |
| GET | `/price-levels/stats` | `stats` |

## سفارش آنلاین

| متد | مسیر | شرح |
|---|---|---|
| GET | `/sales-orders` | `findAll` |
| POST | `/sales-orders` | `create` |
| DELETE | `/sales-orders/{id}` | `remove` |
| GET | `/sales-orders/{id}` | `findOne` |
| PATCH | `/sales-orders/{id}` | `update` |
| GET | `/sales-orders/stats` | `stats` |

## شمارهٔ سریال

| متد | مسیر | شرح |
|---|---|---|
| GET | `/serial-numbers` | `findAll` |
| POST | `/serial-numbers` | `create` |
| DELETE | `/serial-numbers/{id}` | `remove` |
| GET | `/serial-numbers/{id}` | `findOne` |
| PATCH | `/serial-numbers/{id}` | `update` |
| PATCH | `/serial-numbers/{id}/status` | `setStatus` |
| POST | `/serial-numbers/batch` | `addBatch` |
| GET | `/serial-numbers/lookup/{serial}` | `lookup` |
| GET | `/serial-numbers/stats` | `stats` |

## عملیات

| متد | مسیر | شرح |
|---|---|---|
| GET | `/operations/errors` | `errors` |
| PATCH | `/operations/errors/{id}` | `setStatus` |
| GET | `/operations/health` | `history` |
| POST | `/operations/health` | `snapshot` |
| GET | `/operations/support` | `sessions` |
| POST | `/operations/support` | `grant` |
| PATCH | `/operations/support/{id}/revoke` | `revoke` |

## فروشگاه اینترنتی

| متد | مسیر | شرح |
|---|---|---|
| GET | `/shop/cart` | `cart` |
| POST | `/shop/cart/items` | `addToCart` |
| PATCH | `/shop/cart/items/{id}` | `setQty` |
| GET | `/shop/categories` | `categories` |
| POST | `/shop/checkin-token` | `checkinToken` |
| POST | `/shop/checkout` | `checkout` |
| POST | `/shop/login` | `login` |
| GET | `/shop/my-codes` | `myCodes` |
| GET | `/shop/my-orders` | `myOrders` |
| GET | `/shop/my-orders/{id}` | `myOrder` |
| GET | `/shop/products` | `catalogue` |
| GET | `/shop/products/{id}` | `product` |
| POST | `/shop/register` | `register` |
| POST | `/shop/register/request-code` | `requestCode` |
| GET | `/shop/settings` | `settings` |

## قوانین تخفیف

| متد | مسیر | شرح |
|---|---|---|
| GET | `/discount-rules` | `findAll` |
| POST | `/discount-rules` | `create` |
| DELETE | `/discount-rules/{id}` | `remove` |
| GET | `/discount-rules/{id}` | `findOne` |
| PATCH | `/discount-rules/{id}` | `update` |
| GET | `/discount-rules/stats` | `stats` |

## قیمت‌گذاری و تخفیف

| متد | مسیر | شرح |
|---|---|---|
| GET | `/pricing/levels` | `levels` |
| POST | `/pricing/levels` | `createLevel` |
| POST | `/pricing/prices` | `setPrice` |
| GET | `/pricing/products/{id}/prices` | `productPrices` |
| POST | `/pricing/quote` | `quote` |
| GET | `/pricing/rules` | `rules` |
| POST | `/pricing/rules` | `createRule` |
| PATCH | `/pricing/rules/{id}/toggle` | `toggleRule` |

## لاگ سیستم

| متد | مسیر | شرح |
|---|---|---|
| GET | `/audit-log` | `findAll` |
| POST | `/audit-log` | `create` |
| DELETE | `/audit-log/{id}` | `remove` |
| GET | `/audit-log/{id}` | `findOne` |
| PATCH | `/audit-log/{id}` | `update` |
| GET | `/audit-log/stats` | `stats` |

## مدیریت فروشگاه

| متد | مسیر | شرح |
|---|---|---|
| GET | `/shop-admin/orders` | `orders` |
| GET | `/shop-admin/orders/{id}` | `order` |
| POST | `/shop-admin/orders/{id}/confirm` | `confirm` |
| PATCH | `/shop-admin/orders/{id}/status` | `setStatus` |
| GET | `/shop-admin/settings` | `settings` |
| POST | `/shop-admin/settings` | `saveSettings` |
| GET | `/shop-admin/stats` | `stats` |

## مرجوعی

| متد | مسیر | شرح |
|---|---|---|
| GET | `/returns` | `findAll` |
| GET | `/returns/{id}` | `findOne` |
| POST | `/returns/purchase` | `purchaseReturn` |
| POST | `/returns/sale` | `saleReturn` |
| GET | `/returns/stats` | `stats` |

## مرخصی

| متد | مسیر | شرح |
|---|---|---|
| GET | `/leave-requests` | `findAll` |
| POST | `/leave-requests` | `create` |
| DELETE | `/leave-requests/{id}` | `remove` |
| GET | `/leave-requests/{id}` | `findOne` |
| PATCH | `/leave-requests/{id}` | `update` |
| GET | `/leave-requests/stats` | `stats` |

## مناقصه

| متد | مسیر | شرح |
|---|---|---|
| GET | `/tenders` | `findAll` |
| POST | `/tenders` | `create` |
| DELETE | `/tenders/{id}` | `remove` |
| GET | `/tenders/{id}` | `findOne` |
| PATCH | `/tenders/{id}` | `update` |
| GET | `/tenders/stats` | `stats` |

## نظرسنجی

| متد | مسیر | شرح |
|---|---|---|
| GET | `/surveys` | `findAll` |
| POST | `/surveys` | `create` |
| DELETE | `/surveys/{id}` | `remove` |
| GET | `/surveys/{id}` | `findOne` |
| PATCH | `/surveys/{id}` | `update` |
| GET | `/surveys/stats` | `stats` |

## وام‌ها

| متد | مسیر | شرح |
|---|---|---|
| GET | `/loans` | `findAll` |
| POST | `/loans` | `create` |
| DELETE | `/loans/{id}` | `remove` |
| GET | `/loans/{id}` | `findOne` |
| PATCH | `/loans/{id}` | `update` |
| GET | `/loans/stats` | `stats` |

## وب‌هوک‌ها

| متد | مسیر | شرح |
|---|---|---|
| GET | `/webhooks` | `findAll` |
| POST | `/webhooks` | `create` |
| DELETE | `/webhooks/{id}` | `remove` |
| GET | `/webhooks/{id}` | `findOne` |
| PATCH | `/webhooks/{id}` | `update` |
| GET | `/webhooks/stats` | `stats` |

## وضعیت سیستم

| متد | مسیر | شرح |
|---|---|---|
| GET | `/health` | `findAll` |
| POST | `/health` | `create` |
| DELETE | `/health/{id}` | `remove` |
| GET | `/health/{id}` | `findOne` |
| PATCH | `/health/{id}` | `update` |
| GET | `/health/stats` | `stats` |
| GET | `/healthz` | `live` |
| GET | `/readyz` | `ready` |

## ویزیتور و کمیسیون

| متد | مسیر | شرح |
|---|---|---|
| GET | `/sales-agents` | `findAll` |
| POST | `/sales-agents` | `create` |
| GET | `/sales-agents/{id}` | `findOne` |
| PATCH | `/sales-agents/{id}` | `update` |
| GET | `/sales-agents/commissions` | `commissions` |
| PATCH | `/sales-agents/commissions/{id}/pay` | `markPaid` |
| POST | `/sales-agents/commissions/calculate` | `calculate` |
| GET | `/sales-agents/stats` | `stats` |

## پیشنهاد قیمت

| متد | مسیر | شرح |
|---|---|---|
| GET | `/quotations` | `findAll` |
| POST | `/quotations` | `create` |
| DELETE | `/quotations/{id}` | `remove` |
| GET | `/quotations/{id}` | `findOne` |
| PATCH | `/quotations/{id}` | `update` |
| GET | `/quotations/stats` | `stats` |

## کلیدهای API

| متد | مسیر | شرح |
|---|---|---|
| GET | `/api-keys` | `findAll` |
| POST | `/api-keys` | `create` |
| DELETE | `/api-keys/{id}` | `remove` |
| GET | `/api-keys/{id}` | `findOne` |
| PATCH | `/api-keys/{id}` | `update` |
| GET | `/api-keys/stats` | `stats` |

## کمپین ایمیل

| متد | مسیر | شرح |
|---|---|---|
| GET | `/email-campaigns` | `findAll` |
| POST | `/email-campaigns` | `create` |
| DELETE | `/email-campaigns/{id}` | `remove` |
| GET | `/email-campaigns/{id}` | `findOne` |
| PATCH | `/email-campaigns/{id}` | `update` |
| GET | `/email-campaigns/stats` | `stats` |
