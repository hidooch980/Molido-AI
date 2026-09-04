#!/usr/bin/env bash
#
# فروشگاه اینترنتی: کاتالوگ عمومی، حساب مشتری، سبد، تسویه، و تبدیل به
# سفارش فروش.
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
# ⚠️ ۴۲۹ شکست نیست؛ «هنوز نه» است.
#
#    `/shop/register` و `/shop/login` هر کدام ده در دقیقه سقف دارند و
#    این مجموعه چند مشتری می‌سازد.  به‌تنهایی جا می‌شود، ولی وقتی
#    اجراکننده مجموعه‌ای را که یک بار افتاده **دوباره** اجرا می‌کند،
#    فراخوانی‌ها در همان پنجرهٔ یک‌دقیقه‌ای جمع می‌شوند و سقف پر می‌شود.
#
#    آن‌وقت `d.get('token','')` تهی برمی‌گردد و سنجهٔ بعدی
#    «order isolated (got=401 want=404)» می‌نویسد — پیامی که به
#    جداسازیِ سفارش اشاره می‌کند در حالی که مشکل ثبت‌نام است.
#
#    یعنی خودِ سازوکارِ «یک بار دیگر امتحان کن» شکست می‌ساخت.
CURL() {
  local raw code
  for _ in $(seq 1 12); do
    raw=$(curl -s -w ' %{http_code}' "$@")
    code=${raw##* }
    [ "$code" = "429" ] || { printf '%s' "${raw% *}"; return 0; }
    sleep 8
  done
  printf '%s' "${raw% *}"
}

chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# آزمون باید از هر وضعیتی اجرا شود.  هر دو مشتری آزمون و همهٔ سفارش‌ها و
# سبدهایشان پاک می‌شوند؛ بدون این، «سفارش‌های من» سفارش‌های اجراهای قبل را
# هم می‌شمرد و شکست‌های زنجیره‌ای می‌ساخت که هیچ‌کدام باگ نیستند.
PHONE=09120000001
PHONE2=09120000009
# ⚠️ `PHONE3` اینجا هم اعلام می‌شود، هرچند بخشِ ۱۹e پایین‌تر است.
#
#    پاک‌سازی در `trap` اجرا می‌شود؛ اگر شماره فقط پایین اعلام شده بود
#    و اجرا پیش از رسیدن به آنجا می‌افتاد، متغیر خالی می‌ماند و مشتریِ
#    مهمان جا می‌ماند.  نگهبانِ نشت دقیقاً همین را گرفت.
PHONE3=09120000008

# ⚠️ پاک‌سازی هم در **آغاز** و هم در **پایان** لازم است.
#
#    تا امروز فقط آغاز بود، یعنی این مجموعه هر بار دو مشتری‌اش را
#    برای همیشه جا می‌گذاشت.  و چون `e2e-cycles` هم همان شماره‌ها را
#    می‌خواست، ساختِ مشتری‌اش ۴۰۹ می‌گرفت، شناسه خالی می‌ماند و شش
#    سنجه‌اش با خطای کلید خارجی می‌افتاد — شکستی که هیچ ربطی به کد
#    نداشت و وقتِ زیادی صرفِ عیب‌یابی‌اش شد.
#
#    (`e2e-cycles` حالا شمارهٔ اختصاصیِ خودش را دارد، ولی جا گذاشتنِ
#    داده به‌هرحال غلط است: مجموعهٔ بعدی هرچه باشد نباید میراثِ این
#    یکی را ببیند.)
cleanup() {
  $C exec -T postgres psql -U postgres -d molido_ai -q -c "
    DELETE FROM \"OnlineOrder\" WHERE \"customerId\" IN
      (SELECT id FROM \"Customer\" WHERE phone IN ('$PHONE','$PHONE2','$PHONE3'));
    DELETE FROM \"Cart\" WHERE \"customerId\" IN
      (SELECT id FROM \"Customer\" WHERE phone IN ('$PHONE','$PHONE2','$PHONE3'));
    DELETE FROM \"Cart\" WHERE \"guestToken\" LIKE 'guest-test-%';
    DELETE FROM \"Customer\" WHERE phone IN ('$PHONE','$PHONE2','$PHONE3');
  " >/dev/null 2>&1
}
cleanup
trap cleanup EXIT

echo '--- 1) shop settings + warehouse ---'
curl -s -X POST $A/shop-admin/settings -H "$AU" -H "$JS" \
  -d '{"shopName":"Molido Shop","isOpen":true,"shippingFee":50000,"freeShippingOver":1000000,"warehouseId":"seed-warehouse"}' >/dev/null
chk "settings saved" "$(curl -s "$A/shop-admin/settings" -H "$AU" | P "int(float(d.get('shippingFee',0)))")" "50000"

echo '--- 2) publish two products online ---'
$C exec -T postgres psql -U postgres -d molido_ai -q -c \
  "UPDATE \"Product\" SET \"isOnline\"=true WHERE id IN ('seed-p1','seed-p3');" >/dev/null
chk "public catalogue" "$(curl -s "$A/shop/products" | P "len(d)")" "2"

echo '--- 3) catalogue needs no login ---'
chk "no auth required" "$(curl -s -o /dev/null -w '%{http_code}' "$A/shop/products")" "200"

echo '--- 4) offline product hidden ---'
chk "offline hidden" "$(curl -s "$A/shop/products" | P "len([p for p in d if p['id']=='seed-p2'])")" "0"

echo '--- 5) register ---'
R=$(CURL -X POST $A/shop/register -H "$JS" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"secret123\",\"firstName\":\"Reza\",\"lastName\":\"Ahmadi\"}")
CID=$(echo "$R" | P "d.get('id','')")
TOK=$(echo "$R" | P "d.get('token','')")
# توکن امضاشده جایگزین هدر شناسه شد؛ بدون آن هیچ مسیر مشتری کار نمی‌کند.
CA="Authorization: Bearer $TOK"
chk "token issued" "$([ -n "$TOK" ] && echo yes || echo no)" "yes"
chk "customer registered" "$(echo "$R" | P "'yes' if d.get('id') else 'no'")" "yes"

echo '--- 6) weak password rejected ---'
chk "short password rejected" "$(CURL -X POST $A/shop/register -H "$JS" \
  -d '{"phone":"09120000002","password":"12","firstName":"X"}' | P "d.get('statusCode')")" "400"

echo '--- 7) bad phone rejected ---'
chk "bad phone rejected" "$(CURL -X POST $A/shop/register -H "$JS" \
  -d '{"phone":"123","password":"secret123","firstName":"X"}' | P "d.get('statusCode')")" "400"

echo '--- 8) duplicate registration rejected ---'
chk "duplicate rejected" "$(CURL -X POST $A/shop/register -H "$JS" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"secret123\",\"firstName\":\"Reza\"}" | P "d.get('statusCode')")" "400"

echo '--- 9) login ---'
chk "login ok" "$(CURL -X POST $A/shop/login -H "$JS" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"secret123\"}" | P "'yes' if d.get('id') else 'no'")" "yes"

echo '--- 10) wrong password rejected ---'
chk "wrong password" "$(CURL -X POST $A/shop/login -H "$JS" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"nope\"}" | P "d.get('statusCode')")" "401"

