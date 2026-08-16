#!/usr/bin/env bash
#
# باشگاه مشتریان: بخش‌بندی، کد شخصی، ارسال، شناسایی با QR.
#
# مهم‌ترین چیزی که اینجا آزموده می‌شود این است که **کد شخصی واقعاً شخصی
# باشد** — کد یک مشتری نباید برای دیگری کار کند، و یک‌بار مصرف شود.
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
psql() { $C exec -T postgres psql -U postgres -d molido_ai -q -c "$1" >/dev/null 2>&1; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

CO=$(psqlv "SELECT id FROM \"Company\" LIMIT 1")

# وضعیت شناخته
psql "DELETE FROM \"DiscountCode\"     WHERE code LIKE 'TEST%' OR \"campaignId\" IN (SELECT id FROM \"DiscountCampaign\" WHERE name LIKE 'TEST-%');
      DELETE FROM \"DiscountCampaign\" WHERE name LIKE 'TEST-%';
      DELETE FROM \"DiscountRule\"     WHERE name LIKE 'TEST-%';
      DELETE FROM \"CustomerCheckin\"  WHERE \"customerId\" IN (SELECT id FROM \"Customer\" WHERE phone LIKE '0912000%');
      DELETE FROM \"Customer\"         WHERE phone LIKE '0912000%';
      UPDATE \"Product\" SET \"salePrice\"=100000 WHERE id='seed-p3';"

# دو مشتری با شماره
psql "INSERT INTO \"Customer\" (id, \"companyId\", \"firstName\", \"lastName\", phone)
      VALUES ('test-cust-a','$CO','Ali','Alavi','09120001111'),
             ('test-cust-b','$CO','Bita','Bahari','09120002222');"

WH=$(curl -s "$A/warehouses" -H "$AU" | P "d[0]['id']")

echo '--- 1) segments are counted ---'
S=$(curl -s "$A/loyalty/segments" -H "$AU")
chk "has all segments" "$(echo "$S" | P "'yes' if all(k in d for k in ('ALL','LOYAL','AT_RISK','NEW','INACTIVE','noPhone')) else 'no'")" "yes"
chk "new customers are INACTIVE" "$(echo "$S" | P "'yes' if d['INACTIVE'] >= 2 else 'no'")" "yes"

echo '--- 2) audience returns only the segment ---'
chk "inactive audience" "$(curl -s "$A/loyalty/audience?segment=INACTIVE" -H "$AU" \
  | P "'yes' if any(c['id']=='test-cust-a' for c in d) else 'no'")" "yes"
chk "loyal excludes them" "$(curl -s "$A/loyalty/audience?segment=LOYAL" -H "$AU" \
  | P "'yes' if not any(c['id']=='test-cust-a' for c in d) else 'no'")" "yes"

echo '--- 3) campaign issues one personal code per customer ---'
R=$(curl -s -X POST $A/pricing/rules -H "$AU" -H "$JS" \
  -d '{"name":"TEST-Loyal20","kind":"PERCENT","value":20}' | P "d['id']")

CAMP=$(curl -s -X POST $A/loyalty/campaigns -H "$AU" -H "$JS" \
  -d "{\"ruleId\":\"$R\",\"name\":\"TEST-Campaign\",\"segment\":\"INACTIVE\",\"messageTemplate\":\"Hello {name}, your code: {code}\"}")
chk "codes issued"  "$(echo "$CAMP" | P "'yes' if d['issued'] >= 2 else 'no'")" "yes"
chk "sms attempted" "$(echo "$CAMP" | P "'yes' if d['sent'] >= 2 else 'no'")" "yes"
CID=$(echo "$CAMP" | P "d['id']")

chk "template without {code} rejected" "$(curl -s -X POST $A/loyalty/campaigns -H "$AU" -H "$JS" \
  -d "{\"ruleId\":\"$R\",\"name\":\"TEST-Bad\",\"segment\":\"ALL\",\"messageTemplate\":\"no placeholder\"}" \
  | P "d.get('statusCode')")" "400"

echo '--- 4) codes are unique per customer ---'
CODE_A=$(psqlv "SELECT code FROM \"DiscountCode\" WHERE \"customerId\"='test-cust-a' AND \"campaignId\"='$CID'")
CODE_B=$(psqlv "SELECT code FROM \"DiscountCode\" WHERE \"customerId\"='test-cust-b' AND \"campaignId\"='$CID'")
chk "customer A has a code" "$([ -n "$CODE_A" ] && echo yes || echo no)" "yes"
chk "codes differ"          "$([ "$CODE_A" != "$CODE_B" ] && echo yes || echo no)" "yes"
chk "no ambiguous letters"  "$(printf '%s' "$CODE_A" | grep -cE '[OIL01]')" "0"

echo '--- 5) the rule does NOT apply without a code ---'
# مهم‌ترین آزمون: بدون این، کارزار یعنی تخفیف ۲۰٪ به همهٔ مشتری‌ها.
q() { curl -s -X POST $A/pricing/quote -H "$AU" -H "$JS" -d "$1"; }
chk "no discount without code" "$(q '{"lines":[{"productId":"seed-p3","qty":1}]}' | P "int(float(d['discount']))")" "0"

echo '--- 6) the code works for its owner only ---'
# متن خطا فارسی است و پوستهٔ ویندوز آن را در مسیر برگشت خراب می‌کند؛ پس
# مقایسه روی علامت‌های زبان‌مستقل انجام می‌شود، نه روی خود پیام.
OWNER=$(q "{\"customerId\":\"test-cust-a\",\"code\":\"$CODE_A\",\"lines\":[{\"productId\":\"seed-p3\",\"qty\":1}]}")
chk "code works for owner" "$(echo "$OWNER" | P "int(float(d['discount']))")" "20000"
chk "codeApplied true"     "$(echo "$OWNER" | P "d.get('codeApplied')")" "True"

OTHER=$(q "{\"customerId\":\"test-cust-b\",\"code\":\"$CODE_A\",\"lines\":[{\"productId\":\"seed-p3\",\"qty\":1}]}")
chk "no discount for others" "$(echo "$OTHER" | P "int(float(d['discount']))")" "0"
chk "rejection explained"    "$(echo "$OTHER" | P "'yes' if d.get('codeError') else 'no'")" "yes"
chk "codeApplied false"      "$(echo "$OTHER" | P "d.get('codeApplied')")" "False"

UNKNOWN=$(q '{"code":"NOSUCHCODE","lines":[{"productId":"seed-p3","qty":1}]}')
chk "unknown code reported"  "$(echo "$UNKNOWN" | P "'yes' if d.get('codeError') else 'no'")" "yes"
chk "unknown gives nothing"  "$(echo "$UNKNOWN" | P "int(float(d['discount']))")" "0"

echo '--- 7) code is consumed by a sale, once ---'
sale() { curl -s -X POST $A/sales -H "$AU" -H "$JS" \
  -d "{\"warehouseId\":\"$WH\",\"customerId\":\"test-cust-a\",\"discountCode\":\"$1\",\"items\":[{\"productId\":\"seed-p3\",\"quantity\":1}]}"; }

chk "sale applies the code" "$(sale "$CODE_A" | P "int(float(d['total']))")" "80000"
chk "code marked used"      "$(psqlv "SELECT \"usedCount\" FROM \"DiscountCode\" WHERE code='$CODE_A'")" "1"
chk "redeemedAt set"        "$(psqlv "SELECT CASE WHEN \"redeemedAt\" IS NULL THEN 'no' ELSE 'yes' END FROM \"DiscountCode\" WHERE code='$CODE_A'")" "yes"
chk "second use rejected"   "$(sale "$CODE_A" | P "d.get('statusCode')")" "400"
chk "sale links the code"   "$(psqlv "SELECT COUNT(*) FROM \"Sale\" WHERE \"discountCodeId\" IS NOT NULL")" "1"

