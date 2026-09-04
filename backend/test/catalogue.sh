#!/usr/bin/env bash
#
# دسته‌بندی درختی، انبار، و شمارهٔ سریال.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند و خطای کاذب می‌سازد.

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

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# پاک‌سازی تا آزمون تکرارپذیر بماند
$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  DELETE FROM \"SerialNumber\" WHERE serial LIKE 'TEST-%';
  UPDATE \"Product\" SET \"categoryId\" = NULL
    WHERE \"categoryId\" IN (SELECT id FROM \"Category\" WHERE name LIKE 'TEST-%');
  DELETE FROM \"Category\"  WHERE name LIKE 'TEST-%';
  DELETE FROM \"Inventory\" WHERE \"warehouseId\" IN
    (SELECT id FROM \"Warehouse\" WHERE name LIKE 'TEST-%');
  DELETE FROM \"Warehouse\" WHERE name LIKE 'TEST-%';
" >/dev/null 2>&1

# ============================================================ دسته‌بندی
echo '--- 1) create a three-level tree ---'
mk() { curl -s -X POST $A/categories -H "$AU" -H "$JS" -d "$1" | P "d.get('id','')"; }
ROOT=$(mk '{"name":"TEST-Drinks"}')
MID=$(mk  "{\"name\":\"TEST-Soda\",\"parentId\":\"$ROOT\"}")
LEAF=$(mk "{\"name\":\"TEST-Can\",\"parentId\":\"$MID\"}")
chk "root created" "$([ -n "$ROOT" ] && echo yes || echo no)" "yes"
chk "leaf created" "$([ -n "$LEAF" ] && echo yes || echo no)" "yes"

echo '--- 2) tree is nested, not flat ---'
tree() { curl -s "$A/categories/tree" -H "$AU" | P "$1"; }
chk "root has 1 child"  "$(tree "len([c for c in d if c['id']=='$ROOT'][0]['children'])")" "1"
chk "child has 1 child" "$(tree "len([c for c in d if c['id']=='$ROOT'][0]['children'][0]['children'])")" "1"
chk "leaf not at root"  "$(tree "'yes' if not [c for c in d if c['id']=='$LEAF'] else 'no'")" "yes"

echo '--- 3) cycle is rejected ---'
# ریشه را زیر نوهٔ خودش می‌بریم؛ اگر بپذیرد درخت حلقه می‌شود و پیمایش
# برای همیشه می‌چرخد.
chk "cycle rejected" "$(curl -s -X PATCH "$A/categories/$ROOT" -H "$AU" -H "$JS" \
  -d "{\"parentId\":\"$LEAF\"}" | P "d.get('statusCode')")" "400"
chk "self parent rejected" "$(curl -s -X PATCH "$A/categories/$ROOT" -H "$AU" -H "$JS" \
  -d "{\"parentId\":\"$ROOT\"}" | P "d.get('statusCode')")" "400"
chk "missing parent rejected" "$(curl -s -X POST $A/categories -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Orphan","parentId":"no-such-id"}' | P "d.get('statusCode')")" "404"

echo '--- 4) delete guards ---'
chk "parent with children blocked" "$(curl -s -X DELETE "$A/categories/$ROOT" -H "$AU" \
  | P "d.get('statusCode')")" "400"

# یک کالا را داخل برگ می‌گذاریم تا حذفش هم بسته شود
$C exec -T postgres psql -U postgres -d molido_ai -q -c \
  "UPDATE \"Product\" SET \"categoryId\"='$LEAF' WHERE id='seed-p3';" >/dev/null 2>&1
chk "category with products blocked" "$(curl -s -X DELETE "$A/categories/$LEAF" -H "$AU" \
  | P "d.get('statusCode')")" "400"

$C exec -T postgres psql -U postgres -d molido_ai -q -c \
  "UPDATE \"Product\" SET \"categoryId\"=NULL WHERE id='seed-p3';" >/dev/null 2>&1
chk "empty leaf deletes" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$A/categories/$LEAF" -H "$AU")" "200"

echo '--- 5) duplicate name under same parent rejected ---'
curl -s -X POST $A/categories -H "$AU" -H "$JS" -d "{\"name\":\"TEST-Dup\",\"parentId\":\"$MID\"}" >/dev/null
chk "duplicate blocked" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $A/categories -H "$AU" -H "$JS" \
  -d "{\"name\":\"TEST-Dup\",\"parentId\":\"$MID\"}")" "409"

