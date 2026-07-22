# Molido AI — مستندات API

تمام مسیرها (به‌جز ثبت‌نام و ورود) نیازمند هدر `Authorization: Bearer <token>` هستند.

## 🔐 احراز هویت (Auth)

| Method | Route | توضیح |
|---|---|---|
| POST | `/auth/register` | ثبت‌نام (با `companyName` اختیاری → ساخت شرکت + نقش ADMIN) |
| POST | `/auth/login` | ورود و دریافت توکن JWT |
| GET | `/auth/me` | اطلاعات کاربر جاری |

## 👥 کاربران (Users)

| Method | Route | توضیح |
|---|---|---|
| GET | `/users` | لیست کاربران شرکت |
| GET | `/users/:id` | جزئیات کاربر |
| POST | `/users` | ایجاد کاربر (ADMIN/MANAGER) |
| PATCH | `/users/:id` | ویرایش کاربر |
| DELETE | `/users/:id` | حذف کاربر (ADMIN) |

## 🏢 شرکت (Company)

| Method | Route | توضیح |
|---|---|---|
| GET | `/company` | اطلاعات شرکت کاربر جاری + آمار |
| PATCH | `/company` | ویرایش اطلاعات شرکت (ADMIN) |

## 🏪 انبارها (Warehouses)

| Method | Route | توضیح |
|---|---|---|
| GET | `/warehouses` | لیست انبارها |
| GET | `/warehouses/:id` | جزئیات انبار + موجودی کالاها |
| POST | `/warehouses` | ایجاد انبار |
| PATCH | `/warehouses/:id` | ویرایش انبار |
| DELETE | `/warehouses/:id` | حذف انبار |

## 📦 کالاها (Products)

| Method | Route | توضیح |
|---|---|---|
| GET | `/products?search=&categoryId=&status=` | لیست + جستجو |
| GET | `/products/barcode/:barcode` | جستجو با بارکد (مناسب صندوق فروش) |
| GET | `/products/:id` | جزئیات کالا |
| POST | `/products` | ایجاد کالا |
| PATCH | `/products/:id` | ویرایش کالا |
| DELETE | `/products/:id` | حذف کالا |

## 🗂 دسته‌بندی‌ها (Categories)

CRUD کامل: `GET/POST /categories` ، `GET/PATCH/DELETE /categories/:id` (پشتیبانی از دسته والد/فرزند)

## 📋 موجودی (Inventory)

| Method | Route | توضیح |
|---|---|---|
| GET | `/inventory?warehouseId=` | موجودی کل یا به تفکیک انبار |
| GET | `/inventory/low-stock` | کالاهای کمتر از حداقل موجودی |
| POST | `/inventory/adjust` | تنظیم دستی موجودی (+/-) |
| POST | `/inventory/transfer` | انتقال بین دو انبار (تراکنشی) |

## 🧍 مشتریان و تأمین‌کنندگان

CRUD کامل + جستجو: `/customers?search=` و `/suppliers?search=` (جزئیات شامل تاریخچه فاکتورها)

## 🛒 خرید (Purchases)

| Method | Route | توضیح |
|---|---|---|
| GET | `/purchases?status=` | لیست فاکتورهای خرید |
| GET | `/purchases/:id` | جزئیات فاکتور |
| POST | `/purchases` | ثبت فاکتور خرید با آیتم‌ها (محاسبه خودکار مبالغ) |
| PATCH | `/purchases/:id/receive` | دریافت کالا → افزایش خودکار موجودی انبار |
| PATCH | `/purchases/:id/cancel` | لغو فاکتور |

## 💰 فروش (Sales)

| Method | Route | توضیح |
|---|---|---|
| GET | `/sales?status=&from=&to=` | لیست فاکتورهای فروش |
| GET | `/sales/:id` | جزئیات فاکتور + پرداخت‌ها |
| POST | `/sales` | ثبت فاکتور فروش: کنترل و کاهش خودکار موجودی، ثبت پرداخت اختیاری، به‌روزرسانی صندوق (تراکنشی) |
| PATCH | `/sales/:id/cancel` | لغو فاکتور و برگشت موجودی |

