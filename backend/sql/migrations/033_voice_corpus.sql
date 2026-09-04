-- =============================================
-- پیکرهٔ صوتی — دادهٔ آموزش تشخیص گفتار بلوچی
--
-- چرا در خودِ سامانه و نه یک ابزار جدا: گلوگاهِ ساختن موتور گفتار
-- بلوچی، **دادهٔ صوتی** است.  هیچ پیکرهٔ آماده‌ای وجود ندارد و باید از
-- صفر ضبط شود.
--
-- Molido فهرست کالاها را دارد.  فروشنده نام هر کالا را به بلوچی
-- می‌گوید، و پیکره از دادهٔ واقعی همان فروشگاه ساخته می‌شود — نه از
-- متن عمومی که واژه‌هایش هیچ‌وقت در صندوق گفته نمی‌شوند.
--
-- برای صندوق، تشخیص گفتار عمومی لازم نیست: ~۲۰۰ واژه کافی است (نام
-- کالاها، اعداد، چند فرمان).  با همین دامنهٔ محدود، دقتش از تشخیص
-- عمومی فارسی هم بالاتر می‌رود.
-- =============================================

-- ---------- ۱) عبارت‌های پیکره ----------
--
-- «چه چیزی باید ضبط شود» — نام کالا، عدد، یا فرمان.
CREATE TABLE IF NOT EXISTS "VoicePhrase" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,

  -- زبان هدف.  فعلاً فقط بلوچی لازم است، ولی همین ساختار برای هر زبان
  -- کم‌منبع دیگری هم کار می‌کند.
  lang          TEXT NOT NULL DEFAULT 'bal',

  -- گویش.
  --
  -- بلوچی یک زبان یکدست نیست.  سه گویشِ بلوچستان ایران — سرحدی
  -- (خاش، زاهدان، میرجاوه)، مکرانی (چابهار، کنارک، نیکشهر) و سراوانی
  -- — برای یک چیز واژه‌های متفاوت دارند.
  --
  -- بدون این ستون، پیکره‌ای ساخته می‌شود که سه گویش در آن قاطی است، و
  -- مدلی که رویش آموزش ببیند هیچ‌کدام را درست نمی‌شناسد.
  --
  -- نام‌ها محلی‌اند نه دانشگاهی: زبان‌شناس «رخشانی» می‌گوید و سرحدی را
  -- زیرمجموعه‌اش می‌داند، ولی کسی که پای صندوق این را انتخاب می‌کند،
  -- «سرحدی» را می‌شناسد.
  --
  -- یک فروشگاه معمولاً یک گویش دارد، پس پیش‌فرض کافی است و کسی مجبور
  -- نیست هر بار انتخاب کند.
  dialect       TEXT NOT NULL DEFAULT 'SARHADDI'
                CHECK (dialect IN ('SARHADDI', 'MAKRANI', 'SARAWANI')),

  -- PRODUCT | NUMBER | COMMAND
  kind          TEXT NOT NULL DEFAULT 'PRODUCT'
                CHECK (kind IN ('PRODUCT', 'NUMBER', 'COMMAND')),

  -- کالای مرتبط، اگر عبارت نام کالاست.  با حذف کالا، عبارتش هم می‌رود:
  -- ضبطِ نام کالایی که دیگر وجود ندارد، فقط پیکره را سنگین می‌کند.
  "productId"   TEXT REFERENCES "Product"(id) ON DELETE CASCADE,

  -- متن فارسی (آنچه در سامانه ثبت است) و متن بلوچی (آنچه گفته می‌شود).
  --
  -- هر دو لازم‌اند: آموزش به جفتِ «صدا ← متن» نیاز دارد، و متنِ درست
  -- همان بلوچی است نه فارسی.
  "textFa"      TEXT NOT NULL,
  "textTarget"  TEXT,

  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- یک عبارت یک بار در هر زبان.  دو ردیف یکسان یعنی ضبط‌ها پخش
  -- می‌شوند و هیچ‌کدام به حد نصاب نمی‌رسند.
  UNIQUE ("companyId", lang, dialect, "textFa")
);

CREATE INDEX IF NOT EXISTS "VoicePhrase_company_idx"
  ON "VoicePhrase" ("companyId", lang, dialect, "sortOrder");

-- ---------- ۲) ضبط‌ها ----------
--
-- هر عبارت چند بار و از چند نفر ضبط می‌شود.  یک گوینده کافی نیست:
-- مدلی که فقط صدای یک نفر را شنیده، صدای بقیه را نمی‌شناسد.
CREATE TABLE IF NOT EXISTS "VoiceSample" (
  id            TEXT PRIMARY KEY,
  "companyId"   TEXT NOT NULL REFERENCES "Company"(id) ON DELETE CASCADE,
  "phraseId"    TEXT NOT NULL REFERENCES "VoicePhrase"(id) ON DELETE CASCADE,

  "audioUrl"    TEXT NOT NULL,
  "durationMs"  INTEGER,
  "sizeBytes"   INTEGER,

  -- گویندهٔ ناشناس ولی قابل تفکیک.
  --
  -- نام واقعی لازم نیست و نگه‌داشتنش داده‌ای شخصی می‌سازد که دلیلی
  -- ندارد.  ولی «چند گویندهٔ متفاوت» باید قابل شمارش باشد، وگرنه
  -- معلوم نمی‌شود پیکره متنوع است یا صد بار صدای یک نفر.
  "speakerTag"  TEXT NOT NULL,

  -- PENDING → APPROVED | REJECTED
  --
  -- ضبطِ نویزی یا اشتباه، مدل را بدتر می‌کند نه بهتر.  بازبینی لازم
  -- است و باید پیش از آموزش انجام شود.
  status        TEXT NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  "rejectReason" TEXT,

  "recordedBy"  TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "VoiceSample_phrase_idx"
  ON "VoiceSample" ("phraseId", status);

CREATE INDEX IF NOT EXISTS "VoiceSample_company_idx"
  ON "VoiceSample" ("companyId", "createdAt" DESC);

DO $$
BEGIN
  ALTER TABLE "VoiceSample" ADD CONSTRAINT "voice_sample_duration_sane"
    CHECK ("durationMs" IS NULL OR ("durationMs" > 200 AND "durationMs" < 30000));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- ۳) RLS ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['VoicePhrase', 'VoiceSample'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    BEGIN
      EXECUTE format(
        'CREATE POLICY company_isolation ON %I USING ("companyId" = current_setting(''app.company_id'', true))',
        t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO molido_app', t);
  END LOOP;
END $$;
