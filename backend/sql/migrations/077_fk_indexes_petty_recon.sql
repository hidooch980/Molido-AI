-- نمایهٔ کلیدهای خارجیِ تنخواه و مغایرت‌گیری.
--
-- ⚠️ نگهبانِ `ledger-health` این را گرفت، نه من.
--
--    در مهاجرت‌های ۰۷۵ و ۰۷۶ نمایهٔ کلیدهای اصلی را گذاشتم و شش کلیدِ
--    خارجیِ دیگر را جا انداختم.  پستگرس برای کلیدِ خارجی نمایهٔ خودکار
--    نمی‌سازد؛ بدونِ نمایه، هر `DELETE` روی جدولِ والد باید کلِ جدولِ
--    فرزند را بپیماید تا مطمئن شود ارجاعی نمانده.
--
--    روی جدولِ خالی دیده نمی‌شود.  دو سال بعد، حذفِ یک کاربر چند ثانیه
--    طول می‌کشد و هیچ‌کس آن را به این‌جا ربط نمی‌دهد.
--
--    مهاجرتِ جدا لازم است چون ۰۷۵ و ۰۷۶ در `schema_migrations` ثبت
--    شده‌اند و دیگر اجرا نمی‌شوند — ویرایششان روی نصبِ موجود بی‌اثر است.

CREATE INDEX IF NOT EXISTS "PettyCash_custodian_idx"
  ON "PettyCash" ("custodianId");

CREATE INDEX IF NOT EXISTS "PettyCashTransaction_entry_idx"
  ON "PettyCashTransaction" ("entryId");

CREATE INDEX IF NOT EXISTS "PettyCashTransaction_user_idx"
  ON "PettyCashTransaction" ("userId");

CREATE INDEX IF NOT EXISTS "BankReconciliation_company_idx"
  ON "BankReconciliation" ("companyId");

CREATE INDEX IF NOT EXISTS "BankReconciliation_completedBy_idx"
  ON "BankReconciliation" ("completedBy");

CREATE INDEX IF NOT EXISTS "BankStatementLine_company_idx"
  ON "BankStatementLine" ("companyId");
