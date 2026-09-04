#!/usr/bin/env bash
#
# گیتِ قابلیت بر اساس نسخهٔ فروش.
#
# ⚠️ دو سنجهٔ قرینه، و هر دو لازم‌اند:
#
#    ۱) **قابلیتِ نخریده باید بسته باشد.**  بدونش سه نسخه روی کاغذ‌اند و
#       در عمل یکی — و چیزی برای فروختن نمی‌ماند.
#
#    ۲) **هسته هرگز نباید بسته شود.**  کالا، فروش، حسابداری و ورود در
#       همهٔ نسخه‌ها هستند.  گیتی که هسته را ببندد، مشتری را در روزِ
#       ارتقا از کار می‌اندازد — بدترین لحظهٔ ممکن.

set -u
cd "$(dirname "$0")/.."

# WARN پایتونِ ویندوز آرگومان را با کدپیجِ سیستم می‌خواند؛ بدونِ این،
#      مقایسهٔ رشتهٔ فارسی همیشه False می‌شود و سنجهٔ پیامِ خطا بی‌دلیل
#      قرمز می‌ماند — همان تله‌ای که در `report-builder.sh` هم بود.
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

API=http://localhost:3000
CF="-f ../docker-compose.yml -f ../docker-compose.store.yml"
PASS=0; FAIL=0

chk() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  OK   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi
}
sec() { printf -- '--- %s ---\n' "$*"; }
Q() { docker compose $CF exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>&1 | tr -d '\r'; }
P() { python -c "$1" 2>/dev/null; }

PW="${MOLIDO_ADMIN_PASSWORD:-}"
[ -n "$PW" ] || PW="$(grep '^ADMIN_PASSWORD=' ../.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
login() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"admin@molido.ai\",\"password\":\"$PW\"}" \
    | P 'import sys,json;print(json.load(sys.stdin)["accessToken"])'
}
TOKEN=$(login)
[ -n "$TOKEN" ] || { echo "  ✗ ورود نشد"; exit 1; }
A=(-H "Authorization: Bearer $TOKEN")

CO=seed-company
# ⚠️ اشتراکِ اصلی ذخیره و در پایان برگردانده می‌شود.
#    یک بار آزمونی اشتراک را عوض کرد و برنگرداند، و مجموعه‌های بعدی
#    ساعت‌ها بی‌دلیل قرمز بودند.
ORIG=$(Q "SELECT plan||'|'||status FROM \"Subscription\" WHERE \"companyId\"='$CO'")
restore() {
  [ -n "$ORIG" ] && Q "UPDATE \"Subscription\" SET plan='${ORIG%%|*}', status='${ORIG##*|}',
                        \"updatedAt\"=now() WHERE \"companyId\"='$CO'" >/dev/null
}
trap restore EXIT

CODE() { curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "$API$1"; }
setplan() {
  Q "UPDATE \"Subscription\" SET plan='$1', \"updatedAt\"=now() WHERE \"companyId\"='$CO'" >/dev/null
  # ⚠️ حافظهٔ قابلیت با `upsert` پاک می‌شود، ولی این‌جا مستقیم در پایگاه
  #    نوشتیم.  پس صبر می‌کنیم تا حافظهٔ ۳۰ ثانیه‌ای منقضی شود — همان
  #    شبکهٔ ایمنی‌ای که برای این حالت گذاشته شده.
  sleep 31
}

# ---------------------------------------------------------------- پیشرفته
sec "۱) پیشرفته — بی‌حد"
setplan ADVANCED
# WARN رستوران در محصولِ `store` اصلاً بار نمی‌شود و ۴۰۴ می‌دهد، نه ۴۰۲.
#      `MOLIDO_PRODUCT` تعیین می‌کند این نصب چه دارد؛ نسخهٔ فروش تعیین
#      می‌کند مشتری چه خریده.  آزمون فقط قابلیت‌هایی را می‌سنجد که در
#      این محصول واقعاً وجود دارند.
chk "کالابرگ باز است"    "$(CODE /ration/accounts)"   "200"
chk "فروشگاه باز است"   "$(CODE /shop-admin/settings)" "200"
chk "خزانه باز است"     "$(CODE /treasury/accounts)" "200"
chk "CRM باز است"       "$(CODE /crm/leads)"         "200"
chk "حقوق باز است"      "$(CODE /payroll/slips)"     "200"

