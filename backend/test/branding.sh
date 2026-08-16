#!/usr/bin/env bash
#
# هویت شرکت روی اسناد.
#
# فاکتوری که به دست مشتری می‌رسد باید بگوید از کدام فروشگاه است.  تا امروز
# فاکتور چاپی هیچ نام شرکتی نداشت.
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
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

ORIG=$(psqlv "SELECT name FROM \"Company\" LIMIT 1")
WH=$(curl -s "$A/warehouses" -H "$AU" | P "d[0]['id']")
$C exec -T postgres psql -U postgres -d molido_ai -q -c \
  "UPDATE \"Inventory\" SET quantity = 10000 WHERE \"productId\" LIKE 'seed-%'" >/dev/null 2>&1

echo '--- 1) company profile is readable ---'
CO=$(curl -s "$A/company" -H "$AU")
chk "has a name"      "$(echo "$CO" | P "'yes' if d.get('name') else 'no'")" "yes"
chk "has tax number field" "$(echo "$CO" | P "'yes' if 'taxNumber' in d else 'no'")" "yes"

echo '--- 2) it can be changed ---'
curl -s -X PATCH $A/company -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Shop","legalName":"TEST-Shop Legal Co","address":"Tehran, Azadi St 10","phone":"02155667788","taxNumber":"411222333"}' >/dev/null
chk "name saved"  "$(curl -s "$A/company" -H "$AU" | P "d['name']")" "TEST-Shop"
chk "tax saved"   "$(curl -s "$A/company" -H "$AU" | P "d['taxNumber']")" "411222333"

echo '--- 3) the printed invoice carries it ---'
SID=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" \
  -d "{\"warehouseId\":\"$WH\",\"items\":[{\"productId\":\"seed-p3\",\"quantity\":1}]}" | P "d['id']")
INV=$(curl -s "$A/sales/$SID/print" -H "$AU")

chk "shows legal name" "$(printf '%s' "$INV" | grep -c 'TEST-Shop Legal Co')" "1"
chk "shows address"    "$(printf '%s' "$INV" | grep -c 'Azadi St 10')" "1"
chk "shows phone"      "$(printf '%s' "$INV" | grep -c '02155667788')" "1"
chk "shows tax number" "$(printf '%s' "$INV" | grep -c '411222333')" "1"

echo '--- 4) HTML in company data cannot break the invoice ---'
# نام شرکت را کاربر وارد می‌کند و مستقیم داخل قالب می‌نشیند؛ بدون فرار،
# یک «<» کل فاکتور را می‌شکند یا اسکریپت اجرا می‌کند.
#
# روی `legalName` آزموده می‌شود چون سربرگ همان را ترجیح می‌دهد؛ آزمودن
# `name` وقتی `legalName` پر است، هیچ‌چیز را نمی‌سنجد.
curl -s -X PATCH $A/company -H "$AU" -H "$JS" \
  -d '{"legalName":"<script>alert(1)</script>"}' >/dev/null
INJ=$(curl -s "$A/sales/$SID/print" -H "$AU")
chk "script tag escaped"     "$(printf '%s' "$INJ" | grep -c '&lt;script&gt;')" "1"
chk "no raw script tag"      "$(printf '%s' "$INJ" | grep -c '<script>alert')" "0"

# بازگرداندن
curl -s -X PATCH $A/company -H "$AU" -H "$JS" \
  -d "{\"name\":\"$ORIG\",\"legalName\":null,\"address\":null,\"phone\":null,\"taxNumber\":null}" >/dev/null
$C exec -T postgres psql -U postgres -d molido_ai -q -c \
  "DELETE FROM \"SaleItem\" WHERE \"saleId\"='$SID';
   DELETE FROM \"Payment\" WHERE \"saleId\"='$SID';
   DELETE FROM \"Sale\" WHERE id='$SID';" >/dev/null 2>&1

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
