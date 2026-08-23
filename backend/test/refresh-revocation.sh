#!/usr/bin/env bash
#
# توکنِ نوسازی هم باید با «خروج از همهٔ دستگاه‌ها» بمیرد.
#
# ⚠️ این مجموعه یک حفرهٔ واقعی را گرفت.
#
#    `/auth/refresh` تا امروز فقط **امضا** و **وضعیت کاربر** را
#    می‌سنجید، نه مُهرِ ابطال را.  یعنی «خروج از همهٔ دستگاه‌ها» توکنِ
#    دسترسی را می‌کشت ولی توکنِ نوسازی را نه — و با آن می‌شد بلافاصله
#    توکنِ دسترسیِ تازه گرفت.
#
#    بدتر: هر نوسازی توکنِ نوسازیِ **تازه** هم برمی‌گرداند، پس مهاجم
#    می‌توانست بی‌پایان تمدید کند و هرگز بیرون نیفتد.
#
#    و عمرِ توکنِ نوسازی **سی روز** است، نه هفت.  یعنی این حفره از
#    آنکه در توکنِ دسترسی بستیم بزرگ‌تر بود — و دقیقاً همان دکمه‌ای را
#    بی‌اثر می‌کرد که کاربر برای نجاتِ حسابِ لو رفته‌اش می‌زند.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d '\r'; }
TOK() { python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))"; }
RTOK() { python3 -c "import sys,json;print(json.load(sys.stdin).get('refreshToken',''))"; }

# ۴۲۹ شکست نیست؛ «هنوز نه» است.
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
login() {
  req -X POST "$A/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}

JS="Content-Type: application/json"
T=${MOLIDO_TOKEN:-}
if [ -z "$T" ]; then login 'admin@molido.ai' "$PW"; T=$(printf '%s' "$_R" | TOK); fi
if [ -z "$T" ]; then echo "  ✗ ورود مدیر ناموفق"; exit 1; fi
AU="Authorization: Bearer $T"

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

EMAIL=refresh.probe@molido.ai
cleanup() { Q "DELETE FROM \"User\" WHERE email='$EMAIL';" >/dev/null; }
cleanup
trap cleanup EXIT

curl -s -X POST "$A/users" -H "$AU" -H "$JS" \
  -d "{\"firstName\":\"Refresh\",\"lastName\":\"Probe\",\"email\":\"$EMAIL\",\"password\":\"Correct#123\",\"role\":\"EMPLOYEE\"}" \
  >/dev/null

echo '--- ۱) ورود، هر دو توکن را می‌دهد ---'
login "$EMAIL" 'Correct#123'
V=$(printf '%s' "$_R" | TOK)
RT=$(printf '%s' "$_R" | RTOK)
chk "توکن دسترسی گرفته شد" "$([ -n "$V" ] && echo yes || echo no)" "yes"
chk "توکن نوسازی گرفته شد" "$([ -n "$RT" ] && echo yes || echo no)" "yes"

echo '--- ۲) نوسازی پیش از ابطال کار می‌کند ---'
# نگهبانی که همه را ببندد هم خراب است.
chk "نوسازی ۲۰۰" \
  "$(code -X POST "$A/auth/refresh" -H "$JS" -d "{\"refreshToken\":\"$RT\"}")" "200"

echo '--- ۳) خروج از همهٔ دستگاه‌ها ---'
chk "توکن دسترسی پیش از خروج کار می‌کند" "$(code "$A/auth/me" -H "Authorization: Bearer $V")" "200"
code -X POST "$A/auth/revoke-sessions" -H "Authorization: Bearer $V" >/dev/null
chk "توکن دسترسی مرد" "$(code "$A/auth/me" -H "Authorization: Bearer $V")" "401"

echo '--- ۴) توکنِ نوسازی هم باید مرده باشد ---'
#
# ⚠️ مهم‌ترین سنجهٔ این فایل.
#
#    اگر ۲۰۰ بدهد، یعنی «خروج از همه‌جا» فقط نصفِ کار را کرده و مهاجم
#    هنوز داخل است — با توکنی که سی روز عمر دارد.
chk "نوسازی پس از ابطال ۴۰۱" \
  "$(code -X POST "$A/auth/refresh" -H "$JS" -d "{\"refreshToken\":\"$RT\"}")" "401"

echo '--- ۵) تغییر رمز هم توکنِ نوسازی را می‌کشد ---'
Q "UPDATE \"User\" SET \"sessionsRevokedAt\" = NULL, \"passwordChangedAt\" = NULL, \"lockedUntil\" = NULL WHERE email='$EMAIL';" >/dev/null
login "$EMAIL" 'Correct#123'
V2=$(printf '%s' "$_R" | TOK)
RT2=$(printf '%s' "$_R" | RTOK)
req -X POST "$A/auth/change-password" -H "Authorization: Bearer $V2" -H "$JS" \
  -d '{"currentPassword":"Correct#123","newPassword":"Second#6789"}' >/dev/null
# ⚠️ تغییر رمز `passwordChangedAt` را می‌گذارد، نه `sessionsRevokedAt`.
#    این دو ستونِ جدا هستند و هر دو باید توکنِ نوسازی را بکشند —
#    وگرنه کاربری که رمزش لو رفته و عوضش می‌کند، مهاجم را با توکنِ
#    نوسازیِ سی‌روزه داخل نگه می‌دارد.
chk "نوسازیِ پیش از تغییر رمز ۴۰۱" \
  "$(code -X POST "$A/auth/refresh" -H "$JS" -d "{\"refreshToken\":\"$RT2\"}")" "401"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