## 💳 پرداخت‌ها (Payments)

| Method | Route | توضیح |
|---|---|---|
| GET | `/payments?saleId=` | لیست پرداخت‌ها |
| POST | `/payments` | ثبت پرداخت فاکتور (کنترل مانده، به‌روزرسانی وضعیت فاکتور و صندوق) |

## 🧾 هزینه‌ها (Expenses)

CRUD کامل + فیلتر بازه زمانی: `/expenses?status=&from=&to=`

## 🏶 صندوق (CashBox)

| Method | Route | توضیح |
|---|---|---|
| GET | `/cashbox` | لیست صندوق‌ها |
| POST | `/cashbox` | ایجاد صندوق |
| PATCH | `/cashbox/:id/deposit` | واریز به صندوق |
| PATCH | `/cashbox/:id/withdraw` | برداشت از صندوق (با کنترل موجودی) |

## 📒 حسابداری (Accounting)

| Method | Route | توضیح |
|---|---|---|
| GET | `/accounting/summary?from=&to=` | تراز مالی: فروش، خرید، هزینه، سود ناخالص/خالص |
| GET/POST | `/accounting/accounts` | لیست/ایجاد حساب (ASSET/LIABILITY/EQUITY/INCOME/EXPENSE) |
| PATCH/DELETE | `/accounting/accounts/:id` | ویرایش/حذف حساب |

## 📊 گزارش‌ها (Reports)

| Method | Route | توضیح |
|---|---|---|
| GET | `/reports/dashboard` | داشبورد: فروش امروز/ماه، هزینه‌ها، تعداد کالا/مشتری، ارزش موجودی، کمبود موجودی |
| GET | `/reports/sales?from=&to=` | گزارش فروش روزانه |
| GET | `/reports/profit?from=&to=` | گزارش سود و حاشیه سود |
| GET | `/reports/top-products?limit=` | پرفروش‌ترین کالاها |
| GET | `/reports/purchases` | گزارش خرید |
| GET | `/reports/inventory` | گزارش موجودی و ارزش انبار |

## 🤖 هوش مصنوعی (AI)

| Method | Route | توضیح |
|---|---|---|
| GET | `/ai/sales-analysis` | تحلیل روند فروش ۶۰ روزه: رشد، پرفروش‌ترین روز، پیشنهادها |
| GET | `/ai/inventory-analysis` | پیش‌بینی اتمام موجودی بر اساس سرعت فروش |
| GET | `/ai/price-suggestions?targetMargin=` | پیشنهاد قیمت بر اساس حاشیه سود هدف |
| GET | `/ai/expiry-analysis?daysAhead=` | کالاهای نزدیک به انقضا |

## 🔔 اعلان‌ها (Notifications)

| Method | Route | توضیح |
|---|---|---|
| GET | `/notifications` | همه هشدارها یکجا |
| GET | `/notifications/low-stock` | هشدار کمبود موجودی |
| GET | `/notifications/expiry` | هشدار انقضای کالا |
| GET | `/notifications/unpaid-sales` | فاکتورهای پرداخت‌نشده |
| GET | `/notifications/recent-sales` | فروش‌های اخیر |

## نقش‌های کاربری

`SUPER_ADMIN` / `ADMIN` / `MANAGER` / `ACCOUNTANT` / `CASHIER` / `SALES` / `INVENTORY` / `EMPLOYEE` / `CUSTOMER`

## راه‌اندازی

```bash
cd backend
npm install
cp .env.example .env   # مقدار DATABASE_URL و JWT_SECRET را تنظیم کنید
npx prisma migrate dev
npm run seed           # کاربر مدیر: admin@molido.ai / admin123
npm run start:dev
```

## 🏗 دفتر فنی شهرداری (Technical Office)

