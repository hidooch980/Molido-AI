-- =============================================
-- اختیارات نقش‌ها قابل ویرایش می‌شود
--
-- تا امروز نقش‌ها در کد ثابت بودند: `@Roles('ADMIN', 'MANAGER')` روی
-- ۲۹۱ مسیر.  یعنی فروشگاهی که می‌خواهد صندوق‌دارش گزارش فروش ببیند
-- باید کد را عوض کند و دوباره مستقر شود.
--
-- ⚠️ سه تصمیم که هرکدام می‌توانست نصب را قفل کند:
--
--   **۱. جدولِ خالی یعنی رفتارِ امروز.**
--
--      ردیفِ نبود ⇒ همان `@Roles` کد.  اگر پیش‌فرض «همه‌چیز ممنوع»
--      بود، اولین استقرار همه را بیرون می‌انداخت؛ اگر «همه‌چیز مجاز»
--      بود، همان لحظه هر کاربری به هر مسیری دسترسی پیدا می‌کرد.
--      هیچ‌کدام پذیرفتنی نیست.
--
--   **۲. `SUPER_ADMIN` قابل محدود کردن نیست.**
--
--      قید پایگاه داده جلویش را می‌گیرد، نه فقط کد.  اگر مدیری به
--      اشتباه اختیارِ خودش را بگیرد، راهِ برگشتی جز دست بردن در
--      دیتابیس نمی‌ماند — و آن کاری است که یک فروشگاه بلد نیست.
--
--   **۳. کلیدِ اختیار، نامِ مسیر است نه نامِ ماژول.**
--
--      «فروش» به‌تنهایی معنی ندارد: دیدنِ فهرست فروش با لغو کردن
--      فاکتور یکی نیست.  کلید `sales:cancel` است، نه `sales`.
-- =============================================

CREATE TABLE IF NOT EXISTS "RolePermission" (
  id           TEXT PRIMARY KEY,
  "companyId"  TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  -- کلیدِ اختیار: «حوزه:کار» — مثلاً `sales:cancel`
  permission   TEXT NOT NULL,
  -- `true` می‌دهد، `false` می‌گیرد.  نبودِ ردیف یعنی «هرچه کد گفته».
  allowed      BOOLEAN NOT NULL,
  "updatedBy"  TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "RolePermission_companyId_role_permission_key"
    UNIQUE ("companyId", role, permission),

  -- خطِ آخرِ دفاع: حتی اگر کدی روزی این را فراموش کند، دیتابیس
  -- نمی‌گذارد اختیارِ مدیرِ ارشد گرفته شود.
  CONSTRAINT "RolePermission_superadmin_chk"
    CHECK (role <> 'SUPER_ADMIN' OR allowed = true)
);

CREATE INDEX IF NOT EXISTS "RolePermission_lookup_idx"
  ON "RolePermission" ("companyId", role);

COMMENT ON TABLE "RolePermission" IS
  'بازنویسی اختیارات نقش‌ها؛ نبودِ ردیف یعنی همان چیزی که در کد @Roles آمده';