echo '--- 11) add to cart ---'
CART=$(curl -s -X POST $A/shop/cart/items -H "$JS" -H "$CA" \
  -d '{"productId":"seed-p3","qty":2}')
chk "cart has item" "$(echo "$CART" | P "len(d.get('items',[]))")" "1"

echo '--- 12) adding same product merges ---'
CART=$(curl -s -X POST $A/shop/cart/items -H "$JS" -H "$CA" \
  -d '{"productId":"seed-p3","qty":1}')
chk "qty merged to 3" "$(echo "$CART" | P "int(float(d['items'][0]['qty']))")" "3"

echo '--- 13) offline product cannot be added ---'
chk "offline product blocked" "$(curl -s -X POST $A/shop/cart/items -H "$JS" -H "$CA" \
  -d '{"productId":"seed-p2","qty":1}' | P "d.get('statusCode')")" "404"

echo '--- 14) checkout without login rejected ---'
chk "anonymous checkout blocked" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $A/shop/checkout -H "$JS" -d '{}')" "401"

echo '--- 15) checkout ---'
O=$(curl -s -X POST $A/shop/checkout -H "$JS" -H "$CA" \
  -d '{"shipAddress":"Tehran, Valiasr St","receiverName":"Reza","receiverPhone":"09120000001","paymentMethod":"COD"}')