| Method | Route | توضیح |
|---|---|---|
| GET | `/technical-office/stats` | آمار پروانه‌ها و تخلفات + جمع جریمه‌ها |
| GET | `/technical-office/permits?status=&type=&search=` | لیست پروانه‌های ساختمانی |
| GET | `/technical-office/permits/:id` | جزئیات پروانه + تاریخچه بازدیدها |
| POST | `/technical-office/permits` | ثبت درخواست پروانه (ساخت، بازسازی، تخریب، توسعه) |
| PATCH | `/technical-office/permits/:id` | ویرایش پروانه |
| PATCH | `/technical-office/permits/:id/approve` | صدور پروانه با اعتبار (پیش‌فرض ۲ سال) |
| PATCH | `/technical-office/permits/:id/reject` | رد درخواست با ذکر دلیل |
| POST | `/technical-office/permits/:id/inspections` | ثبت بازدید فنی (قبول/مردود/نیاز به اصلاح) |
| GET | `/technical-office/violations?status=` | لیست پرونده‌های تخلف ساختمانی |
| POST | `/technical-office/violations` | ثبت پرونده تخلف |
| PATCH | `/technical-office/violations/:id/fine` | ثبت جریمه (کمیسیون ماده ۱۰۰) |

## 🚒 مدیریت آتش‌نشانی (Fire Department)

| Method | Route | توضیح |
|---|---|---|
| GET | `/fire-department/stats` | آمار: ایستگاه‌ها، پرسنل آماده، خودروها، حوادث فعال |
| GET/POST | `/fire-department/stations` | لیست/ایجاد ایستگاه |
| GET/PATCH/DELETE | `/fire-department/stations/:id` | جزئیات (پرسنل، خودروها، حوادث)/ویرایش/حذف |
| GET/POST | `/fire-department/firefighters?stationId=` | پرسنل آتش‌نشان (درجه: رئیس، کاپیتان، راننده، ...) |
| PATCH | `/fire-department/firefighters/:id` | ویرایش (شیفت/آماده‌باش با `isOnDuty`) |
| GET/POST | `/fire-department/vehicles?stationId=` | خودروها (آماده، در مأموریت، تعمیرگاه) |
| PATCH | `/fire-department/vehicles/:id` | تغییر وضعیت خودرو |
| GET | `/fire-department/incidents?status=&type=&stationId=` | لیست حوادث (حریق، نجات، تصادف، سیل، مواد خطرناک، ...) |
| POST | `/fire-department/incidents` | ثبت حادثه جدید (تماس ۱۲۵) |
| PATCH | `/fire-department/incidents/:id/dispatch` | اعزام نیرو از ایستگاه مشخص |
| PATCH | `/fire-department/incidents/:id/status` | به‌روزرسانی وضعیت عملیات (در محل، مهار، پایان) + تلفات/مصدومان |
| GET | `/fire-department/safety-inspections?result=` | لیست بازدیدهای ایمنی اماکن |
| POST | `/fire-department/safety-inspections` | ثبت بازدید ایمنی — در صورت قبولی، صدور خودکار تأییدیه ایمنی یک‌ساله |

---

## 🆕 امکانات نسخه ۲

### 📖 مستندات Swagger

پس از اجرای سرور، مستندات تعاملی در آدرس `http://localhost:3000/api-docs` در دسترس است.

### 🔐 احراز هویت (جدید)

| متد | مسیر | توضیح |
|-----|------|-------|
| POST | /auth/refresh | تمدید توکن با refreshToken (خروجی login شامل accessToken و refreshToken است) |

### 📄 صفحه‌بندی (Pagination)

مسیرهای `GET /products`، `GET /customers` و `GET /sales` پارامترهای اختیاری `page` و `limit` را می‌پذیرند. در صورت ارسال، خروجی به شکل `{ data, total, page, limit, totalPages }` برمی‌گردد.

### 📞 سامانه ۱۳۷ (پیام‌های شهروندی)

