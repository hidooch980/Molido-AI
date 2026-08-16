#!/usr/bin/env bash
#
# سطح قیمت، قیمت پلکانی و تخفیف خودکار.
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
    print('<<پاسخ-JSON-نبود:%r>>' % raw[:60]); sys.exit(0)
print($1)"; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# پاک‌سازی تا آزمون تکرارپذیر بماند
$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  DELETE FROM \"DiscountRule\" WHERE name LIKE 'TEST-%';
  DELETE FROM \"ProductPrice\" WHERE \"priceLevelId\" IN
    (SELECT id FROM \"PriceLevel\" WHERE name = 'TEST-Wholesale');
  DELETE FROM \"PriceLevel\" WHERE name = 'TEST-Wholesale';
  UPDATE \"Product\" SET \"salePrice\"=310000 WHERE id='seed-p3';
" >/dev/null 2>&1

echo '--- 1) default price level exists ---'
chk "default level" "$(curl -s "$A/pricing/levels" -H "$AU" | P "len([l for l in d if l['isDefault']])")" "1"

echo '--- 2) create wholesale level ---'
L=$(curl -s -X POST $A/pricing/levels -H "$AU" -H "$JS" -d '{"name":"TEST-Wholesale"}')
LID=$(echo "$L" | P "d.get('id','')")
chk "level created" "$(echo "$L" | P "'yes' if d.get('id') else 'no'")" "yes"

echo '--- 3) tiered prices: 1+ => 300k, 10+ => 280k, 50+ => 250k ---'
for tier in "0 300000" "10 280000" "50 250000"; do
  set -- $tier
  curl -s -X POST $A/pricing/prices -H "$AU" -H "$JS" \
    -d "{\"productId\":\"seed-p3\",\"priceLevelId\":\"$LID\",\"price\":$2,\"minQty\":$1}" >/dev/null
done
chk "three tiers" "$(curl -s "$A/pricing/products/seed-p3/prices" -H "$AU" | P "len([p for p in d if p['priceLevelId']=='$LID'])")" "3"

echo '--- 4) quote picks the right tier ---'
q() { curl -s -X POST $A/pricing/quote -H "$AU" -H "$JS" \
  -d "{\"priceLevelId\":\"$LID\",\"lines\":[{\"productId\":\"seed-p3\",\"qty\":$1}]}" | P "$2"; }

chk "qty 1 => 300k"  "$(q 1  "int(float(d['lines'][0]['unitPrice']))")" "300000"
chk "qty 9 => 300k"  "$(q 9  "int(float(d['lines'][0]['unitPrice']))")" "300000"
chk "qty 10 => 280k" "$(q 10 "int(float(d['lines'][0]['unitPrice']))")" "280000"
chk "qty 60 => 250k" "$(q 60 "int(float(d['lines'][0]['unitPrice']))")" "250000"

echo '--- 5) without level falls back to salePrice ---'
chk "fallback price" "$(curl -s -X POST $A/pricing/quote -H "$AU" -H "$JS" \
  -d '{"lines":[{"productId":"seed-p3","qty":1}]}' | P "int(float(d['lines'][0]['unitPrice']))")" "310000"

echo '--- 6) percent discount ---'
curl -s -X POST $A/pricing/rules -H "$AU" -H "$JS" \
  -d '{"name":"TEST-10off","kind":"PERCENT","value":10,"productId":"seed-p3"}' >/dev/null
chk "10% applied" "$(q 1 "int(float(d['discount']))")" "30000"

echo '--- 7) best discount wins, not the sum ---'
curl -s -X POST $A/pricing/rules -H "$AU" -H "$JS" \
  -d '{"name":"TEST-25off","kind":"PERCENT","value":25,"productId":"seed-p3"}' >/dev/null
chk "25% beats 10%" "$(q 1 "int(float(d['discount']))")" "75000"
chk "not summed" "$(q 1 "'yes' if float(d['discount']) < 300000 else 'no'")" "yes"

echo '--- 8) percent over 100 rejected ---'
chk "over 100 rejected" "$(curl -s -X POST $A/pricing/rules -H "$AU" -H "$JS" \
  -d '{"name":"TEST-bad","kind":"PERCENT","value":150}' | P "d.get('statusCode')")" "400"

echo '--- 9) inactive rule not applied ---'
RID=$(curl -s "$A/pricing/rules" -H "$AU" | P "[r['id'] for r in d if r['name']=='TEST-25off'][0]")
curl -s -X PATCH "$A/pricing/rules/$RID/toggle" -H "$AU" -H "$JS" -d '{}' >/dev/null
chk "back to 10%" "$(q 1 "int(float(d['discount']))")" "30000"

echo '--- 10) min quantity gate ---'
curl -s -X POST $A/pricing/rules -H "$AU" -H "$JS" \
  -d '{"name":"TEST-bulk","kind":"PERCENT","value":50,"productId":"seed-p3","minQty":20}' >/dev/null
chk "below minQty ignored" "$(q 1 "int(float(d['discount']))")" "30000"
# qty 20 با قیمت پلکانی 280k: 20×280000=5,600,000 ⇒ 50% = 2,800,000
chk "at minQty applied" "$(q 20 "int(float(d['discount']))")" "2800000"

echo '--- 11) total = subtotal - discount ---'
chk "total math" "$(q 1 "int(float(d['subtotal'])) - int(float(d['discount'])) == int(float(d['total']))")" "True"

echo '--- 12) discount never exceeds subtotal ---'
chk "no negative total" "$(q 20 "'yes' if float(d['total']) >= 0 else 'no'")" "yes"

# پاک‌سازی
$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  DELETE FROM \"DiscountRule\" WHERE name LIKE 'TEST-%';
  DELETE FROM \"ProductPrice\" WHERE \"priceLevelId\"='$LID';
  DELETE FROM \"PriceLevel\" WHERE id='$LID';
" >/dev/null 2>&1

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
