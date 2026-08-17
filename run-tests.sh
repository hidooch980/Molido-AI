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
#
# ولی «اینجا اجرا نمی‌شود» نباید یعنی «هیچ‌جا اجرا نمی‌شود».  رگرسیون
# رستوران در run-resto-tests.sh است و روی پروفایل خودش اجرا می‌شود.
SUITES="e2e-cycles integration shop shop-filter count-app upload-security pricing pos-pricing pos-workflow invoice accounts
        catalogue loyalty branding online-orders definitions tax import
        product-media operations hr crm freight sms ration audit-fixes quick-keys purchasing voice
        password ratelimit bundle apidocs untested records roles restore"

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
  # سه علت متفاوت، سه راه‌حل متفاوت — حدس زدن فقط وقت هدر می‌دهد.
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST "${MOLIDO_API:-http://localhost:3000}/auth/login"     -H 'Content-Type: application/json' -d "{\"email\":\"admin@molido.ai\",\"password\":\"$MOLIDO_ADMIN_PASSWORD\"}")
  case "$code" in
    000) echo "  ✗ ورود ناموفق — سرویس روی ${MOLIDO_API:-http://localhost:3000} پاسخ نمی‌دهد" ;;
    401) echo "  ✗ ورود ناموفق — رمز نادرست است (MOLIDO_ADMIN_PASSWORD را بده)" ;;
    429) echo "  ✗ ورود ناموفق — سقف ورود خورده؛ چند دقیقه صبر کن" ;;
    *)   echo "  ✗ ورود ناموفق — پاسخ $code از /auth/login" ;;
  esac
  exit 1
fi
export MOLIDO_TOKEN

# ⚠️ پیش از هر مجموعه صبر می‌کنیم تا سطلِ محدودیت نرخ خالی شود.
#
# سقف سراسری ۱۲۰۰ درخواست در دقیقه است و اجرای پشت‌سرهمِ همهٔ مجموعه‌ها
# از آن رد می‌شود.  نتیجه‌اش ۴۲۹ با بدنهٔ خالی بود که در آزمون‌ها به شکل
# «got= want=1200000» ظاهر می‌شد — یعنی دقیقاً شبیه یک اشکال منطقی.
#
# دو مجموعه (`ration` و `untested`) به همین دلیل قرمز می‌شدند در حالی که
# جداگانه هر دو کاملاً سبزند.  قرمزِ دروغین از قرمزِ راست بدتر است: آدم
# را به بی‌اعتنایی به قرمز عادت می‌دهد.
# سرور خودش سهمیهٔ باقی‌مانده را در هدر `X-RateLimit-Remaining-long`
# می‌دهد، پس حدس نمی‌زنیم: تا وقتی جا برای یک مجموعهٔ کامل نباشد صبر
# می‌کنیم.  «صبر تا وقتی ۴۲۹ نگیریم» کافی نیست — سطل ممکن است پر ولی
# هنوز سرریز نکرده باشد و سرریز وسط مجموعه رخ دهد.
QUOTA_NEEDED=${QUOTA_NEEDED:-250}

# ⚠️ حین اجرای این مجموعه، کانتینرها را دوباره نسازید.
#
#    `docker compose build backend && up -d backend` وسط اجرا، اتصال‌های
#    باز را قطع می‌کند.  نتیجه‌اش ده‌ها شکستِ دروغین با **پاسخ خالی**
#    است — که با ۴۲۹ فرق دارد: ۴۲۹ بدنهٔ JSON دارد، قطعِ اتصال هیچ.
#
#    دو بار همین اتفاق افتاد و هر بار دقایقی صرف عیب‌یابی چیزی شد که
#    اصلاً خراب نبود.  برچسب `<<پاسخ-JSON-نبود: ۰ نویسه>>` نشانهٔ همین
#    است، نه اشکال منطقی.

