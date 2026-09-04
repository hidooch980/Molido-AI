-- روزنهٔ پیگیریِ عمومیِ شکایت.
--
-- ⚠️ چه چیزی خراب بود؟
--
--    `GET /complaints/track/:trackingNo` بدونِ ورود کار می‌کند — همان
--    امکانی که برای خودِ شهروند ساخته شده.  ولی شهروند توکن ندارد،
--    پس `app.company_id` تهی می‌ماند و سیاستِ `company_isolation` با
--    رفتار fail-closed هیچ سطری برنمی‌گرداند.
--
--    نتیجه: مسیر **همیشه ۴۰۴ می‌داد**، حتی برای کدِ معتبر.  با آزمونِ
--    زندهٔ همان مسیر پیدا شد، نه با خواندنِ کد.
--
-- ⚠️ چرا سیاستِ تازه و نه دور زدنِ RLS؟
--
--    `runAsSystem` فقط برای نقشِ صاحبِ جدول باز است، نه `molido_app`.
--    و استفاده از نقشِ مدیر روی یک مسیرِ عمومی یعنی باز کردنِ همهٔ
--    جدول‌ها برای هر بازدیدکننده.
--
--    سیاست‌های RLS با هم OR می‌شوند، پس این یکی راهِ دومی می‌سازد که
--    دامنه‌اش **یک سطر** است: همان که کدِ رهگیری‌اش دقیقاً برابر
--    `app.track_code` باشد.  `company_isolation` دست‌نخورده می‌ماند.
--
-- ⚠️ فقط `SELECT`.
--
--    شهروند باید بتواند ببیند، نه تغییر دهد.  `FOR ALL` نوشتن یعنی
--    هر کسی با کدِ رهگیری می‌توانست وضعیتِ شکایتش را خودش «رفع‌شده»
--    کند.
--
-- ⚠️ این سیاست تنها وقتی بی‌خطر است که کد حدس‌ناپذیر باشد.
--
--    قید یکتایی `(companyId, trackingNo)` است نه سراسری، و کدِ قبلی
--    `137-<زمان>` بود — کاملاً قابلِ شمردن.  همان تغییر در
--    `complaints.service.ts` کد را تصادفی کرد؛ بدونِ آن، این سیاست
--    درِ خواندنِ شکایاتِ همه را باز می‌کرد.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'CitizenComplaint') THEN
    DROP POLICY IF EXISTS complaint_public_track ON "CitizenComplaint";

    CREATE POLICY complaint_public_track ON "CitizenComplaint"
      FOR SELECT
      TO molido_app
      USING ("trackingNo" = NULLIF(current_setting('app.track_code', true), ''));

    RAISE NOTICE 'complaint_public_track policy created';
  END IF;
END $$;
