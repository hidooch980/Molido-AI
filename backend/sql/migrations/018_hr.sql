-- =============================================
-- منابع انسانی: حضور و غیاب، مرخصی، عملکرد
--
-- جدول‌ها وجود داشتند ولی سرویس‌هایشان پوستهٔ خالی بود (۱۳ خط CRUD).  در
-- عمل یعنی: حضور ثبت می‌شد ولی اضافه‌کاری محاسبه نمی‌شد، مرخصی تأیید
-- می‌شد ولی از مانده کم نمی‌کرد، و فیش حقوق هیچ سند حسابداری نمی‌زد.
-- =============================================

-- ---------- ۱) حضور و غیاب ----------
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "leaveRequestId" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PRESENT';

DO $$
BEGIN
  ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_status_chk"
    CHECK (status IN ('PRESENT','ABSENT','LEAVE','HOLIDAY','MISSION'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- خروج نمی‌تواند پیش از ورود باشد.  بدون این قید، یک اشتباه تایپی
-- ساعت کارکرد را منفی می‌کند و حقوق را بی‌سروصدا خراب می‌کند.
DO $$
BEGIN
  ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_time_chk"
    CHECK ("checkOut" IS NULL OR "checkIn" IS NULL OR "checkOut" >= "checkIn");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_hours_chk"
    CHECK (
      COALESCE("workedHours",0) >= 0 AND COALESCE("workedHours",0) <= 24
      AND COALESCE("overtimeHours",0) >= 0 AND COALESCE("overtimeHours",0) <= 24
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- یک کارمند در یک روز فقط یک رکورد.  ثبت دوباره باید همان رکورد را
-- به‌روز کند، نه اینکه ساعت کارکرد را دو برابر بشمارد.
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_employee_date_key"
  ON "AttendanceRecord" ("employeeId", date);

CREATE INDEX IF NOT EXISTS "AttendanceRecord_company_date_idx"
  ON "AttendanceRecord" ("companyId", date DESC);

-- ---------- ۲) مرخصی ----------
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "decidedBy" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "decisionNote" TEXT;

DO $$
BEGIN
  ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_status_chk"
    CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_kind_chk"
    CHECK (kind IN ('ANNUAL','SICK','UNPAID','MISSION','EMERGENCY'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_range_chk"
    CHECK ("endDate" >= "startDate" AND days > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "LeaveRequest_employee_idx"
  ON "LeaveRequest" ("employeeId", "startDate" DESC);
CREATE INDEX IF NOT EXISTS "LeaveRequest_pending_idx"
  ON "LeaveRequest" ("companyId") WHERE status = 'PENDING';

-- ---------- ۳) مانده مرخصی ----------
-- سهمیهٔ سالانه و مصرف‌شده.  بدون این جدول، «چند روز مرخصی مانده؟» فقط با
-- جمع‌زدن کل تاریخچه پاسخ می‌گرفت و سهمیهٔ سال‌های قبل با هم قاطی می‌شد.
CREATE TABLE IF NOT EXISTS "LeaveBalance" (
  id           TEXT PRIMARY KEY,
  "companyId"  TEXT NOT NULL,
  "employeeId" TEXT NOT NULL REFERENCES "Employee"(id) ON DELETE CASCADE,
  year         INTEGER NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'ANNUAL',
  entitled     NUMERIC(6,2) NOT NULL DEFAULT 26,
  used         NUMERIC(6,2) NOT NULL DEFAULT 0,
  "carriedOver" NUMERIC(6,2) NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- مصرف نمی‌تواند از سهمیه بیشتر شود.  کنترل در سطح دیتابیس است چون
  -- تأیید مرخصی از چند مسیر ممکن است انجام شود.
  CONSTRAINT "LeaveBalance_used_chk"
    CHECK (used >= 0 AND used <= entitled + "carriedOver")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeaveBalance_unique"
  ON "LeaveBalance" ("employeeId", year, kind);

-- ---------- ۴) فیش حقوق ----------
ALTER TABLE "PayrollSlip" ADD COLUMN IF NOT EXISTS "journalEntryId" TEXT;
ALTER TABLE "PayrollSlip" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "PayrollSlip" ADD COLUMN IF NOT EXISTS "leaveDays" NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE "PayrollSlip" ADD COLUMN IF NOT EXISTS "absentDays" NUMERIC(6,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE "PayrollSlip" ADD CONSTRAINT "PayrollSlip_status_chk"
    CHECK (status IN ('DRAFT','APPROVED','PAID','CANCELLED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- یک فیش برای هر کارمند در هر دوره.  محاسبهٔ دوبارهٔ پایان ماه نباید دو
-- فیش بسازد و دو بار حقوق بدهد.
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollSlip_employee_period_key"
  ON "PayrollSlip" ("employeeId", period)
  WHERE status <> 'CANCELLED';

-- ---------- ۵) ارزیابی عملکرد ----------
DO $$
BEGIN
  ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_score_chk"
    CHECK (score BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PerformanceReview_unique"
  ON "PerformanceReview" ("employeeId", period);

-- ---------- ۶) سیاست RLS برای جدول تازه ----------
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN information_schema.columns col
        ON col.table_name = c.relname
       AND col.table_schema = n.nspname
       AND col.column_name = 'companyId'
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND NOT EXISTS (
         SELECT 1 FROM pg_policies p
          WHERE p.tablename = c.relname AND p.policyname = 'company_isolation'
       )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target.table_name);
    EXECUTE format($f$
      CREATE POLICY company_isolation ON %I
        FOR ALL TO molido_app
        USING ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
        WITH CHECK ("companyId" = NULLIF(current_setting('app.company_id', true), ''))
    $f$, target.table_name);
    RAISE NOTICE 'RLS policy added: %', target.table_name;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO molido_app;
