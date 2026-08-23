#!/usr/bin/env bash
#
# محدودیت نرخ: سخت روی ورود، باز روی کار روزمره.
#
# چرا این آزمون هست: سقف قبلی ۱۲۰ درخواست در دقیقه برای همه‌چیز بود.
# صندوق واقعی به‌راحتی از آن رد می‌شود (هر اسکن چند درخواست است)، و
# وقتی همان سقف روی `login` می‌خورد، توکن خالی برمی‌گردد و **همهٔ**
# درخواست‌های بعدی ۴۰۱ می‌گیرند — خطایی که هیچ ربطی به علت واقعی ندارد.
# دقیقاً همین، رگرسیون را گاه‌به‌گاه با ۱۶ شکستِ بی‌ربط می‌شکست.
#
# ⚠️ این آزمون عمداً سقف ورود را مصرف می‌کند؛ آخر مجموعه اجرا شود.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# توکن مشترک — ورودِ اضافی همان سقفی را می‌خورد که قرار است سنجیده شود.
# ⚠️ این مجموعه در حلقه با رمزِ **غلط** به حسابِ مدیر می‌کوبد
#    (سنجهٔ «سقف ورود») — و از امروز هر تلاشِ ناموفق شمرده می‌شود.
#
#    ده تلاش در پانزده دقیقه یعنی حساب **قفل** می‌شود.  یعنی همین
#    مجموعه، حسابِ مدیر را قفل می‌کند و می‌رود؛ هر مجموعه‌ای که بعدش
#    بیاید «رمز نادرست است» می‌گیرد — پیامی که مستقیماً به رمز اشاره
#    می‌کند در حالی که رمز درست است و حساب قفل است.
#
#    اندازه‌گیری‌شده: اجرای بعدی از سنجهٔ فروش افتاد و شش شکست داد که
#    هیچ‌کدام ربطی به فروش نداشت.
#
#    قفل درست کار می‌کند — سنجه باید بعد از خودش تمیز کند.  `trap`
#    تضمین می‌کند حتی مرگِ وسطِ کار هم قفل را جا نگذارد.
unlock_admin() {
  $C exec -T postgres psql -U postgres -d molido_ai -q -c     "UPDATE \"User\" SET \"lockedUntil\" = NULL WHERE email='admin@molido.ai';" >/dev/null 2>&1
  $C exec -T postgres psql -U postgres -d molido_ai -q -c     "DELETE FROM \"LoginAttempt\" WHERE email='admin@molido.ai';" >/dev/null 2>&1
}
unlock_admin
trap unlock_admin EXIT

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@molido.ai","password":"'"$PW"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
AU="Authorization: Bearer $T"

echo '--- 1) توکن گرفته شد ---'
chk "ورود موفق" "$([ -n "$T" ] && echo yes || echo no)" "yes"

echo '--- 2) کار روزمره محدود نمی‌شود ---'
# ۲۰۰ درخواست پشت‌هم — بیش از سقف قدیمیِ ۱۲۰.  صندوقی که تند بارکد
# می‌زند همین قدر درخواست تولید می‌کند.
throttled=0
for i in $(seq 1 200); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$A/products" -H "$AU" </dev/null)
  [ "$code" = "429" ] && throttled=$((throttled+1))
done
chk "۲۰۰ درخواست پیاپی رد نشد" "$throttled" "0"

echo '--- 3) توکن هنوز معتبر است ---'
# اگر سقف عمومی بخورد، درخواست بعدی ۴۲۹ می‌گیرد نه ۲۰۰ — و این همان
# جایی است که آزمون‌ها گمراه می‌شدند.
chk "درخواست پس از هجوم" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$A/products" -H "$AU")" "200"

echo '--- 4) حدس رمز محدود می‌شود ---'
# ۱۵ تلاش با رمز غلط: سقف ورود ۱۰ در دقیقه است، پس باید جایی ۴۲۹ بدهد.
# بدون این، پنلی که روی شبکهٔ محلی باز است در برابر حدس رمز بی‌دفاع است.
blocked=0
for i in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 -X POST $A/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@molido.ai","password":"wrong-guess"}' </dev/null)
  [ "$code" = "429" ] && blocked=$((blocked+1))
done
chk "حدس رمز متوقف شد" "$([ "$blocked" -gt 0 ] && echo yes || echo no)" "yes"

echo '--- 5) محدودیت ورود، کار بقیهٔ سامانه را نمی‌بندد ---'
# سطل ورود جداست؛ اگر مشترک بود، یک نفر با حدس رمز می‌توانست کل
# فروشگاه را از کار بیندازد.
chk "API با توکن معتبر باز است" \
  "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$A/products" -H "$AU")" "200"

printf '\n   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
