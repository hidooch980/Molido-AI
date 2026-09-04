-- نظر و امتیازِ کالا در فروشگاه اینترنتی.
--
-- ⚠️ چرا لازم است؟
--
--    خریدارِ آنلاین کالا را لمس نمی‌کند.  تنها چیزی که جای آن را
--    می‌گیرد، تجربهٔ کسی است که خریده.  فروشگاهی بدونِ نظر، از دیدِ
--    خریدار «هیچ‌کس اینجا خرید نکرده» به‌نظر می‌رسد.

CREATE TABLE IF NOT EXISTS "ProductReview" (
  id           text PRIMARY KEY,
  "companyId"  text NOT NULL,
  "productId"  text NOT NULL,
  "customerId" text NOT NULL,

  -- ⚠️ قیدِ ۱ تا ۵ در خودِ پایگاه داده، نه فقط در DTO.
  --
  --    اعتبارسنجیِ لایهٔ برنامه را می‌شود دور زد — با مسیرِ تازه‌ای که
  --    فردا اضافه شود، یا با اسکریپتِ درون‌ریزی.  امتیازِ ۹۹ میانگین
  --    را خراب می‌کند و هیچ خطایی هم نمی‌دهد.
  rating       smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),

  comment      text,

  -- ⚠️ نظر پیش از نمایش تأیید می‌شود.
  --
  --    نمایشِ بی‌واسطه یعنی هر کسی می‌تواند تبلیغ یا فحش روی صفحهٔ
  --    کالای فروشگاه بگذارد.  پیش‌فرض `false` است: سکوت بهتر از
  --    محتوایی است که صاحبِ فروشگاه ندیده.
  approved     boolean NOT NULL DEFAULT false,

  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "updatedAt"  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "ProductReview_product_fk"
    FOREIGN KEY ("productId") REFERENCES "Product"(id) ON DELETE CASCADE,
  CONSTRAINT "ProductReview_customer_fk"
    FOREIGN KEY ("customerId") REFERENCES "Customer"(id) ON DELETE CASCADE
);

-- ⚠️ هر مشتری برای هر کالا **یک** نظر.
--
--    بدونِ این، یک نفر می‌توانست ده بار پنج‌ستاره بدهد و میانگین را
--    بسازد — یعنی امتیاز از «نظرِ خریداران» به «نظرِ پرحوصله‌ترین»
--    تبدیل می‌شد.  ویرایش همان رکورد را به‌روز می‌کند.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductReview_one_per_customer"
  ON "ProductReview" ("productId", "customerId");

-- نمایشِ صفحهٔ کالا: نظرهای تأییدشدهٔ یک کالا، تازه‌ترین اول.
CREATE INDEX IF NOT EXISTS "ProductReview_product_approved_idx"
  ON "ProductReview" ("productId", approved, "createdAt" DESC);

-- صفِ بررسیِ مدیر: نظرهای تأییدنشدهٔ یک شرکت.
CREATE INDEX IF NOT EXISTS "ProductReview_pending_idx"
  ON "ProductReview" ("companyId", approved, "createdAt" DESC);

COMMENT ON TABLE "ProductReview" IS
  'نظر و امتیاز کالا؛ پیش از نمایش باید تأیید شود.';
COMMENT ON COLUMN "ProductReview".approved IS
  'تهی‌نشدنی و پیش‌فرض false — نظرِ تأییدنشده در فروشگاه دیده نمی‌شود.';
