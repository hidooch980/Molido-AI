-- یادآوری‌ها
--
-- یادداشتِ سررسیددار: «۱۵ام سراغِ چکِ آقای رضایی برو»، «قرارداد بیمه
-- تیر تمام می‌شود».
--
-- ⚠️ چرا جدا از `notifications`؟
--
--    آن سرویس هشدارهای **مشتق** می‌دهد — موجودی کم، تاریخ انقضا،
--    فاکتورِ تسویه‌نشده — که همه از دادهٔ موجود حساب می‌شوند و جدول
--    ندارند.  یادآوری برعکس است: چیزی که **آدم** تصمیم گرفته به یادش
--    باشد و هیچ‌جای دیگری از آن نمی‌شود مشتقش کرد.
--
-- ⚠️ ولی در همان فیدِ هشدار دیده می‌شود، نه در صفحهٔ جدا.
--
--    یادآوری‌ای که کاربر باید جای دیگری دنبالش بگردد، همان یادآوری‌ای
--    است که فراموش می‌شود.

CREATE TABLE IF NOT EXISTS "Reminder" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,

  title         TEXT NOT NULL,
  note          TEXT,
  "dueAt"       TIMESTAMPTZ NOT NULL,

  status        TEXT NOT NULL DEFAULT 'PENDING',
  "doneAt"      TIMESTAMPTZ,

  -- به چه کسی سپرده شده.  NULL یعنی «هر کسی که دید».
  "assignedTo"  TEXT REFERENCES "User"(id) ON DELETE SET NULL,
  "createdBy"   TEXT REFERENCES "User"(id) ON DELETE SET NULL,

  -- ⚠️ پیوند به موجودیت، بدونِ کلیدِ خارجی.
  --
  --    یادآوری می‌تواند به مشتری، فاکتور، چک یا قرارداد بچسبد.  کلیدِ
  --    خارجی به هر چهار جدول یعنی چهار ستونِ nullable که سه‌تایشان
  --    همیشه خالی‌اند.  جفتِ (نوع، شناسه) ساده‌تر است — به بهای اینکه
  --    پایگاه‌داده درستیِ ارجاع را تضمین نمی‌کند.
  --
  --    این معامله اینجا می‌ارزد چون یادآوریِ یتیم بی‌ضرر است: نهایتاً
  --    کاربر رویش کلیک می‌کند و چیزی پیدا نمی‌شود.  برای پول این
  --    معامله را نمی‌کردم.
  "entityType"  TEXT,
  "entityId"    TEXT,

  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "Reminder_status_check"
    CHECK (status IN ('PENDING', 'DONE', 'CANCELLED')),

  -- ⚠️ «انجام‌شده» بدونِ زمانِ انجام بی‌معنی است، و برعکس.
  --    دو ستونی که می‌توانند با هم نخوانند، روزی نمی‌خوانند.
  CONSTRAINT "Reminder_done_check"
    CHECK ((status = 'DONE') = ("doneAt" IS NOT NULL)),

  CONSTRAINT "Reminder_title_check" CHECK (btrim(title) <> ''),

  -- هر دو یا هیچ‌کدام؛ شناسهٔ بی‌نوع قابلِ استفاده نیست.
  CONSTRAINT "Reminder_entity_check"
    CHECK (("entityType" IS NULL) = ("entityId" IS NULL))
);

-- ⚠️ نمایهٔ اصلی روی (شرکت، وضعیت، سررسید) است، نه فقط سررسید.
--    پرس‌وجوی همیشگی «یادآوری‌های بازِ این شرکت که سررسیدشان رسیده»
--    است؛ نمایهٔ تک‌ستونی مجبورش می‌کند همهٔ انجام‌شده‌ها را هم بخواند.
CREATE INDEX IF NOT EXISTS "Reminder_due_idx"
  ON "Reminder" ("companyId", status, "dueAt");
CREATE INDEX IF NOT EXISTS "Reminder_assignee_idx"
  ON "Reminder" ("assignedTo");
CREATE INDEX IF NOT EXISTS "Reminder_createdBy_idx"
  ON "Reminder" ("createdBy");
CREATE INDEX IF NOT EXISTS "Reminder_entity_idx"
  ON "Reminder" ("entityType", "entityId") WHERE "entityType" IS NOT NULL;

ALTER TABLE "Reminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reminder" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_isolation ON "Reminder";
CREATE POLICY company_isolation ON "Reminder"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "Reminder" TO molido_app;
