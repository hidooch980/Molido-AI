#!/usr/bin/env bash
#
# نوشتنِ آفلاین برای فاکتور خرید: ثبت+دریافت در یک درخواست، و
# یکتاسازی که تلاشِ دوبارهٔ صف را بی‌اثر می‌کند.
#
# ⚠️ چرا این آزمون از همه مهم‌تر است؟
#
#    انباردار در انبارِ بی‌آنتن ثبت می‌کند و درخواست در صفِ مرورگر
#    می‌نشیند.  اگر پاسخ در راهِ برگشت گم شود، صف دوباره می‌فرستد —
#    و بدونِ یکتاسازی نتیجه **دو فاکتور، دو برابر موجودی و دو سندِ
#    حسابداری** است.
#
#    این خطا خودش را نشان نمی‌دهد.  انبارگردانیِ ماهِ بعد اختلاف را
#    می‌بیند ولی هیچ‌کس نمی‌فهمد از کجا آمده.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

# توکن مشترک: اگر `run-tests.sh` یک بار وارد شده باشد، دوباره وارد
# نمی‌شویم.  سقف ورود عمداً سخت است (جلوی حدس رمز را می‌گیرد)، و ورودِ
# جداگانه در هر مجموعه همان سقف را می‌خورد، توکن خالی برمی‌گردد، و
# مجموعه با شکست‌هایی می‌افتد که هیچ ربطی به کد ندارند.
T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json'   -d '{"email":"admin@molido.ai","password":"'"$PW"'"}'   | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  # پیام قبلی همیشه «سقف ورود» را متهم می‌کرد — ولی رمزِ غلط، سرویسِ
  # خاموش و سقفِ ورود سه چیز متفاوت‌اند و سه راه‌حل متفاوت دارند.
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST $A/auth/login     -H 'Content-Type: application/json' -d '{"email":"admin@molido.ai","password":"'"$PW"'"}')
  case "$code" in
    000) echo "  ✗ ورود ناموفق — سرویس روی $A پاسخ نمی‌دهد" ;;
    401) echo "  ✗ ورود ناموفق — رمز نادرست است (MOLIDO_ADMIN_PASSWORD را بده)" ;;
    429) echo "  ✗ ورود ناموفق — سقف ورود خورده؛ چند دقیقه صبر کن" ;;
    *)   echo "  ✗ ورود ناموفق — پاسخ $code از $A/auth/login" ;;
  esac
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
    # برچسب باید بی‌گیومه و بی‌بک‌اسلش باشد: این مقدار در عبارتِ
    # پایتونِ سنجهٔ بعدی جاگذاری می‌شود و اگر گیومه داشته باشد نحو
    # را می‌شکند — یعنی برچسبِ تشخیصی، خودش شکست تازه می‌سازد.
    bad = chr(39) + chr(34) + chr(92)
    safe = ''.join(c for c in raw[:40] if c.isprintable() and c not in bad)
    print('<<پاسخ-JSON-نبود: %d نویسه: %s>>' % (len(raw), safe)); sys.exit(0)
print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -t -c "$1" | tr -d ' \r\n'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }


SUP=$(curl -s "$A/suppliers" -H "$AU" | P "d[0]['id']")
WH=$(curl -s "$A/warehouses" -H "$AU" | P "d[0]['id']")
KEY="offline-test-$$-$(date +%s)"

# موجودیِ کالا پیش از شروع — همهٔ سنجه‌ها نسبت به همین سنجیده می‌شوند.
# ⚠️ `::int` لازم است: ستون numeric است و «5.00» برمی‌گرداند، که در
#    مقایسهٔ متنی با «5» شکستِ دروغین می‌سازد.
before() { Q "SELECT COALESCE(SUM(quantity),0)::int FROM \"Inventory\" WHERE \"productId\"='seed-p3';"; }
Q0=$(before)

body() {
  printf '{"supplierId":"%s","warehouseId":"%s","receive":true,"idempotencyKey":"%s",
    "items":[{"productId":"seed-p3","quantity":5,"purchasePrice":10000}]}' "$SUP" "$WH" "$1"
}

echo '--- ۱) ثبت و دریافت در یک درخواست ---'
#
# ⚠️ بدونِ این، صفِ آفلاین اصلاً کار نمی‌کند: مسیرِ عادی دو درخواست
#    است و درخواستِ دوم به شناسه‌ای نیاز دارد که هنوز وجود ندارد.
R1=$(curl -s -X POST $A/purchases -H "$AU" -H "$JS" -d "$(body "$KEY")")
PID=$(echo "$R1" | P "d.get('id','')")
chk "فاکتور ساخته شد" "$([ -n "$PID" ] && echo yes || echo no)" "yes"
chk "وضعیت RECEIVED است" "$(echo "$R1" | P "d.get('status','')")" "RECEIVED"
chk "موجودی ۵ تا بالا رفت" "$(Q "SELECT (COALESCE(SUM(quantity),0)-$Q0)::int FROM \"Inventory\" WHERE \"productId\"='seed-p3';")" "5"
chk "سندِ حسابداری خورد" \
  "$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='Purchase' AND \"sourceId\"='$PID';")" "1"