# ================================================================ انبار
echo '--- 6) warehouse CRUD + stock summary ---'
W=$(curl -s -X POST $A/warehouses -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Depot","code":"TSTD"}' | P "d.get('id','')")
chk "warehouse created" "$([ -n "$W" ] && echo yes || echo no)" "yes"
chk "list has stock fields" "$(curl -s "$A/warehouses" -H "$AU" \
  | P "'yes' if all(k in [w for w in d if w['id']=='$W'][0] for k in ('skuCount','stockValue')) else 'no'")" "yes"
chk "empty warehouse value 0" "$(curl -s "$A/warehouses" -H "$AU" \
  | P "int(float([w for w in d if w['id']=='$W'][0]['stockValue']))")" "0"

echo '--- 7) duplicate warehouse code rejected ---'
chk "dup code blocked" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $A/warehouses -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Depot2","code":"TSTD"}')" "409"

echo '--- 8) warehouse with stock cannot be deleted ---'
$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  INSERT INTO \"Inventory\" (id, \"productId\", \"warehouseId\", quantity)
  VALUES ('test-inv-1', 'seed-p3', '$W', 5)
  ON CONFLICT (id) DO UPDATE SET quantity = 5;" >/dev/null 2>&1

chk "stocked warehouse blocked" "$(curl -s -X DELETE "$A/warehouses/$W" -H "$AU" | P "d.get('statusCode')")" "400"
chk "contents lists product" "$(curl -s "$A/warehouses/$W/contents" -H "$AU" | P "len(d)")" "1"
chk "stock value counted" "$(curl -s "$A/warehouses" -H "$AU" \
  | P "'yes' if float([w for w in d if w['id']=='$W'][0]['stockValue']) > 0 else 'no'")" "yes"

$C exec -T postgres psql -U postgres -d molido_ai -q -c \
  "DELETE FROM \"Inventory\" WHERE id='test-inv-1';" >/dev/null 2>&1
chk "empty warehouse deletes" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$A/warehouses/$W" -H "$AU")" "200"

# ========================================================= شمارهٔ سریال
echo '--- 9) batch insert reports duplicates instead of failing ---'
B=$(curl -s -X POST $A/serial-numbers/batch -H "$AU" -H "$JS" \
  -d '{"productId":"seed-p3","serials":["TEST-S1","TEST-S2","TEST-S3"],"warrantyUntil":"2027-01-01"}')
chk "3 added" "$(echo "$B" | P "d['added']")" "3"

B2=$(curl -s -X POST $A/serial-numbers/batch -H "$AU" -H "$JS" \
  -d '{"productId":"seed-p3","serials":["TEST-S3","TEST-S4"]}')
chk "1 new despite duplicate" "$(echo "$B2" | P "d['added']")" "1"
chk "duplicate reported"      "$(echo "$B2" | P "d['duplicates'][0]")" "TEST-S3"

echo '--- 10) duplicates inside one batch collapse ---'
chk "same serial twice = 1" "$(curl -s -X POST $A/serial-numbers/batch -H "$AU" -H "$JS" \
  -d '{"productId":"seed-p3","serials":["TEST-S9","TEST-S9"]}' | P "d['added']")" "1"

echo '--- 11) empty batch rejected ---'
chk "empty rejected" "$(curl -s -X POST $A/serial-numbers/batch -H "$AU" -H "$JS" \
  -d '{"productId":"seed-p3","serials":["  ",""]}' | P "d.get('statusCode')")" "400"
chk "unknown product rejected" "$(curl -s -X POST $A/serial-numbers/batch -H "$AU" -H "$JS" \
  -d '{"productId":"no-such","serials":["TEST-X"]}' | P "d.get('statusCode')")" "404"

echo '--- 12) status transitions ---'
SID=$(curl -s "$A/serial-numbers?search=TEST-S1" -H "$AU" | P "d[0]['id']")
chk "SOLD without sale rejected" "$(curl -s -X PATCH "$A/serial-numbers/$SID/status" -H "$AU" -H "$JS" \
  -d '{"status":"SOLD"}' | P "d.get('statusCode')")" "400"
chk "bad status rejected" "$(curl -s -X PATCH "$A/serial-numbers/$SID/status" -H "$AU" -H "$JS" \
  -d '{"status":"TYPO"}' | P "d.get('statusCode')")" "400"
chk "DEFECTIVE accepted" "$(curl -s -X PATCH "$A/serial-numbers/$SID/status" -H "$AU" -H "$JS" \
  -d '{"status":"DEFECTIVE"}' | P "d['status']")" "DEFECTIVE"

echo '--- 13) warranty lookup by serial ---'
chk "lookup finds it"   "$(curl -s "$A/serial-numbers/lookup/TEST-S2" -H "$AU" | P "d['serial']")" "TEST-S2"
chk "warranty valid"    "$(curl -s "$A/serial-numbers/lookup/TEST-S2" -H "$AU" | P "d['warrantyValid']")" "True"
chk "no warranty null"  "$(curl -s "$A/serial-numbers/lookup/TEST-S4" -H "$AU" | P "d['warrantyUntil'] is None")" "True"
chk "unknown serial 404" "$(curl -s -o /dev/null -w '%{http_code}' "$A/serial-numbers/lookup/TEST-NOPE" -H "$AU")" "404"

echo '--- 14) stats and filters ---'
chk "stats counts"    "$(curl -s "$A/serial-numbers/stats" -H "$AU" | P "'yes' if d['total'] >= 5 else 'no'")" "yes"
chk "filter defective" "$(curl -s "$A/serial-numbers?status=DEFECTIVE&search=TEST-" -H "$AU" | P "len(d)")" "1"
chk "filter by product" "$(curl -s "$A/serial-numbers?productId=seed-p3&search=TEST-" -H "$AU" | P "'yes' if len(d) >= 5 else 'no'")" "yes"

# پاک‌سازی
$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  DELETE FROM \"SerialNumber\" WHERE serial LIKE 'TEST-%';
  DELETE FROM \"Category\"  WHERE name LIKE 'TEST-%';
  DELETE FROM \"Warehouse\" WHERE name LIKE 'TEST-%';
" >/dev/null 2>&1

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