OID=$(echo "$O" | P "d.get('id','')")
chk "order placed" "$(echo "$O" | P "'yes' if d.get('orderNo') else 'no'")" "yes"

echo '--- 16) shipping fee applied (subtotal < 1m) ---'
chk "shipping fee" "$(echo "$O" | P "int(float(d.get('shippingFee',0)))")" "50000"

echo '--- 17) cart emptied after checkout ---'
chk "new empty cart" "$(curl -s "$A/shop/cart" -H "$CA" | P "len(d.get('items',[]))")" "0"

echo '--- 18) customer sees own order ---'
chk "my orders" "$(curl -s "$A/shop/my-orders" -H "$CA" | P "len(d)")" "1"

echo '--- 19) forged token rejected ---'
chk "forged token rejected" "$(curl -s -o /dev/null -w '%{http_code}' "$A/shop/my-orders/$OID" -H "Authorization: Bearer invalid.token.here")" "401"

echo '--- 19b) no token rejected ---'
chk "no token rejected" "$(curl -s -o /dev/null -w '%{http_code}' "$A/shop/my-orders/$OID")" "401"

echo '--- 19c) staff token rejected on shop ---'
chk "staff token rejected" "$(curl -s -o /dev/null -w '%{http_code}' "$A/shop/my-orders" -H "$AU")" "401"

echo '--- 19d) another customer cannot see the order ---'
TOK2=$(CURL -X POST $A/shop/register -H "$JS"   -d "{\"phone\":\"$PHONE2\",\"password\":\"secret123\",\"firstName\":\"Other\"}" | P "d.get('token','')")
chk "order isolated" "$(curl -s -o /dev/null -w '%{http_code}' "$A/shop/my-orders/$OID" -H "Authorization: Bearer $TOK2")" "404"

echo '--- 19e) guest cart merges on login ---'
GUEST="guest-test-$$"
PHONE3=09120000008
$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  DELETE FROM \"Cart\" WHERE \"guestToken\" LIKE 'guest-test-%';
  DELETE FROM \"Customer\" WHERE phone='$PHONE3';" >/dev/null 2>&1

# مهمان کالا در سبد می‌گذارد
curl -s -X POST $A/shop/cart/items -H "$JS" -H "x-guest-token: $GUEST"   -d '{"productId":"seed-p1","qty":2}' >/dev/null

# ثبت‌نام و ورود با همان کلید مهمان
CURL -X POST $A/shop/register -H "$JS"   -d "{\"phone\":\"$PHONE3\",\"password\":\"secret123\",\"firstName\":\"Guest\"}" >/dev/null
TOK3=$(CURL -X POST $A/shop/login -H "$JS" -H "x-guest-token: $GUEST"   -d "{\"phone\":\"$PHONE3\",\"password\":\"secret123\"}" | P "d.get('token','')")

chk "guest cart carried over" "$(curl -s "$A/shop/cart" -H "Authorization: Bearer $TOK3" | P "len(d.get('items',[]))")" "1"

echo '--- 20) confirm => SalesOrder created ---'
CF=$(curl -s -X POST "$A/shop-admin/orders/$OID/confirm" -H "$AU" -H "$JS" -d '{}')
chk "sales order created" "$(echo "$CF" | P "'yes' if d.get('salesOrderId') else 'no'")" "yes"
chk "linked back" "$(Q "SELECT count(*) FROM \"OnlineOrder\" WHERE id='$OID' AND \"salesOrderId\" IS NOT NULL;")" "1"
chk "sales order items" "$(Q "SELECT count(*) FROM \"SalesOrderItem\" WHERE \"orderId\"=(SELECT \"salesOrderId\" FROM \"OnlineOrder\" WHERE id='$OID');")" "1"

echo '--- 21) confirming twice rejected ---'
chk "double confirm rejected" "$(curl -s -X POST "$A/shop-admin/orders/$OID/confirm" -H "$AU" -H "$JS" -d '{}' | P "d.get('statusCode')")" "400"

echo '--- 22) trial balance untouched ---'
chk "trial balance" "$(Q "SELECT COALESCE(SUM(l.debit)-SUM(l.credit),0)::bigint FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\" WHERE e.status<>'DRAFT';")" "0"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