echo '--- ۲) تلاشِ دوباره با همان کلید، فاکتورِ دوم نمی‌سازد ---'
#
# ⚠️ قلبِ این آزمون.  صف دقیقاً همین کار را می‌کند وقتی پاسخ گم شود.
R2=$(curl -s -X POST $A/purchases -H "$AU" -H "$JS" -d "$(body "$KEY")")
chk "همان شناسه برگشت" "$(echo "$R2" | P "d.get('id','')")" "$PID"
chk "فاکتورِ دوم ساخته نشد" \
  "$(Q "SELECT count(*) FROM \"Purchase\" WHERE id='$PID';")" "1"
chk "موجودی دوباره بالا نرفت" \
  "$(Q "SELECT (COALESCE(SUM(quantity),0)-$Q0)::int FROM \"Inventory\" WHERE \"productId\"='seed-p3';")" "5"
chk "سندِ حسابداریِ دوم نخورد" \
  "$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='Purchase' AND \"sourceId\"='$PID';")" "1"

echo '--- ۳) کلیدِ متفاوت، فاکتورِ تازه می‌سازد ---'
# یکتاسازی نباید ثبتِ خریدهای واقعیِ بعدی را ببندد.
R3=$(curl -s -X POST $A/purchases -H "$AU" -H "$JS" -d "$(body "${KEY}-b")")
PID3=$(echo "$R3" | P "d.get('id','')")
chk "شناسهٔ تازه" "$([ -n "$PID3" ] && [ "$PID3" != "$PID" ] && echo yes || echo no)" "yes"
chk "موجودی ۱۰ شد" "$(Q "SELECT (COALESCE(SUM(quantity),0)-$Q0)::int FROM \"Inventory\" WHERE \"productId\"='seed-p3';")" "10"

echo '--- ۴) بدونِ کلید، رفتارِ قبلی دست‌نخورده است ---'
# مسیرِ آنلاینِ موجود نباید عوض شده باشد.
R4=$(curl -s -X POST $A/purchases -H "$AU" -H "$JS" -d "{\"supplierId\":\"$SUP\",\"warehouseId\":\"$WH\",
  \"items\":[{\"productId\":\"seed-p3\",\"quantity\":1,\"purchasePrice\":10000}]}")
PID4=$(echo "$R4" | P "d.get('id','')")
chk "ساخته شد" "$([ -n "$PID4" ] && echo yes || echo no)" "yes"
chk "وضعیت PENDING مانده" "$(echo "$R4" | P "d.get('status','')")" "PENDING"
chk "موجودی عوض نشد" "$(Q "SELECT (COALESCE(SUM(quantity),0)-$Q0)::int FROM \"Inventory\" WHERE \"productId\"='seed-p3';")" "10"

echo '--- ۵) کلیدِ ناموفق آزاد می‌شود ---'
#
# ⚠️ وگرنه فاکتوری که به‌خاطر خطای گذرا نشست، برای همیشه با همان
#    کلید قابلِ ثبت نبود و صف تا ابد گیر می‌کرد.
BAD="fail-$$-$(date +%s)"
curl -s -o /dev/null -X POST $A/purchases -H "$AU" -H "$JS" \
  -d "{\"supplierId\":\"does-not-exist\",\"warehouseId\":\"$WH\",\"idempotencyKey\":\"$BAD\",
      \"items\":[{\"productId\":\"seed-p3\",\"quantity\":1,\"purchasePrice\":100}]}"
chk "کلیدِ ناموفق پاک شد" \
  "$(Q "SELECT count(*) FROM \"IdempotencyKey\" WHERE key='$BAD';")" "0"

echo '--- ۶) کلید بینِ شرکت‌ها نشت نمی‌کند ---'
#
# ⚠️ بدونِ `companyId` در قیدِ یکتایی، شرکتِ دیگر با حدسِ کلید پاسخِ
#    فاکتورِ ما را می‌گرفت — یعنی نشتِ داده از راهِ کلیدِ تکراری.
chk "قیدِ یکتایی شاملِ شرکت است" \
  "$(Q "SELECT count(*) FROM pg_indexes WHERE indexname='IdempotencyKey_company_key_uniq' AND indexdef LIKE '%companyId%';")" "1"

# پاک‌سازی
#
# ⚠️ موجودی هم باید برگردد، نه فقط فاکتورها.
#
#    `receive` انبار را بالا می‌برد.  اگر فقط فاکتور پاک شود، موجودیِ
#    اضافه می‌ماند و مجموعه‌های بعدی — که موجودیِ دقیق را می‌سنجند —
#    با شکستِ دروغین می‌افتند.  یک بار همین شد و شش سنجهٔ `e2e-cycles`
#    را قرمز کرد.
$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  UPDATE \"Inventory\" SET quantity = $Q0 WHERE \"productId\"='seed-p3';
  DELETE FROM \"JournalLine\" WHERE \"entryId\" IN
    (SELECT id FROM \"JournalEntry\" WHERE \"sourceId\" IN ('$PID','$PID3','$PID4'));
  DELETE FROM \"JournalEntry\" WHERE \"sourceId\" IN ('$PID','$PID3','$PID4');
  DELETE FROM \"StockMovement\" WHERE \"refType\"='PURCHASE' AND \"refId\" IN ('$PID','$PID3','$PID4');
  DELETE FROM \"PurchaseItem\" WHERE \"purchaseId\" IN ('$PID','$PID3','$PID4');
  DELETE FROM \"Purchase\" WHERE id IN ('$PID','$PID3','$PID4');
  DELETE FROM \"IdempotencyKey\" WHERE key LIKE '$KEY%' OR key='$BAD';" >/dev/null 2>&1

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
