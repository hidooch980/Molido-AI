#!/usr/bin/env bash
#
# تعاریف پایه: حساب بانکی، صندوق، انبار.
#
# تا امروز این‌ها فقط با نوشتن مستقیم در دیتابیس ساخته می‌شدند — صفحهٔ
# خزانه حساب‌ها را نشان می‌داد ولی راهی برای ساختنشان نداشت.
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
P() { python3 -c "import sys,json,io;sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');d=json.load(sys.stdin);print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psql() { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

psql "DELETE FROM \"TreasuryAccount\" WHERE name LIKE 'TEST-%';
      DELETE FROM \"CashBox\" WHERE name LIKE 'TEST-%';
      DELETE FROM \"Warehouse\" WHERE name LIKE 'TEST-%';"

echo '--- 1) bank account can be created from the API ---'
ACC=$(curl -s -X POST $A/treasury/accounts -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Melli","type":"BANK","bankName":"Melli","accountNo":"0102030405","iban":"IR120170000000000102030405","openingBalance":5000000}')
AID=$(echo "$ACC" | P "d.get('id','')")
chk "created"          "$([ -n "$AID" ] && echo yes || echo no)" "yes"
chk "opening balance"  "$(psqlv "SELECT balance::int FROM \"TreasuryAccount\" WHERE id='$AID'")" "5000000"
chk "iban stored"      "$(psqlv "SELECT iban FROM \"TreasuryAccount\" WHERE id='$AID'")" "IR120170000000000102030405"
chk "listed"           "$(curl -s "$A/treasury/accounts" -H "$AU" | P "'yes' if any(a['id']=='$AID' for a in d) else 'no'")" "yes"

echo '--- 2) cash and fund are separate types in the same table ---'
PID=$(curl -s -X POST $A/treasury/accounts -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Petty","type":"CASH"}' | P "d.get('id','')")
chk "type stored" "$(psqlv "SELECT type FROM \"TreasuryAccount\" WHERE id='$PID'")" "CASH"
# نوع نامعتبر باید رد شود، وگرنه گزارش خزانه دسته‌ای می‌سازد که هیچ‌جا
# تعریف نشده و در جمع‌ها گم می‌شود.
chk "invalid type refused" "$(curl -s -X POST $A/treasury/accounts -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Bad","type":"NOPE"}' | P "d.get('statusCode')")" "400"

echo '--- 3) cash box needs a unique code ---'
BOX=$(curl -s -X POST $A/cashbox -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Register1","code":"TEST-R1","balance":200000}')
BID=$(echo "$BOX" | P "d.get('id','')")
chk "box created"  "$([ -n "$BID" ] && echo yes || echo no)" "yes"
chk "box balance"  "$(psqlv "SELECT balance::int FROM \"CashBox\" WHERE id='$BID'")" "200000"

# کد تکراری باید رد شود؛ دو صندوق با یک کد یعنی کسری روی هم می‌افتد.
DUP=$(curl -s -X POST $A/cashbox -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Register2","code":"TEST-R1"}' | P "d.get('statusCode', 201)")
chk "duplicate code refused" "$([ "$DUP" = "201" ] && echo no || echo yes)" "yes"

echo '--- 4) warehouse ---'
WID=$(curl -s -X POST $A/warehouses -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Store2","code":"TEST-W2"}' | P "d.get('id','')")
chk "warehouse created" "$([ -n "$WID" ] && echo yes || echo no)" "yes"
chk "shows sku count"   "$(curl -s "$A/warehouses" -H "$AU" \
  | P "[int(w.get('skuCount',0)) for w in d if w['id']=='$WID'][0]")" "0"

echo '--- 5) name is required ---'
# ۴۰۰ صریح، نه «هر خطایی».  شرط شلِ «آیا statusCode دارد» یک ۵۰۰ واقعی را
# هم قبول می‌کرد — و دقیقاً همین اتفاق افتاده بود: نام خالی انبار تا لایهٔ
# دیتابیس می‌رفت و آنجا با نقض NOT NULL می‌شکست.
chk "empty account name refused" "$(curl -s -X POST $A/treasury/accounts -H "$AU" -H "$JS" \
  -d '{"name":""}' | P "d.get('statusCode')")" "400"
chk "empty warehouse name refused" "$(curl -s -X POST $A/warehouses -H "$AU" -H "$JS" \
  -d '{"name":""}' | P "d.get('statusCode')")" "400"

echo '--- 5b) a warehouse without a code still works ---'
# ستون `code` در دیتابیس NOT NULL است؛ اگر کاربر ندهد باید ساخته شود، نه
# اینکه ۵۰۰ بگیرد.  فرم نباید کاربر را سر یک میدان بی‌اهمیت متوقف کند.
NOCODE=$(curl -s -X POST $A/warehouses -H "$AU" -H "$JS" -d '{"name":"TEST-NoCode"}')
chk "created without code" "$(echo "$NOCODE" | P "'yes' if d.get('id') else 'no'")" "yes"
chk "code generated"       "$(echo "$NOCODE" | P "'yes' if d.get('code') else 'no'")" "yes"

echo '--- 6) a warehouse holding stock cannot be deleted ---'
# بدون این، حذف انبار کالاها را بی‌جا می‌کند و موجودی گم می‌شود.
psql "INSERT INTO \"Inventory\" (id, \"productId\", \"warehouseId\", quantity)
      VALUES ('test-inv-1', 'seed-p3', '$WID', 5);"
chk "delete refused" "$(curl -s -X DELETE "$A/warehouses/$WID" -H "$AU" | P "d.get('statusCode')")" "400"

psql "DELETE FROM \"Inventory\" WHERE id='test-inv-1';"
chk "delete allowed when empty" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$A/warehouses/$WID" -H "$AU")" "200"

# پاک‌سازی
psql "DELETE FROM \"TreasuryAccount\" WHERE name LIKE 'TEST-%';
      DELETE FROM \"CashBox\" WHERE name LIKE 'TEST-%';
      DELETE FROM \"Warehouse\" WHERE name LIKE 'TEST-%';"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
