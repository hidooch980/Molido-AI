#!/usr/bin/env bash
#
# اقساطِ فاکتور — تقسیمِ مانده به چند قسط.
#
# ⚠️ این مسیر تا امروز **هیچ پوششی نداشت**.
#
#    `POST /sales/:id/installments` پول جابه‌جا نمی‌کند (زمان‌بندی
#    می‌سازد و مانده از قبل در دفتر هست)، پس سند نمی‌خواهد.  ولی
#    خطرش جای دیگری است.
#
# ⚠️ **گِردکردن.**  سنجهٔ اصلیِ این فایل.
#
#    `base = floor((remaining / count) * 100) / 100` و قسطِ آخر
#    باقی‌مانده را جذب می‌کند.  اگر آن جذب نبود، جمعِ اقساط با ماندهٔ
#    فاکتور نمی‌خواند — چند ریال، هر بار، برای همیشه.  و هیچ خطایی
#    نمی‌دهد: هر قسط عددِ معقولی دارد و فقط جمعشان غلط است.
#
#    یک ریال در هر فاکتور، در هزار فاکتور می‌شود هزار ریالِ ناپیدا در
#    حساب دریافتنی — که هیچ‌وقت وصول نمی‌شود و هیچ‌وقت هم دیده نمی‌شود.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
JS="Content-Type: application/json"
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H "$JS" \
  -d '{"email":"admin@molido.ai","password":"'"$PW"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق"
  echo
  printf "   PASS: 0   FAIL: 1\n"
  exit 1
fi
AU="Authorization: Bearer $T"

P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read().strip()
if not raw:
    d=None
else:
    try:
        d=json.loads(raw)
    except ValueError:
        print('<<no-json>>'); sys.exit(0)
print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d ' \r'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

cleanup() {
  Q "DELETE FROM \"Installment\" WHERE \"saleId\" IN
       (SELECT id FROM \"Sale\" WHERE note = 'INSTTEST');
     DELETE FROM \"JournalLine\" WHERE \"entryId\" IN
       (SELECT id FROM \"JournalEntry\" WHERE \"sourceId\" IN
          (SELECT id FROM \"Sale\" WHERE note = 'INSTTEST'));
     DELETE FROM \"JournalEntry\" WHERE \"sourceId\" IN
       (SELECT id FROM \"Sale\" WHERE note = 'INSTTEST');
     DELETE FROM \"SaleItem\" WHERE \"saleId\" IN
       (SELECT id FROM \"Sale\" WHERE note = 'INSTTEST');
     DELETE FROM \"Payment\" WHERE \"saleId\" IN
       (SELECT id FROM \"Sale\" WHERE note = 'INSTTEST');
     DELETE FROM \"Sale\" WHERE note = 'INSTTEST';" >/dev/null
}
trap cleanup EXIT
cleanup

# ⚠️ قیمتِ فرستاده‌شده **نادیده گرفته می‌شود** — و این درست است.
#
#    فروش قیمت را از خودِ کالا می‌گیرد، نه از درخواست؛ وگرنه هر کسی
#    می‌توانست فاکتورِ یک‌ریالی بزند.  سنجیده شد: با ۹۹۹۹۹۹،
#    ۱۰۰۰۰۰۰ و ۲۵۰۰۰۰ هر سه بار جمعِ فاکتور همان قیمتِ کالا شد.
#
#    پس سنجه‌ها نمی‌توانند عددِ ثابت انتظار داشته باشند.  ناوردای
#    واقعی این است: **جمعِ اقساط دقیقاً برابرِ ماندهٔ فاکتور**، هر چه
#    آن مانده باشد.  نسخهٔ اول عددِ ثابت گذاشت و دو قرمزیِ کاذب داد.
sale() {
  curl -s -X POST "$A/sales" -H "$AU" -H "$JS" -d "{
    \"warehouseId\":\"seed-warehouse\",
    \"items\":[{\"productId\":\"seed-p1\",\"quantity\":1,\"price\":$1}],
    \"note\":\"INSTTEST\"
  }"
}

S=$(sale 1000000)
SID=$(printf '%s' "$S" | P "d.get('id','')")
if [ -z "$SID" ]; then
  echo "  ✗ ساختِ فاکتور ناموفق"
  printf '%s\n' "$S" | head -c 250
  echo
  printf "   PASS: 0   FAIL: 1\n"
  exit 1
fi

echo '--- ۱) تقسیم به سه قسط ---'
R=$(curl -s -X POST "$A/sales/$SID/installments" -H "$AU" -H "$JS" -d '{"count":3}')
chk "سه قسط ساخته شد" "$(printf '%s' "$R" | P "len(d)")" "3"

echo '--- ۲) جمعِ اقساط دقیقاً برابرِ مانده است ---'
#
# ⚠️ **سنجهٔ اصلی.**  ۱۰۰۰۰۰۰ بر ۳ نمی‌شود؛ قسطِ آخر باید باقی‌مانده
#    را جذب کند.  بدونِ آن، چند ریال هر بار گم می‌شود — بی‌آنکه چیزی
#    خطا بدهد.
# ⚠️ مقایسه **بدونِ گِردکردن**.
#
#    نسخهٔ اول `round(sum(amount))` را با `round(total)` می‌سنجید و
#    با تزریقِ عمدیِ خطا هم سبز ماند: اختلافِ دو ریال در گِردکردن گم
#    می‌شد.  یعنی سنجه‌ای که دقیقاً برای گرفتنِ همان دو ریال نوشته شده
#    بود، همان را نمی‌دید.
TOTAL=$(Q "SELECT total FROM \"Sale\" WHERE id='$SID';")
chk "جمعِ اقساط = ماندهٔ فاکتور ($TOTAL)" \
  "$(Q "SELECT sum(amount) FROM \"Installment\" WHERE \"saleId\"='$SID';")" "$TOTAL"

chk "دو قسطِ اول برابرند" \
  "$(Q "SELECT count(DISTINCT amount) FROM \"Installment\"
         WHERE \"saleId\"='$SID' AND seq < 3;")" "1"

chk "شماره‌ها ۱ تا ۳ هستند" \
  "$(Q "SELECT string_agg(seq::text, ',' ORDER BY seq) FROM \"Installment\" WHERE \"saleId\"='$SID';")" "1,2,3"

chk "همه در انتظارند" \
  "$(Q "SELECT count(*) FROM \"Installment\" WHERE \"saleId\"='$SID' AND status='PENDING';")" "3"

echo '--- ۳) سررسیدها فاصله دارند ---'
# ⚠️ سه قسط با یک سررسید یعنی تقسیط بی‌معنا.
chk "سه سررسیدِ متفاوت" \
  "$(Q "SELECT count(DISTINCT \"dueDate\") FROM \"Installment\" WHERE \"saleId\"='$SID';")" "3"

echo '--- ۴) تقسیطِ دوباره رد می‌شود ---'
# ⚠️ بدونِ این، تقسیطِ دوباره اقساطِ موازی می‌ساخت و ماندهٔ فاکتور دو
#    بار تقسیم می‌شد.
chk "تقسیطِ دوباره ۴۰۰ می‌گیرد" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/sales/$SID/installments" \
     -H "$AU" -H "$JS" -d '{"count":4}')" "400"
chk "و اقساط همان سه تا ماند" \
  "$(Q "SELECT count(*) FROM \"Installment\" WHERE \"saleId\"='$SID';")" "3"

