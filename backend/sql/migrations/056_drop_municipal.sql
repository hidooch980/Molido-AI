-- حذفِ کاملِ ماژول‌های شهرداری، صنفی و عملیات.
--
-- ⚠️ به درخواستِ صریحِ صاحبِ محصول: سه گروهِ قابلیت کاملاً برداشته
--    شدند — municipal (۱۵ ماژول)، verticals (۵) و operations (۷).
--
-- ⚠️ فهرست با **بستارِ وابستگی** ساخته شد، نه با شمردنِ دستی.
--
--    شمارشِ دستیِ من ۳۳ جدول داد.  پرس‌وجوی بازگشتی روی
--    pg_constraint نشان داد ۵۳ تاست: بیست جدولِ فرزند
--    (ApprovalStep، Grave، ParkingSession، SensorReading و …) در
--    فهرستِ دستی نبودند و جا ماندنشان یعنی جدولِ یتیمی که هیچ کدی
--    صدایش نمی‌زند.
--
-- ⚠️ پیش از نوشتنِ این فایل، روی سرورِ تولید سنجیده شد:
--
--    ۱. هر ۵۳ جدول **صفر سطر** دارند — پس دادهٔ کسی از بین نمی‌رود.
--    ۲. هیچ جدولِ ماندگاری کلیدِ خارجی به آن‌ها ندارد — پس حذفشان
--       چیزی را نمی‌شکند.
--
--    اگر یکی از این دو برقرار نبود، این مهاجرت نوشته نمی‌شد.
--
-- ⚠️ مهاجرت‌های قدیمی دست‌نخورده ماندند.
--
--    وسوسه‌اش بود که ۰۱۸ و ۰۲۵ و … ویرایش شوند تا این جدول‌ها اصلاً
--    ساخته نشوند.  ولی مهاجرت تاریخ است: نصبی که آن‌ها را اجرا کرده،
--    با ویرایششان از تاریخِ خودش جدا می‌افتد.  ساختن و بعد حذف کردن،
--    روی هر نصبی یکسان عمل می‌کند.
--
-- ⚠️ CASCADE عمدی است.
--
--    نماها و کلیدهای خارجیِ داخلیِ همین مجموعه باید با هم بروند.
--    چون فهرست بستارِ کامل است، CASCADE چیزی بیرونِ آن نمی‌برد.

DO $$
DECLARE
  doomed text[] := ARRAY[
  -- ⚠️ تک‌گیومه، نه دابل‌کوت.
  --
  --    نسخهٔ اول این فهرست را با دابل‌کوت نوشت.  در SQL دابل‌کوت
  --    **شناسه** است نه رشته، پس پستگرس دنبالِ ستونی به نام
  --    `BusinessLicense` گشت و در مقداردهیِ آرایه شکست.
  --
  --    `format('%I', name)` پایین‌تر خودش نقل‌قولِ شناسه را می‌گذارد؛
  --    اینجا فقط متن لازم است.
  'Appointment',
  'ApprovalRequest',
  'ApprovalStep',
  'BuildingPermit',
  'BuildingViolation',
  'BurialPermit',
  'BusinessLicense',
  'CctvCamera',
  'CctvReport',
  'Cemetery',
  'CitizenComplaint',
  'CityServiceRequest',
  'ClinicRecord',
  'ConstructionProject',
  'CouncilDecision',
  'CouncilMeeting',
  'CrisisAction',
  'CrisisEvent',
  'Document',
  'DocumentFolder',
  'FireFighter',
  'FireIncident',
  'FireStation',
  'FireVehicle',
  'FleetFuelLog',
  'FleetService',
  'FleetVehicle',
  'Grave',
  'GuildInspection',
  'HelpTicket',
  'IotSensor',
  'Letter',
  'MunicipalBill',
  'MunicipalProperty',
  'ParkingLot',
  'ParkingSession',
  'Project',
  'ProjectTask',
  'PropertyAudit',
  'SafetyInspection',
  'SensorAlert',
  'SensorReading',
  'ServiceZone',
  'StreetLight',
  'StreetLightReport',
  'TaxiDriver',
  'TaxiViolation',
  'TechnicalInspection',
  'TimeEntry',
  'UtilityBill',
  'UtilityMeter',
  'UtilityReading',
  'ZoneWorkLog'
  ];
  name text;
BEGIN
  FOREACH name IN ARRAY doomed LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', name);
  END LOOP;
  RAISE NOTICE 'حذف شد: % جدول', array_length(doomed, 1);
END $$;