wait_for_quota() {
  local i left
  for i in $(seq 1 30); do
    left=$(curl -s -D - -o /dev/null --max-time 5       "${MOLIDO_API:-http://localhost:3000}/health" -H "Authorization: Bearer $MOLIDO_TOKEN"       | grep -i '^X-RateLimit-Remaining-long:' | tr -dc '0-9')
    # اگر هدر نبود (سرور قدیمی یا خطا) بی‌جهت معطل نمی‌کنیم.
    [ -z "$left" ] && return 0
    [ "$left" -ge "$QUOTA_NEEDED" ] && return 0
    sleep 5
  done
  echo "  ⚠️ سهمیهٔ نرخ پس از ۱۵۰ ثانیه هنوز کمتر از $QUOTA_NEEDED است"
  return 1
}

for suite in $SUITES; do
  file="backend/test/$suite.sh"
  if [ ! -f "$file" ]; then
    printf '  %-15s فایل پیدا نشد\n' "$suite"
    broken="$broken $suite"
    continue
  fi

  wait_for_quota
  out=$(bash "$file" 2>&1)

  # ─── تفکیک شکستِ گذرا از واقعی ───
  #
  # بارها مجموعه‌ای در اجرای کامل چند شکست داشت و به‌تنهایی سبز بود.
  # نشانه‌اش همیشه `<<پاسخ-JSON-نبود: ۰ نویسه>>` بود — بدنهٔ خالی، که
  # با ۴۲۹ فرق دارد (۴۲۹ بدنهٔ JSON دارد).
  #
  # یک بار اجرای دوباره، حدس را از عیب‌یابی حذف می‌کند.
  if printf '%s' "$out" | grep -q 'FAIL'; then
    printf '  %-15s شکست داشت؛ یک بار دیگر…\n' "$suite"
    wait_for_quota
    retry=$(bash "$file" 2>&1)
    if ! printf '%s' "$retry" | grep -q 'FAIL'; then
      printf '  %-15s ⚠️  شکستِ گذرا بود — بار دوم سبز شد\n' "$suite"
      out="$retry"
    else
      out="$retry"
    fi
  fi
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

echo '--- price speech ---'
node --experimental-strip-types web/scripts/verify-price-speech.mjs 2>&1 | tail -2

echo '--- phone ---'
node --experimental-strip-types web/scripts/verify-phone.mjs 2>&1 | tail -2

echo '--- permissions ---'
node --experimental-strip-types web/scripts/verify-permissions.mjs 2>&1 | tail -2

echo '--- i18n ---'
node --experimental-strip-types web/scripts/verify-i18n.mjs 2>&1 | tail -2

echo '--- invoice calc ---'
node --experimental-strip-types web/scripts/verify-invoice.mjs 2>&1 | tail -2

echo '--- corpus order ---'
node --experimental-strip-types web/scripts/verify-corpus-order.mjs 2>&1 | tail -2

echo '--- theme colors ---'
node web/scripts/verify-theme-colors.mjs 2>&1 | tail -2

echo '--- contrast audit ---'
node web/scripts/audit-contrast.mjs 2>&1 | tail -2

echo '--- default secrets ---'
node web/scripts/verify-no-default-secrets.mjs 2>&1 | tail -2

echo '--- labels ---'
node web/scripts/verify-labels.mjs 2>&1 | tail -2

echo '--- date parsing ---'
node --experimental-strip-types web/scripts/verify-date.mjs 2>&1 | tail -2

echo '--- auth throttle ---'
node web/scripts/verify-auth-throttle.mjs 2>&1 | tail -2

# سقف **صفر**: پنل کاملاً سه‌زبانه است و باید بماند.
# هر رشتهٔ فارسیِ تازه‌ای که کسی مستقیم در JSX بنویسد، همین‌جا گرفته
# می‌شود — پیش از آنکه به کاربر عرب‌زبان یا انگلیسی‌زبان برسد.
echo '--- i18n quotes ---'
node web/scripts/verify-i18n-quotes.mjs 2>&1 | tail -2

echo '--- i18n keys ---'
node web/scripts/verify-i18n-keys.mjs 2>&1 | tail -2

echo '--- t shadow ---'
node web/scripts/verify-no-t-shadow.mjs 2>&1 | tail -2

echo '--- hardcoded fa ---'
node web/scripts/audit-hardcoded-fa.mjs --max 175 2>&1 | tail -2

[ -n "$broken" ] && { printf '\n  مجموعه‌های خراب:%s\n' "$broken"; exit 1; }
exit $([ "$total_fail" -eq 0 ] && echo 0 || echo 1)