echo '--- ۵) کرانه‌های تعداد ---'
S2=$(sale 500000)
SID2=$(printf '%s' "$S2" | P "d.get('id','')")
chk "یک قسط رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/sales/$SID2/installments" \
     -H "$AU" -H "$JS" -d '{"count":1}')" "400"
chk "شصت‌ویک قسط رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/sales/$SID2/installments" \
     -H "$AU" -H "$JS" -d '{"count":61}')" "400"
chk "تعدادِ غایب رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/sales/$SID2/installments" \
     -H "$AU" -H "$JS" -d '{}')" "400"

echo '--- ۶) فاکتورِ تسویه‌شده تقسیط نمی‌شود ---'
# ⚠️ فاکتوری که مانده ندارد، اقساطش همه صفر می‌شد — ردیف‌هایی که
#    هیچ‌وقت وصول نمی‌شوند و گزارشِ سررسید را شلوغ می‌کنند.
# ⚠️ مبلغِ پرداخت از قیمتِ **واقعیِ** کالا خوانده می‌شود، نه از عددِ
#    دلخواه — وگرنه فاکتور نیمه‌پرداخت می‌ماند و «بی‌مانده» نیست.
PRICE=$(Q "SELECT round(\"salePrice\") FROM \"Product\" WHERE id='seed-p1';")
S3=$(curl -s -X POST "$A/sales" -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"seed-warehouse\",
  \"items\":[{\"productId\":\"seed-p1\",\"quantity\":1}],
  \"payments\":[{\"method\":\"CASH\",\"amount\":$PRICE}],
  \"note\":\"INSTTEST\"}")
SID3=$(printf '%s' "$S3" | P "d.get('id','')")
if [ -n "$SID3" ]; then
  chk "فاکتورِ بی‌مانده تقسیط نمی‌شود" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/sales/$SID3/installments" \
       -H "$AU" -H "$JS" -d '{"count":3}')" "400"
fi

echo '--- ۷) تقسیطِ چهل‌ویک قسطی هم دقیق است ---'
#
# ⚠️ عددِ بزرگ خطای گِردکردن را بزرگ می‌کند: چهل قسطِ گِردشده به پایین
#    یعنی قسطِ آخر باید چهل برابرِ خطا را جذب کند.  اگر جایی truncate
#    شود، اینجا دیده می‌شود نه در حالتِ سه‌قسطی.
S4=$(sale 999999)
SID4=$(printf '%s' "$S4" | P "d.get('id','')")
curl -s -o /dev/null -X POST "$A/sales/$SID4/installments" -H "$AU" -H "$JS" -d '{"count":41}'
T4=$(Q "SELECT total FROM \"Sale\" WHERE id='$SID4';")
chk "جمعِ ۴۱ قسط = ماندهٔ فاکتور ($T4)" \
  "$(Q "SELECT sum(amount) FROM \"Installment\" WHERE \"saleId\"='$SID4';")" "$T4"
chk "هیچ قسطی منفی نیست" \
  "$(Q "SELECT count(*) FROM \"Installment\" WHERE \"saleId\"='$SID4' AND amount < 0;")" "0"

echo '--- ۸) دسترسی ---'
chk "بدون توکن ۴۰۱" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/sales/$SID2/installments" \
     -H "$JS" -d '{"count":3}')" "401"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
