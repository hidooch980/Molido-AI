-- سه نسخهٔ فروش: پایه، حرفه‌ای، پیشرفته.
--
-- ⚠️ نام‌های نسخه **تصمیمِ کسب‌وکار** است، نه فنی.
--
--    مهاجرت ۰۷۱ چهار پلنِ عمومی گذاشت (TRIAL/BASIC/PRO/ENTERPRISE)
--    چون هنوز معلوم نبود چه فروخته می‌شود.  حالا معلوم است:
--
--      BASIC     پایه
--      PRO       حرفه‌ای
--      ADVANCED  پیشرفته
--
-- ⚠️ «آزمایشی» پلنِ جدا **نیست**، و این عمدی است.
--
--    آزمایشی یعنی یکی از همین سه نسخه با تاریخِ پایان — نه چیزی
--    متفاوت.  پلنِ جدا برایش یعنی وقتی مشتری می‌خرد، پلنش باید عوض
--    شود و هر جا که به نامِ پلن تکیه کرده بود باید بداند «TRIAL هم
--    یعنی BASIC».  دو مفهوم که یکی‌شان زیرمجموعهٔ دیگری است.
--
--    نسخهٔ آزمایشیِ حرفه‌ای = PRO با `endsOn` چهارده روز بعد.

-- ⚠️ **اول قید را بردار، بعد داده را عوض کن، بعد قیدِ تازه.**
--
--    نسخهٔ اول برعکس نوشت — «اول داده، بعد قید» — و شکست:
--    `UPDATE ... SET plan='ADVANCED'` را قیدِ **قدیمی** رد کرد، چون
--    آن قید هنوز ADVANCED را نمی‌شناخت.
--
--    ترتیبِ درست همیشه همین است: قیدِ قدیم مانعِ رسیدن به حالتِ تازه
--    است، پس باید اول کنار برود.
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_plan_check";

UPDATE "Subscription" SET plan = 'ADVANCED' WHERE plan = 'ENTERPRISE';
UPDATE "Subscription" SET plan = 'BASIC'    WHERE plan = 'TRIAL';

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_plan_check"
  CHECK (plan IN ('BASIC', 'PRO', 'ADVANCED'));

ALTER TABLE "Subscription" ALTER COLUMN plan SET DEFAULT 'BASIC';

-- سقف‌های پیش‌فرضِ هر نسخه.
--
-- ⚠️ این جدول **داده** است، نه کد.
--
--    قیمت و سقف با بازار عوض می‌شوند.  اگر در کد بودند، هر تغییرِ
--    بازاریابی یک استقرار می‌خواست — و آن یعنی تغییر نمی‌کند.
--
-- ⚠️ `NULL` یعنی بی‌حد، نه صفر.  همان تفاوتی که در ۰۷۱ توضیح داده
--    شد: صفر شرکت را قفل می‌کند.
CREATE TABLE IF NOT EXISTS "PlanDefault" (
  plan          text PRIMARY KEY,
  title         text NOT NULL,
  "maxUsers"    integer,
  "maxBranches" integer,
  note          text,

  CONSTRAINT "PlanDefault_plan_check"
    CHECK (plan IN ('BASIC', 'PRO', 'ADVANCED')),
  CONSTRAINT "PlanDefault_limits_check"
    CHECK (("maxUsers"    IS NULL OR "maxUsers"    > 0)
       AND ("maxBranches" IS NULL OR "maxBranches" > 0))
);

-- ⚠️ این اعداد **پیشنهادِ اولیه**‌اند و قرار است عوض شوند.
--
--    از روی چیزی انتخاب شده‌اند که در سامانه واقعاً وجود دارد:
--    شعبه، کاربر.  نه از روی حدسِ قیمت‌گذاری — آن کارِ شماست.
INSERT INTO "PlanDefault" (plan, title, "maxUsers", "maxBranches", note) VALUES
  ('BASIC',    'پایه',      3,    1,    'یک شعبه، سه کاربر — کسب‌وکارِ تک‌فروشگاهی'),
  ('PRO',      'حرفه‌ای',   10,   3,    'چند شعبه، ده کاربر'),
  ('ADVANCED', 'پیشرفته',   NULL, NULL, 'بی‌حد — زنجیره و نصبِ اختصاصی')
ON CONFLICT (plan) DO NOTHING;

GRANT SELECT ON "PlanDefault" TO molido_app;
