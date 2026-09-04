#!/usr/bin/env bash
#
# مسدود کردنِ مشتری باید **بلافاصله** اثر کند.
#
# ⚠️ این مجموعه یک حفرهٔ واقعی را گرفت.
#
#    `CustomerAuthGuard` هرگز به پایگاه داده نمی‌زد.  `login` وضعیت
#    `isActive` را می‌سنجید، ولی نگهبان نه — یعنی:
#
#      فروشگاه مشتریِ متخلف را مسدود می‌کند
#        ورودِ تازه            → ۴۰۱  (درست)
#        توکنِ موجودش روی سبد  → **۲۰۰**
#
#    و عمرِ توکنِ مشتری **سی روز** است.  یعنی مسدود کردن تا یک ماه
#    بی‌اثر بود و صاحب فروشگاه باور داشت که کار کرده.
#
#    همان اشکالی که در `jwt.strategy.ts` برای کارکنان بسته شد — با
#    پنجره‌ای چهار برابرِ بلندتر.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d '\r'; }

# ۴۲۹ شکست نیست؛ «هنوز نه» است — `/shop/register` سقفِ ده در دقیقه دارد.
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
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

PHONE=09120000077
cleanup() {
  Q "DELETE FROM \"Cart\" WHERE \"customerId\" IN (SELECT id FROM \"Customer\" WHERE phone='$PHONE');" >/dev/null
  Q "DELETE FROM \"Customer\" WHERE phone='$PHONE';" >/dev/null
}
cleanup
trap cleanup EXIT

echo '--- ۱) ثبت‌نام و توکن ---'
req -X POST "$A/shop/register" -H "$JS" \
  -d "{\"phone\":\"$PHONE\",\"password\":\"secret123\",\"firstName\":\"Blocked\"}"
TOK=$(printf '%s' "$_R" | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
chk "توکن گرفته شد" "$([ -n "$TOK" ] && echo yes || echo no)" "yes"

echo '--- ۲) مشتریِ فعال به سبد دسترسی دارد ---'
# نگهبانی که همه را ببندد هم خراب است.
chk "سبد ۲۰۰" "$(code "$A/shop/cart" -H "Authorization: Bearer $TOK")" "200"
chk "سفارش‌ها ۲۰۰" "$(code "$A/shop/my-orders" -H "Authorization: Bearer $TOK")" "200"

echo '--- ۳) مسدود کردن، دسترسی را همان لحظه می‌بندد ---'
#
# ⚠️ مهم‌ترین سنجهٔ این فایل.
#
#    اگر ۲۰۰ بدهد، یعنی مسدود کردن فقط ورودِ تازه را می‌بندد و مشتری با
#    توکنِ موجودش تا سی روز داخل می‌ماند.
Q "UPDATE \"Customer\" SET \"isActive\" = false WHERE phone='$PHONE';" >/dev/null
chk "سبد ۴۰۱" "$(code "$A/shop/cart" -H "Authorization: Bearer $TOK")" "401"
chk "سفارش‌ها ۴۰۱" "$(code "$A/shop/my-orders" -H "Authorization: Bearer $TOK")" "401"

echo '--- ۴) ورودِ تازه هم بسته است ---'
chk "ورود ۴۰۱" \
  "$(code -X POST "$A/shop/login" -H "$JS" -d "{\"phone\":\"$PHONE\",\"password\":\"secret123\"}")" "401"

echo '--- ۵) رفعِ مسدودی، دسترسی را برمی‌گرداند ---'
# وضعیت باید **زنده** خوانده شود، نه یک بار در ورود.
Q "UPDATE \"Customer\" SET \"isActive\" = true WHERE phone='$PHONE';" >/dev/null
chk "سبد دوباره ۲۰۰" "$(code "$A/shop/cart" -H "Authorization: Bearer $TOK")" "200"

echo '--- ۶) مشتریِ حذف‌شده ---'
# توکنش امضای معتبر دارد ولی پشتش کسی نیست.
Q "DELETE FROM \"Cart\" WHERE \"customerId\" IN (SELECT id FROM \"Customer\" WHERE phone='$PHONE');" >/dev/null
Q "DELETE FROM \"Customer\" WHERE phone='$PHONE';" >/dev/null
chk "حذف‌شده ۴۰۱" "$(code "$A/shop/cart" -H "Authorization: Bearer $TOK")" "401"

echo '--- ۷) مهمانِ بی‌توکن هنوز سبد دارد ---'
#
# ⚠️ سنجهٔ ضدِ افراط.
#
#    نگهبانِ اختیاریِ سبد نباید مهمان را ببندد: مهمانِ بدون حساب باید
#    بتواند کالا در سبد بگذارد، وگرنه نرخِ تبدیل فروشگاه سقوط می‌کند.
#
#    افزودنِ پرس‌وجوی پایگاه داده به آن نگهبان، آسان‌ترین راه برای
#    شکستنِ همین بود.
chk "مهمان ۲۰۰" "$(code "$A/shop/cart" -H "x-guest-token: guest-status-probe")" "200"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