echo '--- 8) campaign reports redemption ---'
chk "redeemed counted" "$(curl -s "$A/loyalty/campaigns" -H "$AU" \
  | P "[c['redeemedCount'] for c in d if c['id']=='$CID'][0]")" "1"

echo '--- 9) QR check-in identifies the customer ---'
# توکن مستقیم ساخته می‌شود؛ مسیر اپلیکیشن مشتری توکن مشتری می‌خواهد.
TOK="MC1:testtoken$(date +%s)"
psql "INSERT INTO \"CustomerCheckin\" (id,\"companyId\",\"customerId\",token,\"expiresAt\")
      VALUES ('test-chk-1','$CO','test-cust-b','$TOK', now() + interval '2 minutes');"

RES=$(curl -s -X POST $A/loyalty/checkin/resolve -H "$AU" -H "$JS" -d "{\"token\":\"$TOK\"}")
chk "resolves to customer" "$(echo "$RES" | P "d['customerId']")" "test-cust-b"
chk "returns their codes"  "$(echo "$RES" | P "'yes' if any(c['code']=='$CODE_B' for c in d['availableCodes']) else 'no'")" "yes"

echo '--- 10) expired and used tokens are refused ---'
psql "INSERT INTO \"CustomerCheckin\" (id,\"companyId\",\"customerId\",token,\"expiresAt\")
      VALUES ('test-chk-2','$CO','test-cust-b','MC1:expired', now() - interval '1 minute');"
chk "expired refused" "$(curl -s -X POST $A/loyalty/checkin/resolve -H "$AU" -H "$JS" \
  -d '{"token":"MC1:expired"}' | P "d.get('statusCode')")" "400"
chk "unknown refused" "$(curl -s -X POST $A/loyalty/checkin/resolve -H "$AU" -H "$JS" \
  -d '{"token":"MC1:nosuch"}' | P "d.get('statusCode')")" "404"

echo '--- 11) sale consumes the check-in token ---'
curl -s -X POST $A/sales -H "$AU" -H "$JS" \
  -d "{\"warehouseId\":\"$WH\",\"customerId\":\"test-cust-b\",\"checkinId\":\"test-chk-1\",\"items\":[{\"productId\":\"seed-p3\",\"quantity\":1}]}" >/dev/null
chk "token consumed" "$(psqlv "SELECT CASE WHEN \"usedAt\" IS NULL THEN 'no' ELSE 'yes' END FROM \"CustomerCheckin\" WHERE id='test-chk-1'")" "yes"
chk "reuse refused"  "$(curl -s -X POST $A/loyalty/checkin/resolve -H "$AU" -H "$JS" -d "{\"token\":\"$TOK\"}" | P "d.get('statusCode')")" "400"

# پاک‌سازی
psql "DELETE FROM \"Sale\" WHERE \"customerId\" IN ('test-cust-a','test-cust-b');
      DELETE FROM \"CustomerCheckin\" WHERE id LIKE 'test-chk-%';
      DELETE FROM \"DiscountCode\" WHERE \"campaignId\"='$CID';
      DELETE FROM \"DiscountCampaign\" WHERE name LIKE 'TEST-%';
      DELETE FROM \"DiscountRule\" WHERE name LIKE 'TEST-%';
      DELETE FROM \"Customer\" WHERE id IN ('test-cust-a','test-cust-b');
      UPDATE \"Product\" SET \"salePrice\"=310000 WHERE id='seed-p3';"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
