#!/usr/bin/env bash
#
# رستوران: میز، منو، سفارش‌گیری، آشپزخانه و تسویه.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند.
#
# ⚠️ این آزمون به محصولی نیاز دارد که قابلیت `restaurant` داشته باشد.
#    در نصب `store` ماژول رستوران بالا نمی‌آید و همهٔ مسیرها ۴۰۴ می‌دهند.

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
Q() { $C exec -T postgres psql -U postgres -d molido_ai -t -c "$1" | tr -d ' \r\n'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# ماژول رستوران در این محصول هست؟
if [ "$(curl -s -o /dev/null -w '%{http_code}' "$A/restaurant/stats" -H "$AU")" = "404" ]; then
  echo "  ماژول رستوران در این محصول فعال نیست (MOLIDO_PRODUCT=store)"
  echo "  برای آزمون: MOLIDO_PRODUCT=resto یا suite"
  echo
  printf "   PASS: 0   FAIL: 0   SKIPPED\n"
  exit 0
fi

echo '--- 1) area + table ---'
AR=$(curl -s -X POST $A/restaurant/areas -H "$AU" -H "$JS" -d '{"name":"Main Hall"}')
ARID=$(echo "$AR" | P "d.get('id','')")
chk "area created" "$(echo "$AR" | P "'yes' if d.get('id') else 'no'")" "yes"

TB=$(curl -s -X POST $A/restaurant/tables -H "$AU" -H "$JS" \
  -d "{\"tableNo\":\"T-99\",\"capacity\":4,\"areaId\":\"$ARID\"}")
TBID=$(echo "$TB" | P "d.get('id','')")
chk "table created" "$(echo "$TB" | P "d.get('status')")" "FREE"

echo '--- 2) menu category + item ---'
MC=$(curl -s -X POST $A/restaurant/menu-categories -H "$AU" -H "$JS" -d '{"name":"Drinks"}')
MCID=$(echo "$MC" | P "d.get('id','')")

MI=$(curl -s -X POST $A/restaurant/menu-items -H "$AU" -H "$JS" \
  -d "{\"name\":\"Tea\",\"price\":80000,\"categoryId\":\"$MCID\",\"station\":\"BAR\"}")
MIID=$(echo "$MI" | P "d.get('id','')")
chk "menu item created" "$(echo "$MI" | P "'yes' if d.get('id') else 'no'")" "yes"

echo '--- 3) create order on table ---'
O=$(curl -s -X POST $A/restaurant/orders -H "$AU" -H "$JS" -d "{
  \"type\":\"DINE_IN\",\"tableId\":\"$TBID\",\"guestCount\":2,
  \"items\":[{\"menuItemId\":\"$MIID\",\"qty\":2}]}")
OID=$(echo "$O" | P "d.get('id','')")
chk "order created" "$(echo "$O" | P "'yes' if d.get('orderNo') else 'no'")" "yes"
chk "order total" "$(echo "$O" | P "int(float(d.get('total',0)))")" "160000"

echo '--- 4) table becomes occupied ---'
chk "table occupied" "$(Q "SELECT status FROM \"RestaurantTable\" WHERE id='$TBID';")" "OCCUPIED"

echo '--- 5) add item to open order ---'
curl -s -X POST "$A/restaurant/orders/$OID/items" -H "$AU" -H "$JS" \
  -d "{\"items\":[{\"menuItemId\":\"$MIID\",\"qty\":1}]}" >/dev/null
chk "total after add" "$(Q "SELECT total::bigint FROM \"RestaurantOrder\" WHERE id='$OID';")" "240000"

echo '--- 6) send to kitchen ---'
curl -s -X POST "$A/restaurant/orders/$OID/send-to-kitchen" -H "$AU" -H "$JS" -d '{}' >/dev/null
chk "order in kitchen" "$(Q "SELECT status FROM \"RestaurantOrder\" WHERE id='$OID';")" "IN_KITCHEN"
# هر بار افزودن، ردیف جدا می‌سازد — درست است: آشپز باید بداند کدام قلم
# چه زمانی سفارش داده شده، نه اینکه عددی که وسط پخت زیاد شده را ببیند.
chk "kitchen shows items" "$(curl -s "$A/restaurant/kitchen" -H "$AU" | P "len([i for i in d if i.get('orderId')=='$OID'])")" "2"

echo '--- 7) settle order ---'
S=$(curl -s -X POST "$A/restaurant/orders/$OID/settle" -H "$AU" -H "$JS" \
  -d '{"paidAmount":240000,"paymentMethod":"CASH"}')
chk "settled" "$(Q "SELECT status FROM \"RestaurantOrder\" WHERE id='$OID';")" "PAID"

echo '--- 8) table freed or cleaning ---'
chk "table released" "$(Q "SELECT CASE WHEN status IN ('FREE','CLEANING') THEN 'yes' ELSE status END FROM \"RestaurantTable\" WHERE id='$TBID';")" "yes"

echo '--- 9) settling twice rejected ---'
chk "double settle rejected" "$(curl -s -X POST "$A/restaurant/orders/$OID/settle" -H "$AU" -H "$JS" \
  -d '{"paidAmount":240000,"paymentMethod":"CASH"}' | P "d.get('statusCode')")" "400"

echo '--- 10) trial balance still zero ---'
chk "trial balance" "$(Q "SELECT COALESCE(SUM(l.debit)-SUM(l.credit),0)::bigint FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\" WHERE e.status<>'DRAFT';")" "0"

# پاک‌سازی تا اجرای بعدی روی «شماره میز تکراری» نشکند
$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  DELETE FROM \"RestaurantTable\" WHERE \"tableNo\"='T-99';
  DELETE FROM \"MenuItem\" WHERE name='Tea';
  DELETE FROM \"MenuCategory\" WHERE name='Drinks';
  DELETE FROM \"RestaurantArea\" WHERE name='Main Hall';
" >/dev/null 2>&1

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
