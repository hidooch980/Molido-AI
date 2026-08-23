#!/usr/bin/env bash
#
# سه سختگیریِ ورود: ثبتِ تلاش، قفلِ موقت، و خروج از همهٔ دستگاه‌ها.
#
# ⚠️ هر سه از یک نیاز آمدند: تا امروز حملهٔ حدسِ رمز **هیچ ردی**
#    نمی‌گذاشت.  سقفِ نرخ جلویش را می‌گرفت ولی چیزی ثبت نمی‌شد — پس نه
#    می‌شد فهمید کسی تلاش کرده، نه بعداً بررسی کرد.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d '\r'; }
TOK() { python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))"; }
# ⚠️ صبور: ۴۲۹ را «دوباره امتحان کن» می‌فهمد، نه شکست.
code() { req "$@"; printf '%s' "$_C"; }

# ⚠️ ۴۲۹ **شکست نیست، «هنوز نه» است**.
#
#    این مجموعه خودش سقفِ ورود را می‌آزماید، پس بیش از هر آزمونِ
#    دیگری در معرضِ آن است.  و قربانیِ اولش **ورودِ مدیر** بود —
#    یعنی کل مجموعه با «ورود مدیر ناموفق» می‌مرد پیش از آنکه حتی یک
#    سنجه اجرا شود، با پیامی که به نظر می‌رساند رمزِ مدیر غلط است.
#
#    درمانش صبر است، نه دور زدن.
_C=''; _R=''
req() {
  # جداکنندهٔ فاصله: ${raw##* } از **آخرین** فاصله می‌برد، پس
  # فاصله‌های داخلِ JSON مزاحم نیستند.
  local raw
  for _ in $(seq 1 12); do
    raw=$(curl -s -w ' %{http_code}' "$@")
    _C=${raw##* }; _R=${raw% *}
    [ "$_C" = "429" ] || return 0
    sleep 8
  done
  return 0
}
login() {
  req -X POST "$A/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}"
  printf '%s' "$_R" | TOK
}

JS="Content-Type: application/json"
T=${MOLIDO_TOKEN:-}
if [ -z "$T" ]; then T=$(login 'admin@molido.ai' "$PW"); fi
if [ -z "$T" ]; then echo "  ✗ ورود مدیر ناموفق — سقف ورود؟"; exit 1; fi
AU="Authorization: Bearer $T"

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

EMAIL=lockprobe@molido.ai
GHOST=nobody.here@molido.ai
cleanup() {
  Q "DELETE FROM \"User\" WHERE email='$EMAIL';" >/dev/null
  Q "DELETE FROM \"LoginAttempt\" WHERE email IN ('$EMAIL','$GHOST');" >/dev/null
}
cleanup
trap cleanup EXIT

curl -s -X POST $A/users -H "$AU" -H "$JS" \
  -d "{\"firstName\":\"Lock\",\"lastName\":\"Probe\",\"email\":\"$EMAIL\",\"password\":\"Correct#123\",\"role\":\"EMPLOYEE\"}" \
  >/dev/null

echo '--- ۱) تلاشِ موفق ثبت می‌شود ---'
V=$(login "$EMAIL" 'Correct#123')
chk "ورود موفق" "$([ -n "$V" ] && echo yes || echo no)" "yes"
chk "رکورد موفق ثبت شد" \
  "$(Q "SELECT count(*) FROM \"LoginAttempt\" WHERE email='$EMAIL' AND success=true;")" "1"

echo '--- ۲) تلاشِ ناموفق با علتش ثبت می‌شود ---'
code -X POST $A/auth/login -H "$JS" -d "{\"email\":\"$EMAIL\",\"password\":\"Wrong#999\"}" >/dev/null
chk "علت BAD_PASSWORD" \
  "$(Q "SELECT reason FROM \"LoginAttempt\" WHERE email='$EMAIL' AND success=false ORDER BY \"createdAt\" DESC LIMIT 1;")" "BAD_PASSWORD"

echo '--- ۳) ایمیلِ ناشناس هم ثبت می‌شود ---'
# ⚠️ مهم: الگوی حدس‌زدن دقیقاً روی ایمیل‌هایی دیده می‌شود که وجود
#    ندارند.  اگر فقط کاربرانِ موجود ثبت شوند، اسکنِ ایمیل نامرئی است.
code -X POST $A/auth/login -H "$JS" -d "{\"email\":\"$GHOST\",\"password\":\"whatever1\"}" >/dev/null
chk "علت NO_USER" \
  "$(Q "SELECT reason FROM \"LoginAttempt\" WHERE email='$GHOST' ORDER BY \"createdAt\" DESC LIMIT 1;")" "NO_USER"

