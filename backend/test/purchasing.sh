#!/usr/bin/env bash
#
# منشی خرید: استعلام قیمت از بنکدارها، مقایسه، و صدور فاکتور خرید.
#
# مهم‌ترین بندها انتخاب برنده و به‌روزرسانی قیمت خریدند.  هر دو مستقیم
# پول‌اند و اشتباهشان دیده نمی‌شود: کسی فاکتور خرید را با استعلام‌های
# آن روز مقایسه نمی‌کند، و حاشیهٔ سودِ محاسبه‌شده با قیمت خریدِ قدیمی
# ماه‌ها غلط می‌ماند.
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
    # برچسب باید بی‌گیومه و بی‌بک‌اسلش باشد: این مقدار در عبارتِ
    # پایتونِ سنجهٔ بعدی جاگذاری می‌شود و اگر گیومه داشته باشد نحو
    # را می‌شکند — یعنی برچسبِ تشخیصی، خودش شکست تازه می‌سازد.
    bad = chr(39) + chr(34) + chr(92)
    safe = ''.join(c for c in raw[:40] if c.isprintable() and c not in bad)
    print('<<پاسخ-JSON-نبود: %d نویسه: %s>>' % (len(raw), safe)); sys.exit(0)
print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql()  { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

# پاک‌سازی: از فرزند به والد، وگرنه کلید خارجی کل دسته را لغو می‌کند.
psql "DELETE FROM \"SupplierQuote\" WHERE \"callId\" IN
        (SELECT c.id FROM \"SupplierCall\" c JOIN \"PurchaseInquiry\" i ON i.id = c.\"inquiryId\"
          WHERE i.title = 'BUY-TEST');
      DELETE FROM \"SupplierCall\" WHERE \"inquiryId\" IN
        (SELECT id FROM \"PurchaseInquiry\" WHERE title = 'BUY-TEST');
      DELETE FROM \"PurchaseInquiryItem\" WHERE \"inquiryId\" IN
        (SELECT id FROM \"PurchaseInquiry\" WHERE title = 'BUY-TEST');
      DELETE FROM \"PurchaseInquiry\" WHERE title = 'BUY-TEST';
      DELETE FROM \"Supplier\" WHERE name IN ('BUY-Cheap','BUY-Mid','BUY-Rich');
      DELETE FROM \"Product\" WHERE sku IN ('BUY-P1','BUY-P2');"

WH=$(curl -s $A/warehouses -H "$AU" | P "d[0]['id'] if isinstance(d,list) else d['data'][0]['id']")

P1=$(curl -s -X POST $A/products -H "$AU" -H "$JS" -d '{
  "name":"Buy Rice","sku":"BUY-P1","unit":"kg",
  "salePrice":150000,"purchasePrice":100000,"minStock":50}' | P "d.get('id','')")
P2=$(curl -s -X POST $A/products -H "$AU" -H "$JS" -d '{
  "name":"Buy Oil","sku":"BUY-P2","unit":"pcs",
  "salePrice":300000,"purchasePrice":200000,"minStock":20}' | P "d.get('id','')")

S1=$(curl -s -X POST $A/suppliers -H "$AU" -H "$JS" -d '{"name":"BUY-Cheap","phone":"02111110001"}' | P "d.get('id','')")
S2=$(curl -s -X POST $A/suppliers -H "$AU" -H "$JS" -d '{"name":"BUY-Mid","phone":"02111110002"}' | P "d.get('id','')")
S3=$(curl -s -X POST $A/suppliers -H "$AU" -H "$JS" -d '{"name":"BUY-Rich","phone":"02111110003"}' | P "d.get('id','')")

echo '--- 1) تشخیص کالای کم‌موجود ---'
# موجودی زیر حداقل → باید در پیشنهاد بیاید.
psql "INSERT INTO \"Inventory\" (id, \"warehouseId\", \"productId\", quantity)
        VALUES ('buy-inv-1', '$WH', '$P1', 5)
      ON CONFLICT (\"warehouseId\", \"productId\") DO UPDATE SET quantity = 5;"
SUG=$(curl -s "$A/purchasing/suggestions?warehouseId=$WH" -H "$AU")
chk "کالای کم‌موجود پیشنهاد شد" \
  "$(echo "$SUG" | P "'yes' if any(s['productId']=='$P1' for s in d) else 'no'")" "yes"
# پیشنهاد تا دو برابر حداقل: ۵۰×۲ − ۵ = ۹۵
chk "مقدار پیشنهادی تا دو برابر حداقل" \
  "$(echo "$SUG" | P "int(float([s for s in d if s['productId']=='$P1'][0]['suggestQty']))")" "95"

echo '--- 2) ساخت استعلام ---'
INQ=$(curl -s -X POST $A/purchasing/inquiries -H "$AU" -H "$JS" -d "{
  \"title\":\"BUY-TEST\",\"warehouseId\":\"$WH\",
  \"items\":[{\"productId\":\"$P1\",\"qty\":100},{\"productId\":\"$P2\",\"qty\":30}]}")
IID=$(echo "$INQ" | P "d.get('id','')")
chk "استعلام ساخته شد" "$([ -n "$IID" ] && echo yes || echo no)" "yes"
chk "دو قلم دارد"      "$(echo "$INQ" | P "len(d['items'])")" "2"
# آخرین قیمت خرید در لحظهٔ ساخت ثبت می‌شود، نه هنگام مقایسه.
chk "قیمت قبلی ثبت شد" \
  "$(psqlv "SELECT \"lastPrice\"::bigint FROM \"PurchaseInquiryItem\"
             WHERE \"inquiryId\"='$IID' AND \"productId\"='$P1'")" "100000"

echo '--- 3) استعلام بدون قلم رد می‌شود ---'
chk "فهرست خالی" "$(curl -s -X POST $A/purchasing/inquiries -H "$AU" -H "$JS" \
  -d '{"title":"BUY-EMPTY","items":[]}' | P "d.get('statusCode')")" "400"

echo '--- 4) فهرست تماس ---'
CL=$(curl -s "$A/purchasing/inquiries/$IID/call-list" -H "$AU")
chk "هر سه بنکدار در فهرست" \
  "$(echo "$CL" | P "len([s for s in d if s['name'].startswith('BUY-')])")" "3"
chk "هنوز تماسی ثبت نشده" \
  "$(echo "$CL" | P "sum(1 for s in d if s.get('call'))")" "0"

echo '--- 5) ثبت تماس و قیمت ---'
curl -s -X POST "$A/purchasing/inquiries/$IID/calls" -H "$AU" -H "$JS" -d "{
  \"supplierId\":\"$S1\",\"channel\":\"MANUAL\",
  \"quotes\":[{\"productId\":\"$P1\",\"unitPrice\":95000,\"availableQty\":40},
              {\"productId\":\"$P2\",\"unitPrice\":190000}]}" >/dev/null
curl -s -X POST "$A/purchasing/inquiries/$IID/calls" -H "$AU" -H "$JS" -d "{
  \"supplierId\":\"$S2\",\"channel\":\"VOIP\",\"transcript\":\"Price is 105000\",
  \"quotes\":[{\"productId\":\"$P1\",\"unitPrice\":105000,\"availableQty\":200,\"leadDays\":2}]}" >/dev/null
curl -s -X POST "$A/purchasing/inquiries/$IID/calls" -H "$AU" -H "$JS" -d "{
  \"supplierId\":\"$S3\",\"status\":\"NO_ANSWER\"}" >/dev/null

chk "سه تماس ثبت شد" "$(psqlv "SELECT count(*) FROM \"SupplierCall\" WHERE \"inquiryId\"='$IID'")" "3"
chk "کانال ویپ ثبت شد" \
  "$(psqlv "SELECT channel FROM \"SupplierCall\" WHERE \"inquiryId\"='$IID' AND \"supplierId\"='$S2'")" "VOIP"
chk "بی‌پاسخ، قیمتی ندارد" \
  "$(psqlv "SELECT count(*) FROM \"SupplierQuote\" q JOIN \"SupplierCall\" c ON c.id=q.\"callId\"
             WHERE c.\"inquiryId\"='$IID' AND c.\"supplierId\"='$S3'")" "0"
chk "استعلام از پیش‌نویس درآمد" \
  "$(psqlv "SELECT status FROM \"PurchaseInquiry\" WHERE id='$IID'")" "CALLING"

