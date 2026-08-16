#!/usr/bin/env bash
#
# سه ایرادی که حسابرسی خصمانه پیدا کرد.
#
# هر سه کلاسِ «بی‌صدا»‌اند: نه خطا می‌دهند، نه به چشم می‌آیند، و فقط
# وقتی معلوم می‌شوند که دیر شده — در تراز آخر شب، در گزارش ماه، یا در
# صورتحساب سازمان مالیاتی.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@molido.ai\",\"password\":\"$PW\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق"
  exit 1
fi
AU="Authorization: Bearer $T"; JS="Content-Type: application/json"
P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except ValueError:
    # پاسخ JSON نبود: خالی، ۴۲۹ بی‌بدنه، یا اتصال قطع‌شده.  بدون این
    # برچسب، خروجیِ خالی در گزارش شبیه اشکال منطقی به نظر می‌رسید.
    print('<<پاسخ-JSON-نبود:%r>>' % raw[:60]); sys.exit(0)
print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql()  { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

WH=$(curl -s $A/warehouses -H "$AU" | P "d[0]['id'] if isinstance(d,list) else d['data'][0]['id']")

psql "DELETE FROM \"Product\" WHERE sku = 'AUDIT-P';"
PROD=$(curl -s -X POST $A/products -H "$AU" -H "$JS" -d '{
  "name":"Audit Item","sku":"AUDIT-P","unit":"pcs",
  "salePrice":50000,"purchasePrice":30000}' | P "d.get('id','')")
psql "UPDATE \"Product\" SET \"trackInventory\" = false WHERE id = '$PROD';"

echo '--- 1) جمع فروش شیفت، فاکتورهای هم‌مبلغ را جدا می‌شمارد ---'
#
# `sum(DISTINCT s.total)` دو فاکتور ۵۰٬۰۰۰ تومانی را ۵۰٬۰۰۰ می‌شمرد.
# صندوق‌دار آخر شب کسری می‌دید که وجود نداشت — و چون فقط وقتی رخ می‌دهد
# که دو فاکتور **دقیقاً** هم‌مبلغ باشند، تصادفی و غیرقابل بازتولید
# به نظر می‌رسید.

CB=$(curl -s $A/cashbox -H "$AU" | P "(d[0] if isinstance(d,list) else d['data'][0])['id']")
# شیفتِ خالص لازم است تا جمع فروش با عدد ثابت مقایسه شود.
#
# بستنِ شیفت قبلی ممکن است شکست بخورد (شمارش نقد لازم دارد)، و آن‌وقت
# باز کردن هم شکست می‌خورد و `$SH` خالی می‌ماند — که آزمون را با پیامی
# می‌شکند که ربطی به موضوعش ندارد.  پس مستقیم در دیتابیس بسته می‌شود.
psql "UPDATE \"CashierShift\" SET \"endedAt\" = now()
       WHERE \"companyId\" = 'seed-company' AND \"endedAt\" IS NULL;"

SH=$(curl -s -X POST $A/retail/shifts/open -H "$AU" -H "$JS" \
  -d "{\"cashBoxId\":\"$CB\",\"openingFloat\":0}" | P "d.get('id','')")
if [ -z "$SH" ]; then
  echo "  ✗ باز کردن شیفت ناموفق — بقیهٔ آزمون بی‌معناست"
  exit 1
fi

# دو فروش با مبلغ **دقیقاً یکسان**
for i in 1 2; do
  curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
    \"warehouseId\":\"$WH\",
    \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}],
    \"paidAmount\":50000,\"paymentMethod\":\"CASH\",\"cashBoxId\":\"$CB\"}" >/dev/null
done

# خلاصهٔ زنده زیر کلید `live` است؛ ستون‌های ریشه فقط پس از بستن شیفت
# پر می‌شوند.  خواندن از ریشه همیشه صفر می‌دهد — و صفرِ همیشگی، آزمونی
# می‌سازد که هیچ‌وقت چیزی را نمی‌سنجد.
LIVE=$(curl -s "$A/retail/shifts/$SH" -H "$AU")
chk "جمع فروش با دیتابیس می‌خواند" \
  "$(echo "$LIVE" | P "int(float(d['live']['salesTotal']))")" \
  "$(psqlv "SELECT COALESCE(sum(total),0)::bigint FROM \"Sale\"
             WHERE \"shiftId\" = '$SH' AND status IN ('PAID','PARTIAL')")"
# آزمون اصلی: دو فاکتور **دقیقاً هم‌مبلغ** باید دو بار شمرده شوند.
# `sum(DISTINCT)` آن‌ها را یکی می‌شمرد و صندوق‌دار کسری می‌دید.
chk "دو فاکتور ۵۰٬۰۰۰ = ۱۰۰٬۰۰۰" \
  "$(echo "$LIVE" | P "int(float(d['live']['salesTotal']))")" "100000"
chk "تعداد فاکتور شیفت" \
  "$(echo "$LIVE" | P "int(d['live']['salesCount'])")" "2"