| متد | مسیر | توضیح |
|-----|------|-------|
| GET | /complaints/track/:trackingNo | پیگیری عمومی با کد رهگیری (بدون ورود) |
| GET | /complaints/stats | آمار پیام‌ها |
| GET | /complaints?status=&category=&search= | فهرست پیام‌ها |
| GET | /complaints/:id | جزئیات پیام |
| POST | /complaints | ثبت پیام جدید (کد رهگیری خودکار 137-...) |
| PATCH | /complaints/:id/refer | ارجاع به واحد مربوطه |
| PATCH | /complaints/:id/status | تغییر وضعیت + ثبت پاسخ |

دسته‌ها: ROADS, WASTE, GREEN_SPACE, LIGHTING, WATER_SEWAGE, CONSTRUCTION, TRAFFIC, OTHER

### 💰 عوارض شهرداری

| متد | مسیر | توضیح |
|-----|------|-------|
| GET | /municipal-fees/stats | آمار وصولی و معوقات |
| GET | /municipal-fees?status=&type=&search= | فهرست فیش‌ها |
| GET | /municipal-fees/:id | جزئیات فیش |
| POST | /municipal-fees | صدور فیش (نوسازی/کسب/عوارض پروانه/جریمه) |
| POST | /municipal-fees/from-violation/:violationId | صدور خودکار فیش جریمه از پرونده تخلف |
| PATCH | /municipal-fees/:id/pay | ثبت پرداخت |
| PATCH | /municipal-fees/:id/cancel | لغو فیش |

### 🏦 مدیریت چک

| متد | مسیر | توضیح |
|-----|------|-------|
| GET | /cheques/stats | آمار چک‌ها (سررسید نزدیک، برگشتی و…) |
| GET | /cheques?status=&type=&dueSoon=true | فهرست چک‌ها |
| GET | /cheques/:id | جزئیات چک |
| POST | /cheques | ثبت چک دریافتی/پرداختی (اتصال اختیاری به فاکتور) |
| PATCH | /cheques/:id/status | تغییر وضعیت (REGISTERED→DEPOSITED→CLEARED/BOUNCED) |
| DELETE | /cheques/:id | حذف چک |

### 💳 فروش اقساطی و فاکتور چاپی

| متد | مسیر | توضیح |
|-----|------|-------|
| GET | /sales/:id/print | فاکتور چاپی HTML فارسی (راست‌به‌چپ) |
| POST | /sales/:id/installments | تقسیط مانده فاکتور {count, intervalDays?, startDate?} |
| GET | /sales/:id/installments | فهرست اقساط |
| PATCH | /sales/installments/:installmentId/pay | پرداخت قسط (اختیاری: cashBoxId برای واریز به صندوق) |

### 📱 پیامک (کاوه‌نگار)

| متد | مسیر | توضیح |
|-----|------|-------|
| POST | /sms/send | ارسال پیامک {to, message} |
| POST | /sms/send-bulk | ارسال گروهی {recipients[], message} |

بدون تنظیم `SMS_API_KEY` پیامک شبیه‌سازی می‌شود (در کنسول چاپ می‌شود).

### 📎 آپلود مدارک

| متد | مسیر | توضیح |
|-----|------|-------|
| POST | /uploads | آپلود فایل (multipart، فیلد file + entityType/entityId اختیاری) |
| GET | /uploads?entityType=&entityId= | فهرست پیوست‌ها |
| DELETE | /uploads/:id | حذف پیوست |

فایل‌ها از مسیر `/uploads/...` سرو می‌شوند.

### 📊 خروجی CSV

| متد | مسیر | توضیح |
|-----|------|-------|
| GET | /reports/sales/export?from=&to= | خروجی CSV فروش (قابل بازشدن در Excel) |
| GET | /reports/inventory/export | خروجی CSV موجودی انبار |

### 🤖 گزارش مدیریتی هوشمند

