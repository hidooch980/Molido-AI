#!/usr/bin/env bash
#
# کدینگ حساب باید با قواعد سند بخواند.
#
# چرا این آزمون وجود دارد: هفت حساب (۱۲۰۲، ۲۱۰۶، ۲۱۰۷، ۴۱۰۵، ۴۱۰۶،
# ۵۲۰۵، ۵۲۰۶) فقط با `INSERT ... FROM "Company"` در مهاجرت اضافه
# می‌شدند.  روی نصب تازه مهاجرت پیش از ساخت شرکت اجرا می‌شود، پس آن
# INSERT صفر ردیف می‌ساخت و کرایهٔ حمل، پورسانت، استهلاک و اضافات فاکتور
# همگی با «حساب یافت نشد» می‌شکستند — ولی روی دیتابیس توسعه، که شرکتش
# از قبل بود، همه‌چیز سبز بود.
#
# این آزمون همان شکاف را می‌بندد: هر کدی که در posting-rules استفاده
# می‌شود باید در دیتابیس وجود داشته باشد و قابل سند خوردن باشد.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

echo '--- 1) هر کد به‌کاررفته در قواعد سند موجود است ---'
CODES=$(grep -oE "'[0-9]{4}'" backend/src/accounting/posting-rules.ts | tr -d "'" | sort -u)
missing=""
for code in $CODES; do
  n=$(Q "SELECT count(*) FROM \"Account\" WHERE code = '$code'")
  [ "${n:-0}" -ge 1 ] || missing="$missing $code"
done
chk "حساب گمشده ندارد" "${missing:-هیچ}" "هیچ"

echo '--- 2) هر حسابِ سندخور قابل درج است ---'
# حساب غیرقابل‌سند (والد) نباید در قواعد سند بیاید؛ اگر بیاید، سند در
# لحظهٔ ثبت رد می‌شود نه در زمان توسعه.
notpostable=""
for code in $CODES; do
  n=$(Q "SELECT count(*) FROM \"Account\" WHERE code = '$code' AND \"isPostable\" = false")
  [ "${n:-0}" -eq 0 ] || notpostable="$notpostable $code"
done
chk "حساب غیرقابل‌سند در قواعد نیست" "${notpostable:-هیچ}" "هیچ"

echo '--- 3) کد تکراری در یک شرکت نیست ---'
chk "کد یکتاست" "$(Q "SELECT count(*) FROM (SELECT \"companyId\", code FROM \"Account\" GROUP BY 1,2 HAVING count(*) > 1) x")" "0"

echo '--- 4) هر حساب والدِ معتبر دارد ---'
chk "والد آویزان نیست" \
  "$(Q "SELECT count(*) FROM \"Account\" a WHERE a.\"parentId\" IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM \"Account\" p WHERE p.id = a.\"parentId\")")" "0"

echo '--- 5) کدینگ seed و قواعد سند هم‌گام‌اند ---'
# اگر کسی کدی به posting-rules اضافه کند و به seed نه، نصب بعدی
# می‌شکند.  اینجا فایل seed مستقیم خوانده می‌شود، نه دیتابیس — تا
# شکاف پیش از نصب معلوم شود.
SEED_MISSING=""
for code in $CODES; do
  grep -q "code: '$code'" backend/src/database/seed.ts || SEED_MISSING="$SEED_MISSING $code"
done
chk "همهٔ کدها در seed هستند" "${SEED_MISSING:-هیچ}" "هیچ"

echo '--- 6) دام «درج وابسته به شرکت» در مهاجرت‌ها ---'
# ریشهٔ همهٔ این خطاها یک الگو بود: مهاجرت دادهٔ پایه را با
# `INSERT ... FROM "Company"` می‌ساخت.  روی نصب موجود کار می‌کند، روی نصب
# تازه صفر ردیف — چون مهاجرت پیش از ساخت شرکت اجرا می‌شود.
#
# این بررسی فقط هشدار می‌دهد: الگو ذاتاً غلط نیست (برای نصب‌های موجود
# لازم است)، ولی هر موردش باید معادلی در seed داشته باشد.
TABLES=$(grep -A 4 'INSERT INTO' backend/sql/migrations/*.sql \
  | grep -B 4 'FROM "Company"' \
  | grep -oE 'INSERT INTO "[A-Za-z]+"' | grep -oE '"[A-Za-z]+"' | tr -d '"' | sort -u)
uncovered=""
for tbl in $TABLES; do
  grep -q "\"$tbl\"" backend/src/database/seed.ts || uncovered="$uncovered $tbl"
done
chk "هر جدولِ چنین درجی در seed هم هست" "${uncovered:-هیچ}" "هیچ"

echo '--- 7) دادهٔ پایه‌ای که نصب تازه باید داشته باشد ---'
chk "سطح قیمت پیش‌فرض دارد" \
  "$(Q "SELECT count(*) FROM \"PriceLevel\" WHERE \"isDefault\" = true")" "1"
chk "انبار دارد"  "$(Q "SELECT CASE WHEN count(*) > 0 THEN 'yes' ELSE 'no' END FROM \"Warehouse\"")" "yes"
chk "صندوق دارد"  "$(Q "SELECT CASE WHEN count(*) > 0 THEN 'yes' ELSE 'no' END FROM \"CashBox\"")" "yes"
chk "سال مالی باز دارد" \
  "$(Q "SELECT CASE WHEN count(*) > 0 THEN 'yes' ELSE 'no' END FROM \"FiscalYear\" WHERE status <> 'CLOSED'")" "yes"

echo '--- 8) تراز دفتر ---'
chk "تراز صفر است" \
  "$(Q "SELECT COALESCE(SUM(l.debit) - SUM(l.credit), 0)::bigint
        FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id = l.\"entryId\"
        WHERE e.status <> 'DRAFT'")" "0"

printf '\n   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