echo '--- 2) نقشهٔ ستون‌ها با دیتابیس می‌خواند ---'
#
# ستونی که در نقشه باشد ولی در دیتابیس نه، هر نوشتنی را که به آن برسد
# با «column does not exist» می‌شکند — و چون فقط در مسیرهای کم‌استفاده
# رخ می‌دهد، ماه‌ها پنهان می‌ماند.
MISMATCH=$(psqlv "
  WITH mapped AS (SELECT unnest(ARRAY['id','companyId','firstName','lastName','phone',
    'email','nationalCode','address','creditLimit','isActive','createdAt','updatedAt',
    'salesAgentId','passwordHash','priceLevelId','smsOptOut','smsOptOutAt']) AS col)
  SELECT COALESCE(string_agg(m.col, ','), 'none')
    FROM mapped m
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns c
      WHERE c.table_name = 'Customer' AND c.column_name = m.col)")
chk "ستون ناموجود در نقشهٔ Customer" "$MISMATCH" "none"

echo '--- 3) فاکتور لغوشده به سامانهٔ مؤدیان نمی‌رود ---'
#
# ارسال به مؤدیان برگشت‌ناپذیر است.  صورتحسابی که رفت باید با صورتحساب
# ابطال خنثی شود — و اگر فراموش شود، فروشگاه بابت فروشی که انجام نشده
# مالیات بدهکار می‌ماند.
SALE=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":1}]}")
SID=$(echo "$SALE" | P "d.get('id','')")

# در صف مالیاتی بگذار، بعد فاکتور را لغو کن
psql "INSERT INTO \"TaxInvoice\" (id, \"companyId\", \"saleId\", \"taxId\", status, payload)
      SELECT 'audit-tax-1', \"companyId\", '$SID', 'AUDITTAXID0000000001', 'QUEUED', '{}'::jsonb
        FROM \"Sale\" WHERE id = '$SID'
      ON CONFLICT (id) DO NOTHING;"
curl -s -X PATCH "$A/sales/$SID/cancel" -H "$AU" -H "$JS" -d '{}' >/dev/null 2>&1
psql "UPDATE \"Sale\" SET status = 'CANCELLED' WHERE id = '$SID';"

QUEUED=$(psqlv "
  SELECT count(*) FROM \"TaxInvoice\" t
    JOIN \"Sale\" s ON s.id = t.\"saleId\"
   WHERE t.id = 'audit-tax-1'
     AND t.status = 'QUEUED'
     AND s.status NOT IN ('CANCELLED', 'RETURNED')")
chk "فاکتور لغوشده از صف ارسال بیرون است" "$QUEUED" "0"

# و همچنان در جدول هست — حذف نمی‌شود، فقط ارسال نمی‌شود.  سابقه‌اش
# برای پیگیری لازم است.
chk "رکورد صف حذف نشد" \
  "$(psqlv "SELECT count(*) FROM \"TaxInvoice\" WHERE id = 'audit-tax-1'")" "1"

echo '--- قیدهای یکتا در محدودهٔ شرکت ---'
# چهل جدولِ چندمستأجری قید یکتای تک‌ستونی داشتند: شرکتی که قرارداد
# «۱۰۰۱» می‌ساخت، همان شماره را برای همهٔ شرکت‌های دیگر می‌بست.  بدتر
# اینکه پیام خطا («شماره قرارداد تکراری است») دربارهٔ رکوردی بود که
# کاربر حق دیدنش را نداشت — یعنی خودش نشت اطلاعات بود.
#
# این سنجه نه فهرست جدول‌ها که خودِ شرط را می‌سنجد، پس جدول تازه‌ای که
# فردا با همین اشتباه اضافه شود هم گرفته می‌شود.
chk "هیچ قید یکتای سراسری روی جدول چندمستأجری نمانده"   "$(psqlv "SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
            WHERE c.contype='u'
              AND pg_get_constraintdef(c.oid) NOT LIKE '%companyId%'
              AND EXISTS (SELECT 1 FROM information_schema.columns col
                          WHERE col.table_name=t.relname AND col.column_name='companyId')")" "0"

# و قید درست سرِ جایش هست — «صفر قید سراسری» به‌تنهایی با حذف کردن همهٔ
# قیدها هم برآورده می‌شود.
chk "قرارداد قید (companyId, contractNo) دارد"   "$(psqlv "SELECT count(*) FROM pg_constraint
            WHERE conname = 'Contract_companyId_contractNo_key'")" "1"
chk "کارمند قید (companyId, employeeNo) دارد"   "$(psqlv "SELECT count(*) FROM pg_constraint
            WHERE conname = 'Employee_companyId_employeeNo_key'")" "1"

# پاک‌سازی
psql "DELETE FROM \"TaxInvoice\" WHERE id = 'audit-tax-1';
      DELETE FROM \"Product\" WHERE sku = 'AUDIT-P';"
curl -s -X POST $A/retail/shifts/close -H "$AU" -H "$JS" -d '{}' >/dev/null 2>&1

printf '\n   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