echo '--- ۴) قفل پس از ۱۰ تلاشِ ناموفق ---'
#
# ⚠️ نُه تلاشِ اول **در پایگاه داده** ساخته می‌شود، نه با HTTP.
#
#    سقفِ `/auth/login` ده در دقیقه است و حدِ قفل هم ده تلاش — یعنی
#    از **یک IP** هرگز نمی‌شود به قفل رسید: سقفِ نرخ زودتر می‌گیرد.
#
#    و این اشکال نیست، بلکه دقیقاً طراحیِ درست است.  قفل برای حملهٔ
#    **توزیع‌شده** است: مهاجمی که از صد IP هر کدام یک تلاش می‌کند،
#    زیرِ سقفِ نرخ می‌ماند ولی حساب را ده‌ها بار می‌آزماید.
#
#    اولین نسخهٔ این آزمون ده بار HTTP می‌زد و هفت سنجه با ۴۲۹
#    می‌افتادند — با پیامی که هیچ ربطی به قفل نداشت.  آزمون باید
#    شرطِ اولیه را بسازد، نه بازتولیدش کند.
for i in $(seq 1 9); do
  Q "INSERT INTO \"LoginAttempt\" (id,email,success,reason,\"createdAt\")
     VALUES (gen_random_uuid()::text,'$EMAIL',false,'BAD_PASSWORD',now());" >/dev/null
done
# دهمین تلاش از راهِ واقعی می‌آید تا `maybeLock` صدا زده شود.
code -X POST $A/auth/login -H "$JS" -d "{\"email\":\"$EMAIL\",\"password\":\"Wrong#999\"}" >/dev/null
chk "حساب قفل شد" \
  "$(Q "SELECT CASE WHEN \"lockedUntil\" > now() THEN 'yes' ELSE 'no' END FROM \"User\" WHERE email='$EMAIL';")" "yes"

echo '--- ۵) رمزِ درست هم پشتِ قفل رد می‌شود ---'
# ⚠️ قفل پیش از بررسی رمز سنجیده می‌شود، وگرنه مهاجم می‌فهمد رمزش
#    درست بوده و قفل فقط تأخیر است، نه محافظت.
chk "رمز درست پشت قفل ۴۰۱" \
  "$(code -X POST $A/auth/login -H "$JS" -d "{\"email\":\"$EMAIL\",\"password\":\"Correct#123\"}")" "401"
chk "علت LOCKED ثبت شد" \
  "$(Q "SELECT reason FROM \"LoginAttempt\" WHERE email='$EMAIL' ORDER BY \"createdAt\" DESC LIMIT 1;")" "LOCKED"

echo '--- ۶) باز شدنِ قفل، ورود را برمی‌گرداند ---'
Q "UPDATE \"User\" SET \"lockedUntil\" = NULL WHERE email='$EMAIL';" >/dev/null
V2=$(login "$EMAIL" 'Correct#123')
chk "ورود دوباره ممکن" "$([ -n "$V2" ] && echo yes || echo no)" "yes"

echo '--- ۷) تاریخچه فقط برای مدیر ---'
#
# ⚠️ پیش از «خروج از همه» سنجیده می‌شود، چون آن توکنِ `$V2` را می‌کشد
#    و اینجا به یک توکنِ **زندهٔ کارمند** نیاز داریم.
#
#    ترتیبِ سنجه‌ها اینجا معنا دارد؛ جابه‌جا کردنشان یعنی یک ورودِ
#    اضافه، و ورودِ اضافه یعنی نزدیک‌تر شدن به سقفِ نرخ.
chk "کارمند ۴۰۳" "$(code "$A/auth/login-history?email=$EMAIL" -H "Authorization: Bearer $V2")" "403"
chk "مدیر ۲۰۰" "$(code "$A/auth/login-history?email=$EMAIL" -H "$AU")" "200"

echo '--- ۸) خروج از همهٔ دستگاه‌ها ---'
chk "توکن پیش از خروج کار می‌کند" "$(code $A/auth/me -H "Authorization: Bearer $V2")" "200"
code -X POST $A/auth/revoke-sessions -H "Authorization: Bearer $V2" >/dev/null
# ⚠️ توکنِ خودِ درخواست‌کننده هم می‌میرد.  «همهٔ دستگاه‌ها» یعنی همه.
chk "توکن پس از خروج باطل" "$(code $A/auth/me -H "Authorization: Bearer $V2")" "401"
chk "ستون ثبت شد" \
  "$(Q "SELECT CASE WHEN \"sessionsRevokedAt\" IS NOT NULL THEN 'yes' ELSE 'no' END FROM \"User\" WHERE email='$EMAIL';")" "yes"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
