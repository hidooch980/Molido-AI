-- دریافت وجه عمومی (Receipt)
--
-- تا پیش از این، هر زیرسیستم درآمدی خودش وضعیت را «پرداخت‌شده» می‌کرد و پول
-- هیچ‌جا ثبت نمی‌شد؛ درآمد شهرداری در حسابداری دیده نمی‌شد.  این جدول نقطهٔ
-- واحد ثبت دریافت وجه برای همهٔ زیرسیستم‌هاست: عوارض، جواز کسب، پارکینگ،
-- آرامستان، جریمهٔ تاکسی و هر مورد آینده.
--
-- entityType/entityId عمداً بدون کلید خارجی است تا هر زیرسیستمی بتواند بدون
-- تغییر این جدول به آن وصل شود؛ اعتبارسنجی وجود رکورد در لایهٔ سرویس است.

CREATE TABLE IF NOT EXISTS "Receipt" (
  id TEXT PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "receiptNo" TEXT NOT NULL UNIQUE,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'CASH',
  "cashBoxId" TEXT,
  "treasuryAccountId" TEXT,
  "payerName" TEXT,
  reference TEXT,
  note TEXT,
  "paidAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"(id) ON DELETE CASCADE;

ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_cashBoxId_fkey"
  FOREIGN KEY ("cashBoxId") REFERENCES "CashBox"(id) ON DELETE SET NULL;

ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_treasuryAccountId_fkey"
  FOREIGN KEY ("treasuryAccountId") REFERENCES "TreasuryAccount"(id) ON DELETE SET NULL;

-- پول یا به صندوق می‌رود یا به حساب خزانه — نه هر دو، نه هیچ‌کدام.
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_single_destination"
  CHECK (("cashBoxId" IS NULL) <> ("treasuryAccountId" IS NULL));

ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_amount_positive"
  CHECK (amount > 0);

-- هر رکورد فقط یک‌بار قابل وصول است؛ این قید پرداخت دوبارهٔ یک فیش را
-- در سطح دیتابیس می‌بندد، نه فقط در کد.
CREATE UNIQUE INDEX IF NOT EXISTS "Receipt_entity_key"
  ON "Receipt" ("entityType", "entityId");

CREATE INDEX IF NOT EXISTS "Receipt_companyId_paidAt_idx"
  ON "Receipt" ("companyId", "paidAt" DESC);

CREATE INDEX IF NOT EXISTS "Receipt_cashBoxId_idx" ON "Receipt" ("cashBoxId");
CREATE INDEX IF NOT EXISTS "Receipt_treasuryAccountId_idx"
  ON "Receipt" ("treasuryAccountId");
