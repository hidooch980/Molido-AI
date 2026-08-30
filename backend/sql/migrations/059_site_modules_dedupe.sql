-- برداشتنِ ماژول‌های تکراریِ سایت.
--
-- ⚠️ این مهاجرت اشتباهِ مهاجرتِ قبلی را جمع می‌کند.
--
--    ۰۵۸ کاتالوگ را با اسلاگ‌های خودش درج کرد، در حالی که کاتالوگِ
--    تولید پیش‌تر با اسلاگ‌های دیگری دستی ساخته شده بود.  `ON CONFLICT
--    (companyId, slug) DO NOTHING` فقط برخوردِ **اسلاگ** را می‌گیرد، نه
--    برخوردِ معنا: `inventory` و `warehouse` هر دو «انبار و خرید» بودند
--    و هر دو ماندند — با دو قیمتِ متفاوت، روی صفحهٔ فروشِ زنده.
--
--    یعنی مشتری می‌توانست یک ماژول را دو بار، به دو نرخ، بخرد.
--
-- ⚠️ ملاکِ تکرار **عنوان** است، نه اسلاگ.
--
--    اسلاگ شناسهٔ فنی است و همان چیزی بود که تشخیص را از دست داد.
--    چیزی که مشتری می‌بیند و بر پایه‌اش تصمیم می‌گیرد، عنوان است.
--
-- ⚠️ ردیفی که خریدی به آن خورده حذف **نمی‌شود**، غیرفعال می‌شود.
--
--    `SitePurchase.items` عکسِ لحظهٔ خرید است و به `SiteModule` کلید
--    خارجی ندارد، پس حذف چیزی را نمی‌شکند — ولی سابقهٔ قیمت را از
--    پنل پاک می‌کند.  نگه داشتنِ ردیفِ غیرفعال هم تکرار را از صفحهٔ
--    فروش برمی‌دارد و هم سابقه را حفظ می‌کند.

DO $$
DECLARE
  dup record;
  used boolean;
BEGIN
  -- نگه‌داشته‌شده: کم‌ترین `sortOrder` (یعنی همان که سرِ جای خودش در
  -- کاتالوگ نشسته).  تازه‌واردهای ۰۵۸ ترتیبِ ۱۰ به بالا گرفتند.
  FOR dup IN
    SELECT m.id, m.slug, m.title, m."companyId"
      FROM "SiteModule" m
     WHERE EXISTS (
       SELECT 1 FROM "SiteModule" k
        WHERE k."companyId" = m."companyId"
          AND k.title       = m.title
          AND k.id         <> m.id
          AND (k."sortOrder", k.id) < (m."sortOrder", m.id)
     )
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM "SitePurchase" p
       WHERE p."companyId" = dup."companyId"
         AND p.items @> jsonb_build_array(jsonb_build_object('slug', dup.slug))
    ) INTO used;

    IF used THEN
      UPDATE "SiteModule" SET "isActive" = false, "updatedAt" = now() WHERE id = dup.id;
      RAISE NOTICE 'ماژول تکراری غیرفعال شد (خرید دارد): % / %', dup.slug, dup.title;
    ELSE
      DELETE FROM "SiteModule" WHERE id = dup.id;
      RAISE NOTICE 'ماژول تکراری حذف شد: % / %', dup.slug, dup.title;
    END IF;
  END LOOP;
END $$;
