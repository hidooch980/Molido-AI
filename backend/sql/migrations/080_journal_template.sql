-- سندِ تکرارشونده (ثبت گروهی اسناد اتومات)
--
-- اجارهٔ ماهانه، استهلاک، حق بیمه — سندهایی که هر دوره عیناً تکرار
-- می‌شوند و زدنشان با دست هم وقت‌گیر است و هم خطاخیز.
--
-- ⚠️ الگو **سند نیست**؛ سند می‌سازد.
--
--    دو مفهومِ متفاوت‌اند و یکی‌کردنشان وسوسه‌انگیز است: می‌شد یک ستونِ
--    `isTemplate` به `JournalEntry` زد.  ولی آن‌وقت هر گزارشِ مالی باید
--    یادش باشد الگوها را کنار بگذارد — و روزی یکی یادش نمی‌ماند و
--    اجارهٔ نزده در صورت سود و زیان می‌نشیند.

CREATE TABLE IF NOT EXISTS "JournalTemplate" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,

  title         TEXT NOT NULL,
  description   TEXT NOT NULL,

  -- ⚠️ اقلام در JSONB، نه جدولِ جدا.
  --
  --    اقلامِ الگو هرگز جدا پرس‌وجو نمی‌شوند؛ همیشه با هم خوانده و با هم
  --    نوشته می‌شوند.  جدولِ فرزند اینجا فقط پیچیدگی می‌افزاید.
  --
  --    شکل: [{accountCode, debit?, credit?, description}]
  lines         JSONB NOT NULL,

  -- MONTHLY | QUARTERLY | YEARLY | MANUAL
  frequency     TEXT NOT NULL DEFAULT 'MONTHLY',

  -- ⚠️ تاریخ‌ها `DATE`اند نه `TIMESTAMPTZ`.
  --    «سررسیدِ سندِ اجارهٔ مهر» یک روز است، نه یک لحظه؛ با
  --    `TIMESTAMPTZ` همان دردسرِ منطقهٔ زمانی برمی‌گشت.
  "nextRunOn"   DATE,
  "lastRunOn"   DATE,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,

  "createdBy"   TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "JournalTemplate_frequency_check"
    CHECK (frequency IN ('MONTHLY', 'QUARTERLY', 'YEARLY', 'MANUAL')),
  CONSTRAINT "JournalTemplate_title_check" CHECK (btrim(title) <> ''),

  -- ⚠️ الگو باید دستِ‌کم دو قلم داشته باشد.
  --    سندِ یک‌قلمی هرگز تراز نمی‌شود؛ گرفتنش اینجا بهتر از ماهِ بعد
  --    است که کاربر منتظرِ سند است و خطا می‌گیرد.
  CONSTRAINT "JournalTemplate_lines_check"
    CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) >= 2),

  -- الگوی زمان‌بندی‌شده بدونِ سررسید هرگز اجرا نمی‌شود.
  CONSTRAINT "JournalTemplate_next_check"
    CHECK (frequency = 'MANUAL' OR "nextRunOn" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "JournalTemplate_due_idx"
  ON "JournalTemplate" ("companyId", "isActive", "nextRunOn");
CREATE INDEX IF NOT EXISTS "JournalTemplate_createdBy_idx"
  ON "JournalTemplate" ("createdBy");

ALTER TABLE "JournalTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JournalTemplate" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON "JournalTemplate";
CREATE POLICY company_isolation ON "JournalTemplate"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "JournalTemplate" TO molido_app;
