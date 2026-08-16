-- =============================================
-- `HUMAN` به منبع‌های مجاز اضافه می‌شود
--
-- مهاجرت ۰۳۷ چهار منبع داشت و یکی کم بود: متنی که **یک آدم تایپ کرده**.
--
-- این مهم‌ترینشان است.  کل مشکل این بود که هیچ‌کس بلوچی را تأیید
-- نکرده؛ و لحظه‌ای که بلوچ‌زبانی در `/voice` متنی را بنویسد یا اصلاح
-- کند، همان تأیید است — دقیقاً همان چیزی که کم بود.
--
-- `source` عمداً از API قابل تنظیم نیست.  فقط دو مسیر مقدارش را
-- می‌نویسند:
--
--   `setTarget`         → HUMAN      (آدم در صفحهٔ بازبینی نوشت)
--   `importDictionary`  → منبعِ اعلام‌شدهٔ همان فایل
--
-- اگر `source` پارامتر می‌گرفت، هر کسی می‌توانست حدس را «تأییدشده»
-- علامت بزند و قفلِ آموزش را دور بزند.  ستونی که هر کسی دلخواه پرش
-- کند محافظت نیست، پوششِ اطمینانِ کاذب است.
-- =============================================

ALTER TABLE "VoicePhrase"
  DROP CONSTRAINT IF EXISTS "VoicePhrase_source_check";

ALTER TABLE "VoicePhrase"
  ADD CONSTRAINT "VoicePhrase_source_check"
  CHECK (source = ANY (ARRAY['GATITOS', 'HUMAN', 'LOANWORD', 'DERIVED', 'UNVERIFIED']));

COMMENT ON COLUMN "VoicePhrase".source IS
  'منبع متن: HUMAN (آدم نوشت) · GATITOS (ترجمهٔ حرفه‌ای) · LOANWORD (عمداً فارسی) · DERIVED (از اجزای تأییدشده) · UNVERIFIED (حدس — آموزش قفل)';
