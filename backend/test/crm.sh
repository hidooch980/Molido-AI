#!/usr/bin/env bash
#
# ⚠️ دادهٔ آزمون عمداً لاتین است: پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند و شکستِ کاذب می‌سازد.  خودِ برنامه یونیکد
#    را درست ذخیره می‌کند؛ برای آزمودنش JSON را در فایل UTF-8 بنویسید و با
#    `curl --data-binary @file` بفرستید.
cd "D:/aziz/molido-ai/Molido-AI-main" || exit 1
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

# آزمون باید از هر وضعیتی اجرا شود.  بدون پاک‌سازی، اجرای دوم روی
# «شمارهٔ تلفن تکراری» می‌شکند و شکست‌های زنجیره‌ای می‌سازد که هیچ‌کدام
# باگ واقعی نیستند.
$C exec -T postgres   psql -U postgres -d molido_ai -q -c "
  DELETE FROM \"Interaction\";
  DELETE FROM \"Opportunity\";
  DELETE FROM \"Lead\";
  DELETE FROM \"Customer\" WHERE phone='09121112233';
" >/dev/null 2>&1

echo '--- 1) ثبت سرنخ ---'
L=$(curl -s -X POST $A/crm/leads -H "$AU" -H "$JS" \
  -d '{"name":"Mehdi Rezaei","company":"Pars Chain Stores","phone":"09121112233","source":"EXHIBITION","score":80}')
LID=$(echo "$L" | P "d.get('id','')")
chk "lead created" "$(echo "$L" | P "'yes' if d.get('leadNo') else 'no'")" "yes"

echo '--- 2) سرنخ بدون نام (باید رد شود) ---'
chk "empty name rejected" "$(curl -s -X POST $A/crm/leads -H "$AU" -H "$JS" -d '{"name":"  "}' | P "d.get('statusCode')")" "400"

echo '--- 3) ثبت تعامل با پیگیری ---'
I=$(curl -s -X POST $A/crm/interactions -H "$AU" -H "$JS" \
  -d "{\"leadId\":\"$LID\",\"type\":\"CALL\",\"subject\":\"تماس معارفه\",\"followUpAt\":\"2020-01-01T10:00:00Z\"}")
IID=$(echo "$I" | P "d.get('id','')")
chk "interaction created" "$(echo "$I" | P "'yes' if d.get('id') else 'no'")" "yes"

echo '--- 4) تعامل بدون اتصال (باید رد شود) ---'
chk "orphan interaction rejected" "$(curl -s -X POST $A/crm/interactions -H "$AU" -H "$JS" -d '{"subject":"Orphan"}' | P "d.get('statusCode')")" "400"

echo '--- 5) پیگیری سررسیدشده ---'
chk "due follow-up listed" "$(curl -s "$A/crm/interactions?due=1" -H "$AU" | P "'yes' if len(d)>0 else 'no'")" "yes"

echo '--- 6) ثبت فرصت ---'
O=$(curl -s -X POST $A/crm/opportunities -H "$AU" -H "$JS" \
  -d "{\"title\":\"قرارداد سالانه پارس\",\"leadId\":\"$LID\",\"amount\":500000000,\"probability\":40}")
OID=$(echo "$O" | P "d.get('id','')")
chk "opportunity created" "$(echo "$O" | P "'yes' if d.get('oppNo') else 'no'")" "yes"

echo '--- 7) ارزش وزنی قیف (۵۰۰م × ۴۰٪ = ۲۰۰م) ---'
chk "weighted value" "$(curl -s "$A/crm/stats" -H "$AU" | P "int(float(d.get('pipelineValue',0)))")" "200000000"

echo '--- 8) جابه‌جایی مرحله ---'
curl -s -X PATCH "$A/crm/opportunities/$OID/stage" -H "$AU" -H "$JS" -d '{"stage":"PROPOSAL","probability":70}' >/dev/null
chk "stage moved" "$(curl -s "$A/crm/opportunities" -H "$AU" | P "[o['stage'] for o in d if o['id']=='$OID'][0]")" "PROPOSAL"

echo '--- 9) باخت بدون دلیل (باید رد شود) ---'
chk "lost without reason rejected" "$(curl -s -X PATCH "$A/crm/opportunities/$OID/stage" -H "$AU" -H "$JS" -d '{"stage":"LOST"}' | P "d.get('statusCode')")" "400"

echo '--- 10) برد ---'
W=$(curl -s -X PATCH "$A/crm/opportunities/$OID/stage" -H "$AU" -H "$JS" -d '{"stage":"WON"}')
chk "won probability = 100" "$(echo "$W" | P "d.get('probability')")" "100"

echo '--- 11) تغییر فرصت بسته (باید رد شود) ---'
chk "closed opp locked" "$(curl -s -X PATCH "$A/crm/opportunities/$OID/stage" -H "$AU" -H "$JS" -d '{"stage":"NEGOTIATION"}' | P "d.get('statusCode')")" "400"

echo '--- 12) نرخ تبدیل ---'
chk "win rate 100" "$(curl -s "$A/crm/stats" -H "$AU" | P "int(float(d.get('winRate',0)))")" "100"

echo '--- 13) تبدیل سرنخ به مشتری ---'
CV=$(curl -s -X POST "$A/crm/leads/$LID/convert" -H "$AU" -H "$JS" -d '{}')
chk "lead converted" "$(echo "$CV" | P "'yes' if d.get('customerId') else 'no'")" "yes"
chk "first name split" "$(echo "$CV" | P "d.get('firstName')")" "Mehdi"

echo '--- 14) تبدیل دوباره (باید رد شود) ---'
chk "double convert rejected" "$(curl -s -X POST "$A/crm/leads/$LID/convert" -H "$AU" -H "$JS" -d '{}' | P "d.get('statusCode')")" "400"

echo '--- 15) تعامل به مشتری منتقل شد ---'
CID=$(echo "$CV" | P "d.get('customerId')")
chk "interaction linked to customer" \
  "$($C exec -T postgres psql -U postgres -d molido_ai -t -c "SELECT count(*) FROM \"Interaction\" WHERE \"customerId\"='$CID';" | tr -d ' \r\n')" "1"

echo '--- 16) قیف ---'
chk "funnel endpoint" "$(curl -s -o /dev/null -w '%{http_code}' "$A/crm/funnel" -H "$AU")" "200"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
