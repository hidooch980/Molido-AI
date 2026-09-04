# نقشهٔ فصل‌بندی Molido AI

این نقشه، پروژه را بر اساس حوزهٔ کسب‌وکار دسته‌بندی می‌کند. هر فصل باید API، مدل SQL، migration، تست و رابط وب مرتبط خود را کنار هم نگه دارد.

## فصل ۱ — هسته و زیرساخت

- `backend/src/app`, `common`, `config`, `database`, `i18n`, `uploads`
- راه‌اندازی Nest، پیکربندی، مجوزها، اتصال PostgreSQL و migrationهای SQL
- `web/app`, `web/components`, `web/lib` برای پوسته و رابط کاربری مشترک

## فصل ۲ — هویت و سازمان

- `auth`, `users`, `companies`, `api-keys`, `audit-log`
- ورود، نقش‌ها، کاربران، شرکت‌ها، کلیدهای API و ثبت رویدادها

## فصل ۳ — کالا، انبار و خرید

- `categories`, `products`, `warehouses`, `inventory`, `suppliers`, `purchases`
- کاتالوگ کالا، موجودی، تأمین‌کننده و چرخهٔ خرید

## فصل ۴ — فروش و مشتری

- `customers`, `sales`, `sales-orders`, `payments`, `returns`, `shipments`
- فروش، سفارش، پرداخت، مرجوعی، ارسال و سوابق مشتری

## فصل ۵ — مالی و منابع سازمانی

- `accounting`, `cashbox`, `expenses`, `treasury`, `cheques`, `payroll`, `budget`, `assets`, `contracts`, `loans`, `investments`
- حسابداری، خزانه، هزینه، قرارداد، بودجه، حقوق و دارایی‌ها

## فصل ۶ — عملیات و منابع انسانی

- `attendance`, `leave-requests`, `performance`, `training`, `helpdesk`, `approvals`, `projects`, `construction-projects`, `fleet`
- حضور و غیاب، گردش کار، پروژه، ناوگان و پشتیبانی داخلی

## فصل ۷ — کسب‌وکارهای تخصصی

- `restaurant`, `pos-terminals`, `clinic`, `parking`, `business-licenses`, `cemetery`, `taxi`, `fire-department`
- ماژول‌های قابل فعال‌سازی بر اساس صنف یا صنعت

## فصل ۸ — شهرداری و خدمات شهری

- `municipal-fees`, `municipal-properties`, `property-audit`, `technical-office`, `service-zones`, `e-city`, `council`, `crisis`, `street-lights`, `iot`, `cctv`, `utility-meters`
- خدمات شهر، عوارض، املاک، بحران، روشنایی و زیرساخت هوشمند

## فصل ۹ — ارتباطات و اتوماسیون

- `notifications`, `sms`, `email-campaigns`, `webhooks`, `n8n`, `ai`, `news`, `dms`, `letters`, `surveys`
- پیام‌رسانی، اتوماسیون، هوش مصنوعی، اسناد و ارتباط با مشتری

## فصل ۱۰ — گزارش‌گیری و کنترل

- `reports`, `health`, `customer-tickets`, `crm`, `discount-rules`, `price-levels`, `sales-agents`, `quotations`, `serial-numbers`
- تحلیل، پایش سلامت، وفاداری، قیمت‌گذاری و گزارش مدیریتی

## قواعد ساختاری

1. هر فصل فقط از SQL پارامتردار در `DatabaseService` استفاده می‌کند؛ Prisma ممنوع است.
2. تغییر schema فقط با یک فایل جدید در `backend/sql/migrations/` انجام می‌شود.
3. کدهای قدیمی و مرجع در `legacy/` نگهداری می‌شوند و نباید وارد اجرای اصلی شوند.
4. هر ماژول جدید باید در یکی از فصل‌های بالا ثبت و برای آن تست و migration اضافه شود.