| متد | مسیر | توضیح |
|-----|------|-------|
| GET | /ai/manager-report | گزارش مدیریتی ماه جاری (با OPENAI_API_KEY از GPT، وگرنه تحلیل داخلی) |

### 🛡️ امنیت

- **Helmet** برای هدرهای امنیتی HTTP
- **Rate Limiting**: حداکثر ۱۲۰ درخواست در دقیقه برای هر IP
- **Refresh Token** با عمر ۳۰ روز

### 🐳 Docker

```bash
docker compose up -d
# بک‌اند: http://localhost:3000 — دیتابیس PostgreSQL خودکار بالا می‌آید
```

### 🖥️ داشبورد وب (Next.js)

```bash
cd web
npm install
npm run dev
# http://localhost:3001 — ورود با admin@molido.ai / admin123
```

### 💳 مدیریت کارت‌خوان‌ها (POS سیار و ثابت)

| متد | مسیر | توضیح |
|-----|------|-------|
| GET | /pos-terminals/banks | فهرست کامل بانک‌های ایران و شرکت‌های پرداخت (PSP) |
| GET | /pos-terminals/stats | آمار کارت‌خوان‌ها (به تفکیک بانک، نوع و وضعیت) |
| GET | /pos-terminals?type=&status=&bankName=&search= | فهرست کارت‌خوان‌ها با فیلتر |
| GET | /pos-terminals/:id | جزئیات کارت‌خوان |
| POST | /pos-terminals | ثبت کارت‌خوان جدید |
| PATCH | /pos-terminals/:id | ویرایش مشخصات |
| PATCH | /pos-terminals/:id/status | تغییر وضعیت (ACTIVE / INACTIVE / UNDER_REPAIR / RETURNED) |
| DELETE | /pos-terminals/:id | حذف کارت‌خوان |

**فیلدهای ثبت:** `terminalNo` (شماره پایانه — یکتا)، `bankName`، `type` (FIXED ثابت / MOBILE سیار)، `serialNo`، `merchantId` (کد پذیرنده)، `pspName` (شرکت پرداخت)، `accountNo`، `iban`، `holderName` (تحویل‌گیرنده کارت‌خوان سیار)، `location` (محل نصب کارت‌خوان ثابت)، `simNumber` (سیم‌کارت دستگاه سیار)، `cashBoxId` (اتصال به صندوق)، `installedAt`، `note`

### 🌐 چندزبانه (i18n) — فارسی / English / العربية

کل سیستم از سه زبان پشتیبانی می‌کند. زبان پیش‌فرض **فارسی** است.

**انتخاب زبان در هر درخواست (به ترتیب اولویت):**

| روش | مثال |
|------|------|
| پارامتر کوئری | `GET /products?lang=en` |
| هدر اختصاصی | `x-lang: ar` |
| هدر استاندارد | `Accept-Language: en-US` |

**پوشش:**
- همه پیام‌های خطا و اعتبارسنجی API (فیلتر سراسری با دیکشنری کامل ۷۲+ پیام) — پاسخ خطا فیلد `lang` را هم برمی‌گرداند
- گزارش مدیریتی هوشمند: `GET /ai/manager-report?lang=en|ar|fa` (هم حالت OpenAI و هم تحلیل داخلی)
- داشبورد وب: سوئیچر زبان در صفحه ورود و داشبورد با تغییر خودکار جهت صفحه (RTL/LTR) و قالب اعداد
- برای کدهای جدید: سرویس سراسری `I18nService` و دکوراتور `@Lang()` در کنترلرها


### 🤖 اتوماسیون n8n

| سرویس | آدرس |
|---------|------|
| بک‌اند Molido | http://localhost:3000 |
| Swagger Docs | http://localhost:3000/api-docs |
| داشبورد وب | http://localhost:3001 |
| پانل n8n | http://localhost:5678 |
| PostgreSQL | localhost:5432 |

**وب‌هوک Molido -> n8n:** `http://n8n:5678/webhook/molido`

