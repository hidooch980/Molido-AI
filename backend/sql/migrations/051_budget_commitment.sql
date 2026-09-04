-- چرخهٔ اعتبار بودجه: تخصیص ← تعهد ← هزینهٔ قطعی.
--
-- ⚠️ چه چیزی کم بود؟
--
--    `BudgetLine` فقط `amount` و `spent` داشت.  یعنی سامانه می‌دانست
--    چقدر بودجه هست و چقدر خرج شده — ولی نمی‌دانست چقدر **قول داده
--    شده و هنوز خرج نشده**.
--
--    آن فاصله همان چیزی است که بودجه‌ریزی را ممکن می‌کند.  قراردادی
--    که امضا شده ولی فاکتورش نیامده، پولِ در دسترس نیست؛ ولی در
--    `spent` هم نمی‌نشیند.  بدونِ تعهد، مدیر رقمی می‌بیند که آزاد
--    نیست و دوباره خرجش می‌کند.
--
--    این خطا در بخش خصوصی هم بد است؛ در دستگاه دولتی تخلف است.

-- ------------------------------------------- ستون‌های تازه

ALTER TABLE "BudgetLine"
  -- مبلغِ **تخصیص‌یافته** — همیشه با مصوب یکی نیست.
  --
  -- ⚠️ مصوب یعنی «مجلس/شورا اجازه داده»، تخصیص یعنی «خزانه پول را
  --    آزاد کرده».  در عمل تخصیص اغلب کمتر از مصوب است و ملاکِ
  --    خرج کردن همان است.  تهی یعنی هنوز تخصیصی نیامده.
  ADD COLUMN IF NOT EXISTS "allocated" numeric,
  -- مبلغِ تعهدشده و هنوز قطعی‌نشده.
  ADD COLUMN IF NOT EXISTS "committed" numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN "BudgetLine"."allocated" IS
  'اعتبارِ تخصیص‌یافته؛ تهی = هنوز تخصیص نیامده و مبنا `amount` است.';
COMMENT ON COLUMN "BudgetLine"."committed" IS
  'تعهدشده و هنوز قطعی‌نشده — بین تخصیص و هزینه.';

-- ⚠️ هیچ‌کدام منفی نمی‌شوند.
--
--    تعهدِ منفی یعنی جایی آزادسازی بیش از تعهد رخ داده — نشانهٔ
--    اشکالِ منطق، نه دادهٔ درست.  قید در پایگاه داده می‌گیردش، حتی
--    اگر مسیرِ تازه‌ای فردا اضافه شود.
ALTER TABLE "BudgetLine" DROP CONSTRAINT IF EXISTS "BudgetLine_nonneg";
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_nonneg"
  CHECK (
    "committed" >= 0
    AND COALESCE(spent, 0) >= 0
    AND ("allocated" IS NULL OR "allocated" >= 0)
  );

-- ------------------------------------------- دفترِ تعهد

-- ⚠️ چرا جدولِ جدا و نه فقط یک عدد روی `BudgetLine`؟
--
--    عددِ تنها می‌گوید «چقدر»، نه «بابتِ چه».  وقتی تعهد از اعتبار رد
--    شود، کسی باید بتواند بپرسد کدام قرارداد یا سفارش آن را خورده —
--    و بدونِ دفتر، جوابی نیست.
--
--    ضمناً آزادسازیِ تعهد (لغو قرارداد) بدونِ دفتر قابل ردیابی نیست.
CREATE TABLE IF NOT EXISTS "BudgetCommitment" (
  id            text PRIMARY KEY,
  "companyId"   text NOT NULL,
  "budgetLineId" text NOT NULL,

  -- CONTRACT | PURCHASE | EXPENSE | MANUAL
  "sourceType"  text NOT NULL,
  "sourceId"    text,

  amount        numeric NOT NULL CHECK (amount > 0),

  -- OPEN: تعهد باز | SETTLED: به هزینهٔ قطعی تبدیل شد | RELEASED: آزاد شد
  status        text NOT NULL DEFAULT 'OPEN'
                CHECK (status IN ('OPEN', 'SETTLED', 'RELEASED')),

  note          text,
  "userId"      text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "settledAt"   timestamptz,

  CONSTRAINT "BudgetCommitment_line_fk"
    FOREIGN KEY ("budgetLineId") REFERENCES "BudgetLine"(id) ON DELETE CASCADE
);

-- ⚠️ یک سند نمی‌تواند دو بار تعهد بسازد.
--
--    بدونِ این، فراخوانیِ دوبارهٔ «تعهد این قرارداد» — با کلیکِ دوباره
--    یا تلاشِ مجددِ شبکه — اعتبار را دو بار می‌خورد.  همان الگوی
--    یکتاسازی که برای فاکتور خرید ساختیم.
CREATE UNIQUE INDEX IF NOT EXISTS "BudgetCommitment_source_uniq"
  ON "BudgetCommitment" ("companyId", "sourceType", "sourceId")
  WHERE "sourceId" IS NOT NULL AND status = 'OPEN';

CREATE INDEX IF NOT EXISTS "BudgetCommitment_line_idx"
  ON "BudgetCommitment" ("budgetLineId", status);

COMMENT ON TABLE "BudgetCommitment" IS
  'دفترِ تعهد — هر تعهد بابتِ کدام سند و در چه وضعیتی.';
