#!/usr/bin/env bash
#
# هوش مصنوعی نمی‌تواند اختیارات کاربر را زیاد کند.
#
# ⚠️ این مجموعه یک حفرهٔ واقعی را گرفت — از ممیزی، نه از گزارشِ خرابی.
#
#    `ai.controller.ts` فقط `JwtAuthGuard` داشت.  یعنی **هر** کاربرِ
#    واردشده به همهٔ تحلیل‌ها دسترسی داشت.  با توکنِ زندهٔ یک
#    صندوق‌دار سنجیده شد:
#
#      /ai/manager-report      ۲۰۰
#      /ai/cashier-anomalies   ۲۰۰
#      /ai/sales-forecast      ۲۰۰
#      /ai/dead-stock          ۲۰۰
#      /ai/briefing            ۲۰۰
#
#    `cashier-anomalies` مغایرتِ غیرعادیِ صندوق را برمی‌گرداند — یعنی
#    ابزاری که برای **گرفتنِ** صندوق‌دار ساخته شده، در دسترسِ خودِ
#    صندوق‌دار بود.  می‌توانست ببیند چه چیزی از او ثبت شده و چه نه، و
#    رفتارش را بر همان اساس تنظیم کند.
#
#    جداسازیِ شرکت همیشه درست بود — `companyId` از پایگاه داده می‌آید
#    و هرگز به مدل داده نمی‌شود.  چیزی که نبود، جداسازیِ **نقش** بود.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d '\r'; }
TOK() { python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))"; }

# ۴۲۹ شکست نیست؛ «هنوز نه» است.
_C=''; _R=''
req() {
  local raw
  for _ in $(seq 1 12); do
    raw=$(curl -s -w ' %{http_code}' --max-time 30 "$@")
    _C=${raw##* }; _R=${raw% *}
    [ "$_C" = "429" ] || return 0
    sleep 8
  done
  return 0
}
code() { req "$@"; printf '%s' "$_C"; }
login() {
  req -X POST "$A/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}"
  printf '%s' "$_R" | TOK
}

JS="Content-Type: application/json"
T=${MOLIDO_TOKEN:-}
if [ -z "$T" ]; then T=$(login 'admin@molido.ai' "$PW"); fi
if [ -z "$T" ]; then echo "  ✗ ورود مدیر ناموفق"; exit 1; fi
AU="Authorization: Bearer $T"

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

CASHIER=ai.cashier@molido.ai
STOCK=ai.stock@molido.ai
cleanup() { Q "DELETE FROM \"User\" WHERE email IN ('$CASHIER','$STOCK');" >/dev/null; }
cleanup
trap cleanup EXIT

mk() {
  curl -s -X POST "$A/users" -H "$AU" -H "$JS" \
    -d "{\"firstName\":\"AI\",\"lastName\":\"Probe\",\"email\":\"$1\",\"password\":\"Correct#123\",\"role\":\"$2\"}" \
    >/dev/null
}
mk "$CASHIER" CASHIER
mk "$STOCK" INVENTORY

VC=$(login "$CASHIER" 'Correct#123')
VI=$(login "$STOCK" 'Correct#123')
chk "توکن صندوق‌دار" "$([ -n "$VC" ] && echo yes || echo no)" "yes"
chk "توکن انباردار" "$([ -n "$VI" ] && echo yes || echo no)" "yes"

echo '--- ۱) صندوق‌دار از تحلیل‌های مدیریتی بیرون است ---'
#
# ⚠️ مهم‌ترین سنجهٔ این فایل.
#
#    اگر ۲۰۰ بدهد، یعنی نقش‌ها روی AI بی‌اثرند و هر کارمندی گزارشِ
#    مدیریتی می‌خواند — از راهی که هیچ صفحه‌ای نشانش نمی‌دهد و هیچ
#    لاگی مشکوکش نمی‌بیند.
for r in manager-report price-suggestions; do
  chk "صندوق‌دار /$r ۴۰۳" "$(code "$A/ai/$r" -H "Authorization: Bearer $VC")" "403"
done

echo '--- ۲) ابزارِ کشفِ تخلفِ صندوق، از صندوق‌دار پنهان است ---'
#
# ⚠️ این از بقیه جداست چون تعارض منافع دارد.
#
#    هر ابزارِ دیگری که صندوق‌دار ببیند، حداکثر افشای اطلاعات است.
#    این یکی به او می‌گوید سامانه چه چیزی از او گرفته — یعنی به او
#    یاد می‌دهد چطور گرفته نشود.
chk "صندوق‌دار /cashier-anomalies ۴۰۳" \
  "$(code "$A/ai/cashier-anomalies" -H "Authorization: Bearer $VC")" "403"

echo '--- ۳) انباردار تحلیلِ انبار را می‌بیند ---'
# نگهبانی که همه را ببندد هم خراب است.
for r in inventory-analysis dead-stock reorder-suggestions expiry-analysis; do
  chk "انباردار /$r ۲۰۰" "$(code "$A/ai/$r" -H "Authorization: Bearer $VI")" "200"
done

echo '--- ۴) انباردار تحلیلِ مالی را نمی‌بیند ---'
# انبار و پول دو حوزهٔ جدا هستند؛ انباردار به مغایرت صندوق کاری ندارد.
chk "انباردار /cashier-anomalies ۴۰۳" \
  "$(code "$A/ai/cashier-anomalies" -H "Authorization: Bearer $VI")" "403"
chk "انباردار /sales-forecast ۴۰۳" \
  "$(code "$A/ai/sales-forecast" -H "Authorization: Bearer $VI")" "403"

echo '--- ۵) دستیار برای همه باز می‌ماند ---'
#
# ⚠️ سنجهٔ ضدِ افراط.
#
#    `ask` و `briefing` عمداً بازند: دستیار فقط دادهٔ همان شرکت را
#    می‌بیند و ابزارهایش محدودند.  بستنشان روی کارمند یعنی هیچ‌کس جز
#    مدیر از دستیار استفاده نمی‌کند — و آن‌وقت ساختنش بی‌معنی بود.
#
#    سخت‌سازی که قابلیت را بکشد، سخت‌سازی نیست.
chk "صندوق‌دار /briefing ۲۰۰" "$(code "$A/ai/briefing" -H "Authorization: Bearer $VC")" "200"

echo '--- ۶) مدیر همه را می‌بیند ---'
for r in manager-report cashier-anomalies sales-forecast dead-stock; do
  chk "مدیر /$r ۲۰۰" "$(code "$A/ai/$r" -H "$AU")" "200"
done

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
