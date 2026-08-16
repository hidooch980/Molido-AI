#!/usr/bin/env bash
#
# سفارش آنلاین: از ثبت توسط مشتری تا تحویل توسط فروشگاه.
#
# این زنجیره تا امروز بک‌اند داشت ولی هیچ صفحه‌ای صدایش نمی‌زد — یعنی
# مشتری سفارش می‌داد و هیچ‌کس در پنل نمی‌دیدش.  آزمون همان مسیری را
# می‌رود که کارمند فروشگاه در صفحهٔ «سفارش‌های آنلاین» طی می‌کند.
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
T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json'   -d '{"email":"admin@molido.ai","password":"'"$PW"'"}'   | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))")}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق — سقف ورود خورده یا سرویس بالا نیست"
  exit 1
fi
AU="Authorization: Bearer $T"; JS="Content-Type: application/json"
P() { python3 -c "import sys,json,io;sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8');sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');d=json.load(sys.stdin);print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql() { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

# وضعیت شناخته
psql "DELETE FROM \"OnlineOrderItem\" WHERE \"orderId\" IN
        (SELECT id FROM \"OnlineOrder\" WHERE \"receiverName\" LIKE 'TEST-%');
      DELETE FROM \"OnlineOrder\" WHERE \"receiverName\" LIKE 'TEST-%';
      DELETE FROM \"Customer\" WHERE phone = '09129998888';
      UPDATE \"Inventory\" SET quantity = 10000 WHERE \"productId\" LIKE 'seed-%';
      UPDATE \"Product\" SET \"isOnline\" = true WHERE id = 'seed-p3';"

echo '--- 1) customer registers and fills a cart ---'
REG=$(curl -s -X POST $A/shop/register -H "$JS" \
  -d '{"firstName":"Test","lastName":"Buyer","phone":"09129998888","password":"test1234"}')
CT=$(echo "$REG" | P "d.get('token','')")
chk "registered" "$([ -n "$CT" ] && echo yes || echo no)" "yes"
CU="Authorization: Bearer $CT"

curl -s -X POST $A/shop/cart/items -H "$CU" -H "$JS" \
  -d '{"productId":"seed-p3","qty":3}' >/dev/null
chk "cart has the item" "$(curl -s $A/shop/cart -H "$CU" | P "len(d.get('items',[]))")" "1"

echo '--- 2) checkout creates an order ---'
ORD=$(curl -s -X POST $A/shop/checkout -H "$CU" -H "$JS" \
  -d '{"receiverName":"TEST-Buyer","receiverPhone":"09129998888","shipAddress":"TEST address 12"}')
OID=$(echo "$ORD" | P "d.get('id','')")
chk "order created" "$([ -n "$OID" ] && echo yes || echo no)" "yes"
chk "starts as PLACED" "$(psqlv "SELECT status FROM \"OnlineOrder\" WHERE id='$OID'")" "PLACED"

echo '--- 3) staff can see it in the panel ---'
# این همان چیزی است که تا امروز نبود.
LIST=$(curl -s "$A/shop-admin/orders" -H "$AU")
chk "visible to staff"   "$(echo "$LIST" | P "'yes' if any(o['id']=='$OID' for o in d) else 'no'")" "yes"
chk "shows item count"   "$(echo "$LIST" | P "[int(o['itemCount']) for o in d if o['id']=='$OID'][0]")" "1"
chk "shows receiver"     "$(echo "$LIST" | P "[o['receiverName'] for o in d if o['id']=='$OID'][0]")" "TEST-Buyer"

chk "counted as new"     "$(curl -s "$A/shop-admin/stats" -H "$AU" | P "'yes' if int(d['newOrders']) >= 1 else 'no'")" "yes"

echo '--- 4) status filter works ---'
chk "PLACED filter finds it" "$(curl -s "$A/shop-admin/orders?status=PLACED" -H "$AU" \
  | P "'yes' if any(o['id']=='$OID' for o in d) else 'no'")" "yes"
chk "DELIVERED filter does not" "$(curl -s "$A/shop-admin/orders?status=DELIVERED" -H "$AU" \
  | P "'yes' if any(o['id']=='$OID' for o in d) else 'no'")" "no"

echo '--- 5) detail carries what packing needs ---'
DET=$(curl -s "$A/shop-admin/orders/$OID" -H "$AU")
chk "has address"  "$(echo "$DET" | P "d.get('shipAddress','')")" "TEST address 12"
chk "has items"    "$(echo "$DET" | P "len(d.get('items',[]))")" "1"
chk "item qty"     "$(echo "$DET" | P "int(float(d['items'][0]['qty']))")" "3"

echo '--- 6) confirming hands the order to the sales chain ---'
# تأیید، **سفارش فروش** می‌سازد نه فاکتور.  کسر موجودی و سند حسابداری در
# مرحلهٔ صدور فاکتور اتفاق می‌افتد؛ اینجا فقط سفارش وارد زنجیرهٔ موجود
# می‌شود.  انتظارِ کسر موجودی در همین لحظه، انتظار غلطی است.
curl -s -X POST "$A/shop-admin/orders/$OID/confirm" -H "$AU" -H "$JS" >/dev/null
chk "now CONFIRMED" "$(psqlv "SELECT status FROM \"OnlineOrder\" WHERE id='$OID'")" "CONFIRMED"
chk "sales order linked" "$(psqlv "SELECT CASE WHEN \"salesOrderId\" IS NULL THEN 'no' ELSE 'yes' END FROM \"OnlineOrder\" WHERE id='$OID'")" "yes"
chk "sales order has the item" "$(psqlv "SELECT COUNT(*) FROM \"SalesOrderItem\" WHERE \"orderId\" = (SELECT \"salesOrderId\" FROM \"OnlineOrder\" WHERE id='$OID')")" "1"
chk "double confirm refused" "$(curl -s -X POST "$A/shop-admin/orders/$OID/confirm" -H "$AU" -H "$JS" | P "d.get('statusCode')")" "400"