echo '--- 6) قیمت کالای خارج از فهرست رد می‌شود ---'
# بنکداری که قیمت کالای دیگری داده، پیشنهادش نباید در مقایسه بیاید.
OTHER=$(curl -s -X POST $A/products -H "$AU" -H "$JS" -d '{
  "name":"Buy Other","sku":"BUY-OTHER","unit":"pcs","salePrice":1000,"purchasePrice":500}' | P "d.get('id','')")
chk "کالای خارج از استعلام" "$(curl -s -X POST "$A/purchasing/inquiries/$IID/calls" -H "$AU" -H "$JS" \
  -d "{\"supplierId\":\"$S1\",\"quotes\":[{\"productId\":\"$OTHER\",\"unitPrice\":600}]}" \
  | P "d.get('statusCode')")" "400"

echo '--- 7) قیمت صفر یا منفی رد می‌شود ---'
chk "قیمت صفر"  "$(curl -s -X POST "$A/purchasing/inquiries/$IID/calls" -H "$AU" -H "$JS" \
  -d "{\"supplierId\":\"$S1\",\"quotes\":[{\"productId\":\"$P1\",\"unitPrice\":0}]}" | P "d.get('statusCode')")" "400"
chk "قیمت منفی" "$(curl -s -X POST "$A/purchasing/inquiries/$IID/calls" -H "$AU" -H "$JS" \
  -d "{\"supplierId\":\"$S1\",\"quotes\":[{\"productId\":\"$P1\",\"unitPrice\":-100}]}" | P "d.get('statusCode')")" "400"

