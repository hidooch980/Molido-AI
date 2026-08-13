#!/usr/bin/env bash
#
# فروشگاه اینترنتی: کاتالوگ عمومی، حساب مشتری، سبد، تسویه، و تبدیل به
# سفارش فروش.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=http://localhost:3000
C="docker compose -f docker-compose.yml -f docker-compose.store.yml"

T=$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@molido.ai","password":"admin123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
AU="Authorization: Bearer $T"; JS="Content-Type: application/json"
P() { python3 -c "import sys,json,io;sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');d=json.load(sys.stdin);print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -t -c "$1" | tr -d ' \r\n'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# آزمون باید از هر وضعیتی اجرا شود
PHONE=09120000001
$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  DELETE FROM \"OnlineOrder\" WHERE \"customerId\" IN (SELECT id FROM \"Customer\" WHERE phone='$PHONE');
  DELETE FROM \"Cart\" WHERE \"customerId\" IN (SELECT id FROM \"Customer\" WHERE phone='$PHONE');
  DELETE FROM \"Customer\" WHERE phone='$PHONE';
" >/dev/null 2>&1

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
R=$(curl -s -X POST $A/shop/register -H "$JS" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"secret123\",\"firstName\":\"Reza\",\"lastName\":\"Ahmadi\"}")
CID=$(echo "$R" | P "d.get('id','')")
chk "customer registered" "$(echo "$R" | P "'yes' if d.get('id') else 'no'")" "yes"

echo '--- 6) weak password rejected ---'
chk "short password rejected" "$(curl -s -X POST $A/shop/register -H "$JS" \
  -d '{"phone":"09120000002","password":"12","firstName":"X"}' | P "d.get('statusCode')")" "400"

echo '--- 7) bad phone rejected ---'
chk "bad phone rejected" "$(curl -s -X POST $A/shop/register -H "$JS" \
  -d '{"phone":"123","password":"secret123","firstName":"X"}' | P "d.get('statusCode')")" "400"

echo '--- 8) duplicate registration rejected ---'
chk "duplicate rejected" "$(curl -s -X POST $A/shop/register -H "$JS" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"secret123\",\"firstName\":\"Reza\"}" | P "d.get('statusCode')")" "400"

echo '--- 9) login ---'
chk "login ok" "$(curl -s -X POST $A/shop/login -H "$JS" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"secret123\"}" | P "'yes' if d.get('id') else 'no'")" "yes"

echo '--- 10) wrong password rejected ---'
chk "wrong password" "$(curl -s -X POST $A/shop/login -H "$JS" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"nope\"}" | P "d.get('statusCode')")" "401"

echo '--- 11) add to cart ---'
CART=$(curl -s -X POST $A/shop/cart/items -H "$JS" -H "x-customer-id: $CID" \
  -d '{"productId":"seed-p3","qty":2}')
chk "cart has item" "$(echo "$CART" | P "len(d.get('items',[]))")" "1"

echo '--- 12) adding same product merges ---'
CART=$(curl -s -X POST $A/shop/cart/items -H "$JS" -H "x-customer-id: $CID" \
  -d '{"productId":"seed-p3","qty":1}')
chk "qty merged to 3" "$(echo "$CART" | P "int(float(d['items'][0]['qty']))")" "3"

echo '--- 13) offline product cannot be added ---'
chk "offline product blocked" "$(curl -s -X POST $A/shop/cart/items -H "$JS" -H "x-customer-id: $CID" \
  -d '{"productId":"seed-p2","qty":1}' | P "d.get('statusCode')")" "404"

echo '--- 14) checkout without login rejected ---'
chk "anonymous checkout blocked" "$(curl -s -X POST $A/shop/checkout -H "$JS" -d '{}' | P "d.get('statusCode')")" "401"

echo '--- 15) checkout ---'
O=$(curl -s -X POST $A/shop/checkout -H "$JS" -H "x-customer-id: $CID" \
  -d '{"shipAddress":"Tehran, Valiasr St","receiverName":"Reza","receiverPhone":"09120000001","paymentMethod":"COD"}')
OID=$(echo "$O" | P "d.get('id','')")
chk "order placed" "$(echo "$O" | P "'yes' if d.get('orderNo') else 'no'")" "yes"

echo '--- 16) shipping fee applied (subtotal < 1m) ---'
chk "shipping fee" "$(echo "$O" | P "int(float(d.get('shippingFee',0)))")" "50000"

echo '--- 17) cart emptied after checkout ---'
chk "new empty cart" "$(curl -s "$A/shop/cart" -H "x-customer-id: $CID" | P "len(d.get('items',[]))")" "0"

echo '--- 18) customer sees own order ---'
chk "my orders" "$(curl -s "$A/shop/my-orders" -H "x-customer-id: $CID" | P "len(d)")" "1"

echo '--- 19) other customer cannot see it ---'
chk "order isolated" "$(curl -s -o /dev/null -w '%{http_code}' "$A/shop/my-orders/$OID" -H "x-customer-id: 00000000-0000-0000-0000-000000000000")" "404"

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
