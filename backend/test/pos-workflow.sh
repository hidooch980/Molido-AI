#!/usr/bin/env bash
#
# صندوق: تعلیق فاکتور و تخفیف قلمی.
#
# دو چیزی که هر فروشگاه واقعی روزی ده بار لازم دارد و صندوق نداشت.
#
# مهم‌ترین آزمون اینجا **سقف تخفیف** است: تخفیف قلمی بدون سقف یعنی
# صندوق‌دار می‌تواند کالا را رایگان بدهد، و این پرتکرارترین شکل
# سوءاستفاده در خرده‌فروشی است.
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

# پاک‌سازیِ مشترک — پیش از این، هر اجرا دو فاکتور، سه سند و بیست‌وچهار واحد موجودی جا می‌گذاشت.
. "$(dirname "$0")/lib/reset.sh"
reset_begin
trap reset_finish EXIT

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql() { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

# ⚠️ ماژول صندوق فروشگاهی در این محصول هست؟
#
#    `RetailModule` فقط در قابلیتِ `retail` است و نمایهٔ رستوران آن را
#    ندارد.  بدونِ این بررسی، اجرای رستوران ۱۴ شکست می‌داد
#    (`parked got=no`، `listed got=`، …) که هیچ‌کدام عیب نبودند — فقط
#    ۴۰۴ از ماژولی که عمداً بار نشده.
#
#    `restaurant.sh` قرینهٔ همین بررسی را برای نمایهٔ فروشگاه دارد؛
#    این یکی جا افتاده بود.
#
#    پیش از پاک‌سازیِ پایگاه‌داده می‌آید: دست زدن به جدول‌های صندوق در
#    محصولی که صندوق ندارد بی‌معنی است.
if [ "$(curl -s -o /dev/null -w '%{http_code}' "$A/retail/parked" -H "$AU")" = "404" ]; then
  echo "  ماژول صندوق فروشگاهی در این محصول فعال نیست (MOLIDO_PRODUCT=resto)"
  echo "  برای آزمون: MOLIDO_PRODUCT=store یا suite"
  echo
  printf "   PASS: 0   FAIL: 0   SKIPPED
"
  exit 0
fi


psql "DELETE FROM \"ParkedSale\";
      UPDATE \"Company\" SET \"maxLineDiscountPercent\" = 0;
      UPDATE \"Inventory\" SET quantity = 10000 WHERE \"productId\" LIKE 'seed-%';
      UPDATE \"Product\" SET \"salePrice\"=100000 WHERE id='seed-p3';"

WH=$(curl -s "$A/warehouses" -H "$AU" | P "d[0]['id']")

echo '--- 1) a cart can be parked ---'
PK=$(curl -s -X POST $A/retail/parked -H "$AU" -H "$JS" \
  -d '{"lines":[{"productId":"seed-p3","quantity":2,"name":"Sugar","price":100000},{"productId":"seed-p2","quantity":1}],"label":"TEST-cart"}')
PID=$(echo "$PK" | P "d.get('id','')")
chk "parked"     "$([ -n "$PID" ] && echo yes || echo no)" "yes"
chk "line count" "$(echo "$PK" | P "d['lineCount']")" "2"

echo '--- 2) every cashier sees it ---'
# مشتری ممکن است سراغ صندوق دیگری برود؛ سبدی که فقط برای یک نفر دیده
# شود، برای او گم شده است.
chk "listed"      "$(curl -s "$A/retail/parked" -H "$AU" | P "'yes' if any(p['id']=='$PID' for p in d) else 'no'")" "yes"
chk "shows label" "$(curl -s "$A/retail/parked" -H "$AU" | P "[p['label'] for p in d if p['id']=='$PID'][0]")" "TEST-cart"

echo '--- 3) an empty cart is refused ---'
chk "empty refused" "$(curl -s -X POST $A/retail/parked -H "$AU" -H "$JS" \
  -d '{"lines":[]}' | P "d.get('statusCode')")" "400"

echo '--- 4) resuming re-reads prices from the server ---'
# سبدی که یک ساعت معلق مانده نباید با قیمت دیروز حساب شود.
psql "UPDATE \"Product\" SET \"salePrice\"=123000 WHERE id='seed-p3';"
R=$(curl -s -X POST "$A/retail/parked/$PID/resume" -H "$AU" -H "$JS")
chk "two lines back"   "$(echo "$R" | P "len(d['lines'])")" "2"
chk "fresh price"      "$(echo "$R" | P "[int(l['price']) for l in d['lines'] if l['productId']=='seed-p3'][0]")" "123000"
chk "name filled in"   "$(echo "$R" | P "'yes' if all(l['name'] != '—' for l in d['lines']) else 'no'")" "yes"
chk "removed after resume" "$(psqlv "SELECT COUNT(*) FROM \"ParkedSale\" WHERE id='$PID'")" "0"