echo '--- 8) مقایسه: کسی که کل نیاز را دارد برنده است ---'
# BUY-Cheap ارزان‌تر است (۹۵٬۰۰۰) ولی فقط ۴۰ از ۱۰۰ را دارد.
# BUY-Mid گران‌تر است (۱۰۵٬۰۰۰) ولی ۲۰۰ دارد — خرید از دو جا یعنی دو
# کرایهٔ حمل و دو فاکتور، که تفاوت قیمت جبرانش نمی‌کند.
CMP=$(curl -s "$A/purchasing/inquiries/$IID/compare" -H "$AU")
chk "برندهٔ برنج، تأمین‌کنندهٔ کامل است" \
  "$(echo "$CMP" | P "[w for w in d['winners'] if w['productId']=='$P1'][0]['quote']['supplierName']")" "BUY-Mid"
chk "برندهٔ روغن، تنها پیشنهاددهنده" \
  "$(echo "$CMP" | P "[w for w in d['winners'] if w['productId']=='$P2'][0]['quote']['supplierName']")" "BUY-Cheap"

echo '--- 9) گرانی نسبت به خرید قبل هشدار می‌گیرد ---'
# برنج از ۱۰۰٬۰۰۰ به ۱۰۵٬۰۰۰ → ۵٪ (زیر آستانهٔ ۱۵٪)
chk "درصد تغییر برنج" \
  "$(echo "$CMP" | P "[w for w in d['winners'] if w['productId']=='$P1'][0]['changePercent']")" "5"
# روغن از ۲۰۰٬۰۰۰ به ۱۹۰٬۰۰۰ → ۵٪ ارزان‌تر
chk "روغن ارزان‌تر شد" \
  "$(echo "$CMP" | P "[w for w in d['winners'] if w['productId']=='$P2'][0]['changePercent']")" "-5"

echo '--- 10) خلاصهٔ تصمیم ---'
# ۱۰۰×۱۰۵٬۰۰۰ + ۳۰×۱۹۰٬۰۰۰ = ۱۶٬۲۰۰٬۰۰۰
chk "مبلغ کل خرید"        "$(echo "$CMP" | P "int(d['summary']['total'])")" "16200000"
chk "دو قلم پوشش داده شد" "$(echo "$CMP" | P "d['summary']['covered']")" "2"
chk "قلم بی‌پیشنهاد ندارد" "$(echo "$CMP" | P "d['summary']['uncovered']")" "0"
chk "دو تأمین‌کننده درگیر" "$(echo "$CMP" | P "d['summary']['supplierCount']")" "2"

echo '--- 11) صدور فاکتور خرید ---'
ORD=$(curl -s -X POST "$A/purchasing/inquiries/$IID/order" -H "$AU" -H "$JS" -d '{}')
chk "دو فاکتور صادر شد" "$(echo "$ORD" | P "d['ordered']")" "2"
chk "مبلغ کل"          "$(echo "$ORD" | P "int(d['total']))" 2>/dev/null || echo "$ORD" | P "int(d['total'])")" "16200000"
chk "استعلام بسته شد"  "$(psqlv "SELECT status FROM \"PurchaseInquiry\" WHERE id='$IID'")" "ORDERED"

echo '--- 12) قیمت خرید کالا از مکالمه به‌روز شد ---'
# آنچه در مکالمه با بنکدار توافق شده باید در سامانه بنشیند، وگرنه
# حاشیهٔ سود ماه‌ها با عدد قدیمی حساب می‌شود.
chk "قیمت خرید برنج" "$(psqlv "SELECT \"purchasePrice\"::bigint FROM \"Product\" WHERE id='$P1'")" "105000"
chk "قیمت خرید روغن" "$(psqlv "SELECT \"purchasePrice\"::bigint FROM \"Product\" WHERE id='$P2'")" "190000"

