#!/usr/bin/env bash
#
# رگرسیون کامل — همهٔ آزمون‌های یکپارچه، واحد، و QR.
#
# سرویس‌ها باید از قبل بالا باشند (bash deploy-check.sh).
#
# اجرا:  bash run-tests.sh
#        bash run-tests.sh tax loyalty     (فقط چند مجموعه)

cd "$(dirname "$0")" || exit 1

# رستوران در پروفایل store اجرا نمی‌شود؛ ماژول‌هایش بارگذاری نشده‌اند و
# همهٔ آزمون‌هایش ۴۰۴ می‌گیرند — شکستی که معنایی ندارد.
SUITES="integration shop pricing pos-pricing pos-workflow invoice accounts
        catalogue loyalty branding online-orders definitions tax import
        product-media operations hr crm freight sms ration audit-fixes quick-keys purchasing voice
        password ratelimit bundle apidocs"

[ $# -gt 0 ] && SUITES="$*"

total_pass=0; total_fail=0; broken=""

# خروجی کامل هر مجموعه نگه داشته می‌شود تا بررسی شکست به تکرار
# دستیِ کل رگرسیون نیاز نداشته باشد.
# رمز مدیر قابل تنظیم: نصبی که رمزش عوض شده نباید کل رگرسیون را
# بشکند — و پیام «۴۰۱ در همه‌جا» هیچ اشاره‌ای به علت نمی‌کند.
MOLIDO_ADMIN_PASSWORD=${MOLIDO_ADMIN_PASSWORD:-admin123}
export MOLIDO_ADMIN_PASSWORD

LOGDIR=${MOLIDO_LOGDIR:-.test-logs}
mkdir -p "$LOGDIR"

# یک ورود برای همهٔ مجموعه‌ها.
#
# سقف ورود عمداً سخت است (۱۰ در دقیقه، جلوی حدس رمز).  اگر هر مجموعه
# جدا وارد شود، همان سقف وسط رگرسیون می‌خورد، توکن خالی برمی‌گردد، و
# ده‌ها شکستِ بی‌ربط ظاهر می‌شود — دقیقاً همان ناپایداری‌ای که اجراهای
# پیاپی را با ۱۶ شکستِ متفاوت به هم می‌ریخت.
if [ -z "$MOLIDO_TOKEN" ]; then
  MOLIDO_TOKEN=$(curl -s -X POST "${MOLIDO_API:-http://localhost:3000}/auth/login"     -H 'Content-Type: application/json'     -d "{\"email\":\"admin@molido.ai\",\"password\":\"$MOLIDO_ADMIN_PASSWORD\"}"     | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
fi

if [ -z "$MOLIDO_TOKEN" ]; then
  echo "  ✗ ورود ناموفق — سرویس بالا نیست یا رمز عوض شده"
  exit 1
fi
export MOLIDO_TOKEN

for suite in $SUITES; do
  file="backend/test/$suite.sh"
  if [ ! -f "$file" ]; then
    printf '  %-15s فایل پیدا نشد\n' "$suite"
    broken="$broken $suite"
    continue
  fi

  out=$(bash "$file" 2>&1)
  printf '%s
' "$out" > "$LOGDIR/$suite.log"
  p=$(printf '%s' "$out" | grep -oE 'PASS: *[0-9]+' | tail -1 | grep -oE '[0-9]+')
  f=$(printf '%s' "$out" | grep -oE 'FAIL: *[0-9]+' | tail -1 | grep -oE '[0-9]+')

  # اگر مجموعه‌ای وسط کار بمیرد، خط جمع‌بندی چاپ نمی‌شود و شمارنده خالی
  # می‌ماند — که در جمع کل صفر حساب می‌شود و مثل «هیچ خطایی نبود» به نظر
  # می‌رسد.  پس نبودِ شمارنده خودش یک شکست است.
  if [ -z "$p" ] || [ -z "$f" ]; then
    printf '  %-15s بدون جمع‌بندی — مجموعه نیمه‌کاره مرد\n' "$suite"
    printf '%s\n' "$out" | tail -5
    broken="$broken $suite"
    continue
  fi

  printf '  %-15s PASS: %-5s FAIL: %s\n' "$suite" "$p" "$f"

  # سطرهای شکست همان‌جا چاپ شوند.  شکستی که فقط گاهی رخ می‌دهد اگر همان
  # لحظه دیده نشود، باید کل مجموعه دستی تکرار شود به امید تکرارش.
  if [ "${f:-0}" -gt 0 ]; then
    printf '%s\n' "$out" | grep -E '^[[:space:]]+(FAIL|✗)' | sed 's/^/      /'
  fi

  total_pass=$((total_pass + p))
  total_fail=$((total_fail + f))
done

echo '  ---------------------------------------'
printf '  %-15s PASS: %-5s FAIL: %s\n' "TOTAL" "$total_pass" "$total_fail"

if [ "$total_fail" -gt 0 ]; then
  printf '
  خروجی کامل: %s/<نام مجموعه>.log
' "$LOGDIR"
fi

echo
echo '--- jest ---'
(cd backend && npx jest 2>&1 | grep -E '^(Test Suites|Tests):')

echo '--- qr ---'
node web/scripts/verify-qr.mjs 2>&1 | tail -2

echo '--- mcp tools ---'
node mcp/tools.spec.mjs 2>&1 | tail -2

echo '--- mcp server ---'
node mcp/verify-server.mjs 2>&1 | tail -2

echo '--- speech ---'
node --experimental-strip-types web/scripts/verify-speech.mjs 2>&1 | tail -2

echo '--- i18n ---'
node --experimental-strip-types web/scripts/verify-i18n.mjs 2>&1 | tail -2

echo '--- invoice calc ---'
node --experimental-strip-types web/scripts/verify-invoice.mjs 2>&1 | tail -2

[ -n "$broken" ] && { printf '\n  مجموعه‌های خراب:%s\n' "$broken"; exit 1; }
exit $([ "$total_fail" -eq 0 ] && echo 0 || echo 1)