echo '--- 7) the whole status chain ---'
adv() { curl -s -X PATCH "$A/shop-admin/orders/$OID/status" -H "$AU" -H "$JS" \
  -d "{\"status\":\"$1\"}" >/dev/null; psqlv "SELECT status FROM \"OnlineOrder\" WHERE id='$OID'"; }
chk "-> PREPARING" "$(adv PREPARING)" "PREPARING"
chk "-> SHIPPED"   "$(adv SHIPPED)"   "SHIPPED"
chk "-> DELIVERED" "$(adv DELIVERED)" "DELIVERED"

echo '--- 8) a delivered order is final ---'
# بدون این، یک کلیک اشتباه سفارشِ تحویل‌شده را دوباره باز می‌کند.
chk "cannot reopen" "$(curl -s -X PATCH "$A/shop-admin/orders/$OID/status" -H "$AU" -H "$JS" \
  -d '{"status":"PREPARING"}' | P "d.get('statusCode')")" "400"
chk "stays DELIVERED" "$(psqlv "SELECT status FROM \"OnlineOrder\" WHERE id='$OID'")" "DELIVERED"

echo '--- 9) customer sees their own order only ---'
chk "customer sees it" "$(curl -s "$A/shop/my-orders" -H "$CU" \
  | P "'yes' if any(o['id']=='$OID' for o in d) else 'no'")" "yes"
chk "no token, no orders" "$(curl -s "$A/shop/my-orders" | P "d.get('statusCode')")" "401"