echo '--- 13) پیشنهاد برنده علامت خورد ---'
# «چرا از این خریدیم» باید پاسخ داشته باشد.
chk "دو پیشنهاد برنده" \
  "$(psqlv "SELECT count(*) FROM \"SupplierQuote\" q JOIN \"SupplierCall\" c ON c.id=q.\"callId\"
             WHERE c.\"inquiryId\"='$IID' AND q.\"isSelected\" = true")" "2"

echo '--- 14) سفارش دوباره رد می‌شود ---'
chk "سفارش تکراری" "$(curl -s -X POST "$A/purchasing/inquiries/$IID/order" -H "$AU" -H "$JS" -d '{}' \
  | P "d.get('statusCode')")" "400"

echo '--- 15) استعلام بسته دیگر تماس نمی‌پذیرد ---'
chk "تماس روی استعلام بسته" "$(curl -s -X POST "$A/purchasing/inquiries/$IID/calls" -H "$AU" -H "$JS" \
  -d "{\"supplierId\":\"$S1\",\"quotes\":[{\"productId\":\"$P1\",\"unitPrice\":50000}]}" \
  | P "d.get('statusCode')")" "400"

echo '--- 16) تاریخچهٔ قیمت ---'
chk "تاریخچهٔ برنج دو پیشنهاد دارد" \
  "$(curl -s "$A/purchasing/price-history/$P1" -H "$AU" | P "len(d)")" "2"

echo '--- 17) بدون توکن بسته است ---'
chk "بدون توکن" "$(curl -s -o /dev/null -w '%{http_code}' $A/purchasing/suggestions)" "401"

# پاک‌سازی
echo '--- 18) manager brief ---'
# مقایسه، بهترین قیمت را می‌دهد.  گزارش، به مدیر می‌گوید مریم چقدر
# صرفه‌جویی کرد و کجا تصمیمِ خودِ او لازم است.
CMP=$(curl -s "$A/purchasing/inquiries/$IID/compare" -H "$AU")

chk "brief in comparison" "$(echo "$CMP" | P "'brief' in d")" "True"
chk "saving computed" "$(echo "$CMP" | P "d['brief']['totalSaved']>0")" "True"
# صرفه‌جویی = ارزان‌ترین در برابر گران‌ترینِ همین استعلام، نه قیمت قبلی:
# اگر ارز بالا رفته باشد همهٔ پیشنهادها گران‌ترند و عددِ «صرفه‌جویی
# منفی» بی‌معنی است.
chk "best never above worst" \
  "$(echo "$CMP" | P "all(s['worst']>=s['best'] for s in d['brief']['savings'])")" "True"
chk "biggest saving first" \
  "$(echo "$CMP" | P "[s['saved'] for s in d['brief']['savings']]==sorted([s['saved'] for s in d['brief']['savings']],reverse=True)")" "True"
# قلمی که فقط یک قیمت داشت، مقایسه‌ای نداشته و ممکن است گران باشد
# بی‌آنکه معلوم شود — مدیر باید جدا ببیندش.
chk "single-quote items separated" \
  "$(echo "$CMP" | P "isinstance(d['brief']['singleQuote'],list)")" "True"
chk "message states the amount" \
  "$(echo "$CMP" | P "'\u062e\u0631\u06cc\u062f \u067e\u06cc\u0634\u0646\u0647\u0627\u062f\u06cc' in d['brief']['message']")" "True"
chk "message states the saving" \
  "$(echo "$CMP" | P "'\u0635\u0631\u0641\u0647\u200c\u062c\u0648\u06cc\u06cc' in d['brief']['message']")" "True"


psql "DELETE FROM \"PurchaseItem\" WHERE \"purchaseId\" IN
        (SELECT id FROM \"Purchase\" WHERE note LIKE '%BUY-TEST%' OR note LIKE '%INQ-%');
      DELETE FROM \"Purchase\" WHERE note LIKE '%INQ-%';
      DELETE FROM \"SupplierQuote\" WHERE \"callId\" IN
        (SELECT id FROM \"SupplierCall\" WHERE \"inquiryId\"='$IID');
      DELETE FROM \"SupplierCall\" WHERE \"inquiryId\"='$IID';
      DELETE FROM \"PurchaseInquiryItem\" WHERE \"inquiryId\"='$IID';
      DELETE FROM \"PurchaseInquiry\" WHERE id='$IID';
      DELETE FROM \"Inventory\" WHERE id='buy-inv-1';
      DELETE FROM \"Supplier\" WHERE name IN ('BUY-Cheap','BUY-Mid','BUY-Rich');
      DELETE FROM \"Product\" WHERE sku IN ('BUY-P1','BUY-P2','BUY-OTHER');"

printf '\n   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
