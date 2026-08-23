#!/usr/bin/env bash
#
# توکنِ نوسازی در کوکیِ `httpOnly` — توصیهٔ چهارمِ `docs/AUTH.md`.
#
# ⚠️ چرا این کار لازم بود؟
#
#    عمرِ توکنِ دسترسی هفت روز بود.  یعنی توکنی که از دستگاهِ گم‌شده یا
#    از `localStorage` با XSS برداشته شود، یک هفتهٔ کامل کار می‌کرد.
#
#    کوتاه کردنش ممکن نبود: کلاینت هیچ‌وقت `/auth/refresh` را صدا
#    نمی‌زد، پس عمرِ کوتاه یعنی بیرون انداختنِ کاربر هر دو ساعت.
#
#    و راهِ ساده‌اش — گذاشتنِ توکنِ نوسازی در `localStorage` — وضع را
#    **بدتر** می‌کرد: XSS به‌جای هفت روز، سی روز می‌گرفت.
#
#    کوکیِ `httpOnly` تنها جایی است که جاوااسکریپت نمی‌تواند بخواندش.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
JAR=$(mktemp)

Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d '\r'; }
TOK() { python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))"; }

_C=''; _R=''
req() {
  local raw
  for _ in $(seq 1 12); do
    raw=$(curl -s -w ' %{http_code}' "$@")
    _C=${raw##* }; _R=${raw% *}
    [ "$_C" = "429" ] || return 0
    sleep 8
  done
  return 0
}
code() { req "$@"; printf '%s' "$_C"; }

JS="Content-Type: application/json"
T=${MOLIDO_TOKEN:-}
if [ -z "$T" ]; then
  req -X POST "$A/auth/login" -H "$JS" -d "{\"email\":\"admin@molido.ai\",\"password\":\"$PW\"}"
  T=$(printf '%s' "$_R" | TOK)
fi
if [ -z "$T" ]; then echo "  ✗ ورود مدیر ناموفق"; exit 1; fi
AU="Authorization: Bearer $T"

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

EMAIL=cookie.probe@molido.ai
cleanup() { Q "DELETE FROM \"User\" WHERE email='$EMAIL';" >/dev/null; rm -f "$JAR"; }
cleanup
trap cleanup EXIT

curl -s -X POST "$A/users" -H "$AU" -H "$JS" \
  -d "{\"firstName\":\"Cookie\",\"lastName\":\"Probe\",\"email\":\"$EMAIL\",\"password\":\"Correct#123\",\"role\":\"EMPLOYEE\"}" \
  >/dev/null

echo '--- ۱) ورود کوکی می‌نشاند ---'
# ⚠️ صبور در برابر ۴۲۹.
#
#    بدونِ این، سقفِ نرخ یعنی هیچ هدرِ Set-Cookie نمی‌آید و هر پنج
#    سنجهٔ صفاتِ کوکی می‌افتند — با پیام‌هایی مثل «HttpOnly ندارد»،
#    در حالی که اصلاً کوکیی صادر نشده.
#
#    پیامِ شکست باید به علت اشاره کند، نه به معلول.
HDR=''
for _ in $(seq 1 12); do
  HDR=$(curl -s -D - -o /dev/null -c "$JAR" -X POST "$A/auth/login" -H "$JS" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"Correct#123\"}")
  printf '%s' "$HDR" | head -1 | grep -q '429' || break
  sleep 8
done
chk "کوکی molido_rt نشست" \
  "$(printf '%s' "$HDR" | grep -ci 'set-cookie: *molido_rt=')" "1"

# ⚠️ سه صفتِ کوکی، سه محافظتِ متفاوت — هر سه باید باشند.
#
#    `HttpOnly`      جاوااسکریپت نمی‌خواندش  → XSS بی‌اثر
#    `SameSite=Strict` سایتِ دیگر نمی‌فرستدش → CSRF بی‌اثر
#    `Path=/auth/refresh` فقط همین مسیر می‌بیندش → سطحِ حمله کمینه
#
#    نبودِ هر کدام بی‌صدا است: کوکی کار می‌کند و محافظت نیست.
chk "HttpOnly دارد" "$(printf '%s' "$HDR" | grep -i 'molido_rt=' | grep -ci 'HttpOnly')" "1"
chk "SameSite=Strict دارد" "$(printf '%s' "$HDR" | grep -i 'molido_rt=' | grep -ci 'SameSite=Strict')" "1"
chk "Path محدود است" "$(printf '%s' "$HDR" | grep -i 'molido_rt=' | grep -ci 'Path=/auth/refresh')" "1"

# ⚠️ روی HTTP نباید `Secure` بگذارد.
#
#    مرورگر کوکیِ `Secure` را روی `http://` بی‌هیچ خطایی دور می‌اندازد.
#    یعنی نصبِ محلی و شبکهٔ داخلی بی‌صدا از کار می‌افتادند: کاربر وارد
#    می‌شد، کوکی نمی‌نشست، و دو ساعت بعد بیرون انداخته می‌شد.
chk "روی HTTP بدون Secure" "$(printf '%s' "$HDR" | grep -i 'molido_rt=' | grep -ci 'Secure')" "0"

echo '--- ۲) نوسازی فقط با کوکی، بدون بدنه ---'
# مرورگر توکن را نمی‌داند؛ فقط کوکی را می‌فرستد.
RES=$(curl -s -b "$JAR" -c "$JAR" -X POST "$A/auth/refresh" -H "$JS" -d '{}')
chk "توکن دسترسیِ تازه آمد" \
  "$(printf '%s' "$RES" | python3 -c "import sys,json;print('yes' if json.load(sys.stdin).get('accessToken') else 'no')")" "yes"

echo '--- ۳) پاسخِ کوکی‌محور توکنِ نوسازی را برنمی‌گرداند ---'
#
# ⚠️ مهم‌ترین سنجهٔ این فایل.
#
#    بدونِ این، همهٔ کار بی‌فایده است: اسکریپتی که در صفحه اجرا شود
#    می‌توانست `/auth/refresh` را با `credentials:'include'` صدا بزند و
#    توکنِ سی‌روزه را از **بدنه** بخواند — یعنی `httpOnly` دور زده
#    می‌شد.
#
#    کوکی از دسترسِ جاوااسکریپت بیرون است؛ بدنه نیست.
chk "بدنه توکنِ نوسازی ندارد" \
  "$(printf '%s' "$RES" | python3 -c "import sys,json;print('yes' if json.load(sys.stdin).get('refreshToken') else 'no')")" "no"

echo '--- ۴) کلاینتِ بدون کوکی همچنان کار می‌کند ---'
# اپ موبایل و اسکریپت‌ها کوکی ندارند؛ شکستنشان چیزی به دست نمی‌آورد.
req -X POST "$A/auth/login" -H "$JS" -d "{\"email\":\"$EMAIL\",\"password\":\"Correct#123\"}"
RT=$(printf '%s' "$_R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('refreshToken',''))")
chk "ورود توکنِ نوسازی در بدنه می‌دهد" "$([ -n "$RT" ] && echo yes || echo no)" "yes"
BODY=$(curl -s -X POST "$A/auth/refresh" -H "$JS" -d "{\"refreshToken\":\"$RT\"}")
chk "نوسازیِ بدنه‌محور کار می‌کند" \
  "$(printf '%s' "$BODY" | python3 -c "import sys,json;print('yes' if json.load(sys.stdin).get('accessToken') else 'no')")" "yes"
chk "و توکنِ نوسازی را برمی‌گرداند" \
  "$(printf '%s' "$BODY" | python3 -c "import sys,json;print('yes' if json.load(sys.stdin).get('refreshToken') else 'no')")" "yes"

echo '--- ۵) خروج از همهٔ دستگاه‌ها کوکی را پاک می‌کند ---'
AT=$(printf '%s' "$RES" | TOK)
OUT=$(curl -s -D - -o /dev/null -b "$JAR" -X POST "$A/auth/revoke-sessions" -H "Authorization: Bearer $AT")
chk "کوکی باطل شد" "$(printf '%s' "$OUT" | grep -i 'molido_rt=' | grep -ci 'Max-Age=0')" "1"

echo '--- ۶) کوکیِ باطل، نوسازی نمی‌دهد ---'
# مُهرِ ابطال روی خودِ توکن است، نه فقط روی کوکی.
chk "نوسازی با کوکیِ مرده ۴۰۱" \
  "$(code -b "$JAR" -X POST "$A/auth/refresh" -H "$JS" -d '{}')" "401"

echo '--- ۷) عمرِ توکنِ دسترسی کوتاه شد ---'
#
# ⚠️ هدفِ همهٔ این کار همین یک سطر است.
#
#    هفت روز به دو ساعت.  توکنی که از دستگاهِ گم‌شده برداشته شود، دو
#    ساعت کار می‌کند نه یک هفته — و کاربر چیزی حس نمی‌کند چون کلاینت
#    خودش با کوکی نوسازی می‌کند.
EXPH=$(printf '%s' "$_R" | python3 -c "
import sys,json,base64
t=json.load(sys.stdin).get('accessToken','')
p=t.split('.')[1]
p+='='*(-len(p)%4)
d=json.loads(base64.urlsafe_b64decode(p))
print(round((d['exp']-d['iat'])/3600))
")
chk "عمر توکن ۲ ساعت" "$EXPH" "2"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