# پاک‌سازی
psql "DELETE FROM \"SalesOrderItem\" WHERE \"orderId\" IN
        (SELECT \"salesOrderId\" FROM \"OnlineOrder\" WHERE id='$OID');
      DELETE FROM \"SalesOrder\" WHERE id IN
        (SELECT \"salesOrderId\" FROM \"OnlineOrder\" WHERE id='$OID');
      DELETE FROM \"OnlineOrderItem\" WHERE \"orderId\"='$OID';
      DELETE FROM \"OnlineOrder\" WHERE id='$OID';
      DELETE FROM \"Customer\" WHERE phone='09129998888';
      UPDATE \"Inventory\" SET quantity = 10000 WHERE \"productId\" LIKE 'seed-%';"

echo
echo '--- 10) DTO و محدودیت دیتابیس هم‌گام‌اند ---'
# نامِ حدس‌زده در DTO، درخواستِ درستِ کاربر را رد می‌کند و علتش هیچ‌جا
# پیدا نیست.  دقیقاً همین رخ داد: DTO تازه `address` می‌خواست در حالی
# که کلاینت `shipAddress` می‌فرستد، و ثبت هر سفارشی ۴۰۰ گرفت.
for st in PLACED CONFIRMED PREPARING SHIPPED DELIVERED CANCELLED; do
  grep -q "'$st'" backend/src/shop/dto/shop.dto.ts || MISSING="$MISSING $st"
done
chk "وضعیت‌های CHECK در DTO هستند" "${MISSING:-none}" "none"

echo '--- 11) میدان‌های واقعی تسویه پذیرفته می‌شوند ---'
# اگر DTO میدانی را نشناسد، forbidNonWhitelisted با ۴۰۰ ردش می‌کند —
# روی مسیری که مشتری واقعی هر روز صدایش می‌زند.
# شمارهٔ ماندهٔ اجرای قبلی، ثبت‌نام را رد می‌کند و آزمون را با پیامی
# می‌شکند که ربطی به موضوعش ندارد.  پس اول پاک می‌شود.
CLEAN_PHONE='09121110000'
psql "DELETE FROM \"CartItem\" WHERE \"cartId\" IN
        (SELECT id FROM \"Cart\" WHERE \"customerId\" IN
           (SELECT id FROM \"Customer\" WHERE phone='$CLEAN_PHONE'));
      DELETE FROM \"Cart\" WHERE \"customerId\" IN
        (SELECT id FROM \"Customer\" WHERE phone='$CLEAN_PHONE');
      DELETE FROM \"OnlineOrderItem\" WHERE \"orderId\" IN
        (SELECT id FROM \"OnlineOrder\" WHERE \"customerId\" IN
           (SELECT id FROM \"Customer\" WHERE phone='$CLEAN_PHONE'));
      DELETE FROM \"OnlineOrder\" WHERE \"customerId\" IN
        (SELECT id FROM \"Customer\" WHERE phone='$CLEAN_PHONE');
      DELETE FROM \"Customer\" WHERE phone='$CLEAN_PHONE';"

CU2=$(curl -s -X POST $A/shop/register -H "$JS"   -d '{"firstName":"DTO","lastName":"Check","phone":"09121110000","password":"Shop-Pass-1"}'   | P "d.get('token') or d.get('accessToken','')")
if [ -n "$CU2" ]; then
  A2="Authorization: Bearer $CU2"
  curl -s -X POST $A/shop/cart/items -H "$A2" -H "$JS" -d '{"productId":"seed-p3","qty":1}' >/dev/null
  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST $A/shop/checkout -H "$A2" -H "$JS"     -d '{"receiverName":"X","receiverPhone":"09121110000","shipAddress":"A","paymentMethod":"COD"}')
  chk "تسویه با میدان‌های واقعی" "$CODE" "201"
  psql "DELETE FROM \"CartItem\" WHERE \"cartId\" IN
          (SELECT id FROM \"Cart\" WHERE \"customerId\" IN
             (SELECT id FROM \"Customer\" WHERE phone='$CLEAN_PHONE'));
        DELETE FROM \"Cart\" WHERE \"customerId\" IN
          (SELECT id FROM \"Customer\" WHERE phone='$CLEAN_PHONE');
        DELETE FROM \"OnlineOrderItem\" WHERE \"orderId\" IN
          (SELECT id FROM \"OnlineOrder\" WHERE \"customerId\" IN
             (SELECT id FROM \"Customer\" WHERE phone='$CLEAN_PHONE'));
        DELETE FROM \"OnlineOrder\" WHERE \"customerId\" IN
          (SELECT id FROM \"Customer\" WHERE phone='$CLEAN_PHONE');
        DELETE FROM \"Customer\" WHERE phone='$CLEAN_PHONE';"
else
  chk "تسویه با میدان‌های واقعی" "ثبت‌نام نشد" "201"
fi

printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