# ---------------------------------------------------------------- پایه
sec "۲) پایه — فقط کالا، فروش، صندوق"
setplan BASIC
# ⚠️ اصلِ ماجرا: آنچه نخریده باید بسته باشد، با ۴۰۲ نه ۴۰۳.
chk "کالابرگ بسته شد"    "$(CODE /ration/accounts)"   "402"
# WARN مسیرِ **مدیریتی** سنجیده می‌شود، نه ویترینِ عمومی.
#      `/shop/...` نگهبان ندارد چون خریدارِ ناشناس توکن ندارد؛
#      اینترسپتور بدونِ کاربر تصمیمی نمی‌گیرد و عبور می‌دهد.
chk "فروشگاه بسته شد"   "$(CODE /shop-admin/settings)" "402"
chk "خزانه بسته شد"     "$(CODE /treasury/accounts)" "402"
chk "CRM بسته شد"       "$(CODE /crm/leads)"         "402"
chk "حقوق بسته شد"      "$(CODE /payroll/slips)"     "402"

# ⚠️ سنجهٔ قرینه — هسته باید باز بماند.
sec "۳) پایه — هسته دست‌نخورده"
chk "کالا باز است"       "$(CODE /products)"          "200"
chk "فروش باز است"       "$(CODE /sales)"             "200"
chk "مشتریان باز است"    "$(CODE /customers)"         "200"
chk "انبار باز است"      "$(CODE /warehouses)"        "200"
chk "حسابداری باز است"   "$(CODE /accounting/accounts)" "200"
chk "گزارش‌ها باز است"    "$(CODE /reports/dashboard)" "200"
chk "کاربران باز است"    "$(CODE /users)"             "200"
chk "اشتراک باز است"     "$(CODE /subscription/plans)" "200"
# ⚠️ صندوق فروشگاهی جزو «پایه» است؛ اگر بسته شود، فروشگاه نمی‌فروشد.
chk "صندوق فروشگاهی باز" "$(CODE /retail/quick-keys)" "200"

# ---------------------------------------------------------------- پیام
sec "۴) پیامِ خطا قابلِ استفاده است"
R=$(curl -s "${A[@]}" "$API/ration/accounts")
J() { echo "$R" | P "import sys,json;d=json.load(sys.stdin);print($1)"; }
chk "کدِ ۴۰۲"            "$(J "d.get('statusCode')")"  "402"
chk "قابلیت را می‌گوید"  "$(J "d.get('feature')")"     "ration"
chk "نسخهٔ فعلی را می‌گوید" "$(J "d.get('currentPlan')")" "BASIC"
# ⚠️ «دسترسی نداری» و «نخریده‌ای» دو چیزند؛ رابط باید بتواند تفکیکشان کند.
chk "پیام دربارهٔ نسخه است" "$(J "'نسخه' in d.get('message','')")" "True"

# ---------------------------------------------------------------- حرفه‌ای
sec "۵) حرفه‌ای — میانه"
setplan PRO
chk "خزانه باز شد"      "$(CODE /treasury/accounts)" "200"
chk "CRM باز شد"        "$(CODE /crm/leads)"         "200"
chk "حقوق باز شد"       "$(CODE /payroll/slips)"     "200"
# ⚠️ رستوران و فروشگاه اینترنتی فقط در پیشرفته‌اند.
chk "کالابرگ هنوز بسته"  "$(CODE /ration/accounts)"   "402"
chk "فروشگاه هنوز بسته" "$(CODE /shop-admin/settings)" "402"

# ---------------------------------------------------------------- ارتقا
sec "۶) ارتقا"
# ⚠️ مسیرِ رسمیِ ارتقا نقشِ SUPER_ADMIN می‌خواهد و حسابِ فروشنده هنوز
#    ساخته نشده (`ops/create-vendor.sh` را کاربر باید اجرا کند).
#
#    پس این‌جا فقط سنجیده می‌شود که مسیر واقعاً محافظت‌شده است.  سنجهٔ
#    «ارتقا بی‌درنگ اثر می‌کند» تا آن حساب ساخته نشود **اجرا نمی‌شود** —
#    سبز کردنش با دور زدنِ نقش، چیزی را ثابت نمی‌کرد جز اینکه آزمون
#    می‌تواند نقش را دور بزند.
chk "ارتقا برای غیرفروشنده بسته است" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -H 'Content-Type: application/json' \
     -X PUT "$API/subscription/customers/$CO" -d '{"plan":"ADVANCED"}')" "403"

# ارتقای مستقیم در پایگاه + انقضای حافظه — مسیرِ TTL را می‌سنجد.
setplan ADVANCED
chk "پس از ارتقا، کالابرگ باز شد"  "$(CODE /ration/accounts)"     "200"
chk "و فروشگاه هم باز شد"          "$(CODE /shop-admin/settings)" "200"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