**رویدادههای پشتیبانی‌شده:** sale.created / sale.cancelled / purchase.created / payment.created / expense.created / inventory.low_stock / complaint.created / complaint.resolved / cheque.bounced / installment.overdue / municipal_bill.created / fire.incident_created / pos.status_changed / user.registered

**n8n -> Molido:**
- Health check: `GET /n8n/health`
- ارسال دستور به Molido: `POST /n8n/incoming` (header: x-molido-secret)

**ورکفلوهای آماده (در `n8n-workflows/`):**
- `01_sale_notification_telegram.json` - اعلان فروش جدید در Telegram
- `02_low_stock_email.json` - هشدار موجودی کم با Email
- `03_cheque_bounced_alert.json` - هشدار برگشت چک
- `04_molido_health_check.json` - Health check خودکار هر ۵ دقیقه

## خزانه‌داری (Treasury)

| متد | مسیر | شرح |
|-----|------|-----|
| GET | /treasury/stats | آمار کل: مانده کل، تفکیک نوع حساب، تراکنش‌های اخیر |
| GET | /treasury/accounts | لیست حساب‌های خزانه |
| POST | /treasury/accounts | ایجاد حساب (بانکی/نقدی/تنخواه) با موجودی اولیه |
| GET | /treasury/accounts/:id | جزئیات حساب + ۲۰ تراکنش آخر |
| PATCH | /treasury/accounts/:id | ویرایش حساب |
| GET | /treasury/transactions | لیست تراکنش‌ها (فیلتر accountId و type) |
| POST | /treasury/transactions | واریز (DEPOSIT) یا برداشت (WITHDRAWAL) با به‌روزرسانی خودکار مانده |
| POST | /treasury/transfer | انتقال وجه بین دو حساب |

## قراردادها (Contracts)

| متد | مسیر | شرح |
|-----|------|-----|
| GET | /contracts/stats | آمار: تعداد به تفکیک وضعیت، مبلغ کل، رو به انقضا |
| GET | /contracts | لیست (فیلتر status ،type ،search ،expiringSoon) |
| POST | /contracts | ثبت قرارداد (انواع: خرید/فروش/خدمات/عمرانی/استخدامی/اجاره) |
| GET | /contracts/:id | جزئیات + اقساط |
| PATCH | /contracts/:id | ویرایش قرارداد |
| PATCH | /contracts/:id/status | تغییر وضعیت (DRAFT/ACTIVE/SUSPENDED/COMPLETED/TERMINATED) |
| POST | /contracts/:id/payments | افزودن قسط/پرداخت با سررسید |
| PATCH | /contracts/payments/:paymentId/pay | ثبت پرداخت قسط |

## حقوق و دستمزد (Payroll)

| متد | مسیر | شرح |
|-----|------|-----|
| GET | /payroll/stats | آمار ماه جاری: تعداد کارمندان، فیش‌ها، جمع خالص پرداختی |
| GET | /payroll/employees | لیست کارمندان (فیلتر search و onlyActive) |
| POST | /payroll/employees | ثبت کارمند (حقوق پایه، حق مسکن، بن خواروبار) |
| GET | /payroll/employees/:id | جزئیات کارمند + ۱۲ فیش آخر |
| PATCH | /payroll/employees/:id | ویرایش کارمند |
| GET | /payroll/slips | لیست فیش‌ها (فیلتر period ،employeeId ،status) |
| POST | /payroll/slips | صدور فیش حقوقی — خالص = پایه + مزایا + اضافه‌کاری + پاداش − کسورات − بیمه − مالیات (بیمه پیش‌فرض ۷٪، اضافه‌کاری ۱.۴ برابر نرخ ساعتی) |
| PATCH | /payroll/slips/:id/approve | تأیید فیش (DRAFT → APPROVED) |
| PATCH | /payroll/slips/:id/pay | پرداخت فیش (APPROVED → PAID) |