echo '--- 5) an unavailable product is flagged, not silently priced at zero ---'
psql "UPDATE \"Product\" SET \"salePrice\"=100000 WHERE id='seed-p3';
      UPDATE \"Product\" SET status='INACTIVE' WHERE id='seed-p2';"
P2=$(curl -s -X POST $A/retail/parked -H "$AU" -H "$JS" \
  -d '{"lines":[{"productId":"seed-p2","quantity":1}]}' | P "d['id']")
chk "flagged unavailable" "$(curl -s -X POST "$A/retail/parked/$P2/resume" -H "$AU" -H "$JS" \
  | P "d['lines'][0]['unavailable']")" "True"
psql "UPDATE \"Product\" SET status='ACTIVE' WHERE id='seed-p2';"

echo '--- 6) manual discount is refused when the ceiling is zero ---'
# پیش‌فرض صفر است: تخفیف دستی باید صریح فعال شود.
sale() { curl -s -X POST $A/sales -H "$AU" -H "$JS" \
  -d "{\"warehouseId\":\"$WH\",\"items\":[{\"productId\":\"seed-p3\",\"quantity\":1,\"manualDiscount\":$1}]}"; }
chk "refused at zero ceiling" "$(sale 5000 | P "d.get('statusCode')")" "400"

echo '--- 7) within the ceiling it applies ---'
psql "UPDATE \"Company\" SET \"maxLineDiscountPercent\" = 20;"
# ۱۰۰٬۰۰۰ با سقف ۲۰٪ ⇒ حداکثر ۲۰٬۰۰۰
S=$(sale 15000)
chk "sale total"      "$(echo "$S" | P "int(float(d['total']))")" "85000"
chk "stored on item"  "$(psqlv "SELECT \"manualDiscount\"::int FROM \"SaleItem\" WHERE \"saleId\"='$(echo "$S" | P "d['id']")'")" "15000"

echo '--- 8) above the ceiling is refused ---'
chk "over ceiling refused" "$(sale 25000 | P "d.get('statusCode')")" "400"

echo '--- 9) discount can never exceed the line amount ---'
# بدون این، مبلغ فاکتور منفی می‌شود و از آنجا به بعد همه‌چیز خراب است.
psql "UPDATE \"Company\" SET \"maxLineDiscountPercent\" = 100;"
S2=$(sale 100000)
chk "total is zero, not negative" "$(echo "$S2" | P "int(float(d['total']))")" "0"
chk "never negative" "$(psqlv "SELECT COUNT(*) FROM \"Sale\" WHERE total < 0")" "0"

echo '--- 10) a negative discount is refused by validation ---'
chk "negative refused" "$(sale -5000 | P "d.get('statusCode')")" "400"

# پاک‌سازی
psql "DELETE FROM \"ParkedSale\";
      UPDATE \"Company\" SET \"maxLineDiscountPercent\" = 0;
      UPDATE \"Product\" SET \"salePrice\"=310000 WHERE id='seed-p3';"

echo '--- search (the path voice input also takes) ---'
# هیچ آزمونی این مسیر را نمی‌زد، در حالی که صندوق، چیدمان صندوق و
# فاکتور فروش هر سه به آن وابسته‌اند.
psql "DELETE FROM \\"Product\\" WHERE sku = 'SEARCH-TEST-1';"
curl -s -X POST $A/products -H "$AU" -H "$JS" -d '{
  "name":"Searchable Widget","sku":"SEARCH-TEST-1","unit":"pcs",
  "salePrice":9000,"purchasePrice":5000}' >/dev/null

chk "find by name" "$(curl -s "$A/retail/search?q=Searchable" -H "$AU" | P "sum(1 for x in d if x['sku']=='SEARCH-TEST-1')")" "1"
chk "find by sku" "$(curl -s "$A/retail/search?q=SEARCH-TEST-1" -H "$AU" | P "len(d)>=1")" "True"
chk "unknown term, empty list" "$(curl -s "$A/retail/search?q=zzzznotaproduct" -H "$AU" | P "len(d)")" "0"
# جعبهٔ جست‌وجوی خالی در رابط، q= می‌فرستد و باید فهرست خالی بگیرد.
chk "empty q, empty list" "$(curl -s "$A/retail/search?q=" -H "$AU" | P "len(d)")" "0"
# ولی فراخوانی که اصلاً q ندارد، اشتباهِ نویسندهٔ آن فراخوان است و باید
# بلند شکست بخورد — نه اینکه ساعت‌ها دنبال «چرا چیزی پیدا نمی‌شود» بگردد.
chk "missing q rejected" "$(curl -s "$A/retail/search" -H "$AU" | P "d.get('statusCode')")" "400"
chk "limit respected" "$(curl -s "$A/retail/search?q=e&limit=3" -H "$AU" | P "len(d)<=3")" "True"
psql "DELETE FROM \\"Product\\" WHERE sku = 'SEARCH-TEST-1';"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
