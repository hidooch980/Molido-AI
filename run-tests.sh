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
SUITES="e2e-cycles integration shop shop-filter shop-takeover customer-status count-app upload-security pricing pos-pricing pos-workflow invoice accounts
        catalogue loyalty branding online-orders definitions tax import
        product-media operations hr crm freight offline-purchase avg-cost ledger-health sms ration audit-fixes quick-keys purchasing voice treasury-assets ai-roles api-keys restaurant e2e-resto gov-sso site-sales shahkar self-order catalog watchdog structure caddy edge ops-scripts shop-payment cashbox installments subscription seasonal fiscal-open statement
        password mfa login-hardening session-revocation refresh-revocation refresh-cookie ratelimit bundle apidocs untested records roles restore"

# ⚠️ `restaurant` و `e2e-resto` تا امروز **در این فهرست نبودند**.
#
#    هر دو فایل وجود داشتند — ۴۷۴ خط و حدود ۸۹ سنجه — و هیچ‌وقت اجرا
#    نمی‌شدند.  یعنی قلبِ محصولِ رستوران هرگز آزموده نشد.
#
#    نبودشان دیده نشد چون هر دو نگهبانِ محصول دارند و در نمایهٔ
#    فروشگاه به‌هرحال `SKIPPED` می‌دادند؛ کسی که فقط فروشگاه را اجرا
#    می‌کرد، تفاوتی بین «رد شد» و «اصلاً نبود» نمی‌دید.

# ⚠️ سه مجموعهٔ احراز هویت (`password`, `login-hardening`,
#    `session-revocation`) عمداً **آخر** فهرست‌اند.
#
#    هر سه سقفِ `/auth/login` را مصرف می‌کنند (ده در دقیقه) و اگر اول
#    بیایند، سهمیه را می‌خورند و مجموعه‌های بعدی با ۴۲۹ می‌افتند —
#    با پیام‌هایی که هیچ ربطی به علت ندارند.
#
#    خودشان در برابر ۴۲۹ صبورند و منتظرِ باز شدنِ پنجره می‌مانند، پس
#    آخر بودنشان فقط کندشان می‌کند، نه قرمزشان.

# ⚠️ فهرستِ کامل **پیش از** بازنویسی با آرگومان نگه داشته می‌شود.
#
#    نگهبانِ «مجموعهٔ ثبت‌نشده» به `SUITES` نگاه می‌کرد، و خطِ بعدی
#    همان را با آرگومان‌های خط فرمان جایگزین می‌کند.  نتیجه این بود که
#    هر اجرای زیرمجموعه‌ای، **همهٔ** مجموعه‌های دیگر را «ثبت‌نشده»
#    گزارش می‌کرد.
#
#    این از نبودِ نگهبان بدتر است: هشداری که همیشه در حالتِ عادی
#    می‌آید، آدم را عادت می‌دهد ردش کند — و آن روزی که راست بگوید هم
#    رد می‌شود.
ALL_SUITES="$SUITES"

[ $# -gt 0 ] && SUITES="$*"

total_pass=0; total_fail=0; broken=""; skipped=""

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

# ⚠️ توکنِ مشترک می‌تواند **وسطِ اجرا بمیرد**.
#
#    `password.sh` عمداً رمزِ مدیر را عوض می‌کند و برمی‌گرداند — و از
#    وقتی تغییر رمز نشست‌ها را باطل می‌کند، همان لحظه توکنِ مشترک
#    می‌میرد.  هر مجموعه‌ای که بعدش بیاید ۴۰۱ می‌گیرد.
#
#    اندازه‌گیری‌شده: یک اجرای کامل با ۸۹ شکست، که ۴۰ تایشان
#    `got=401` بودند و بقیه پیامدِ همان — هیچ‌کدام اشکالِ واقعی
#    نبودند.  و هیچ‌کدام هم نمی‌گفتند علت چیست.
#
#    پیش از این بی‌خطر بود، چون توکن تا هفت روز زنده می‌ماند هرچه هم
#    که اتفاق می‌افتاد.  یعنی رفعِ امنیتی، این شکنندگی را **آشکار**
#    کرد، نه ایجاد.
#
#    راهش این نیست که `password.sh` را بی‌خطر کنیم — آن مجموعه عمداً
#    حسابِ واقعیِ مدیر را می‌آزماید و بخشِ seed‌اش هم به همان نیاز
#    دارد.  راهش این است که اجراکننده بفهمد توکن مرده و تازه‌اش کند.
ensure_token() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 10         "${MOLIDO_API:-http://localhost:3000}/auth/me"         -H "Authorization: Bearer $MOLIDO_TOKEN")" = "200" ] && return 0
  printf '  … توکن مشترک باطل شده؛ ورود دوباره
' >&2
  # ⚠️ `wait_for_quota` اینجا کافی **نیست** و پیش‌تر نبود.
  #
  #    آن تابع سهمیهٔ **عمومی** را از `/health` می‌خواند (۱۲۰۰ در
  #    دقیقه) در حالی که `/auth/login` سطلِ جداگانه و به‌مراتب تنگ‌ترِ
  #    خودش را دارد: اندازه‌گیری‌شده ~۱۰ در دقیقه.
  #
  #    نتیجه: سهمیهٔ عمومی ۱۰۵۸ باقی‌مانده نشان می‌داد، نگهبان بی‌درنگ
  #    سبز می‌گفت، و ورودِ بعدی ۴۲۹ می‌خورد.  یک اجرای کامل با ۱۳
  #    مجموعهٔ «نیمه‌کاره مرده» تمام شد — `import`، `avg-cost`،
  #    `freight`، `purchasing` و بقیه — که هیچ‌کدام عیبی نداشتند.
  #
  #    خودِ پاسخِ ۴۲۹ می‌گوید چقدر باید صبر کرد (`Retry-After-long`).
  #    پس به‌جای حدس زدنِ سهمیه، از خودِ سرور می‌پرسیم.
  wait_for_quota
  local try body wait_s
  for try in 1 2 3 4; do
    body=$(curl -s -D /tmp/molido-login-hdr.$$ -X POST "${MOLIDO_API:-http://localhost:3000}/auth/login"       -H 'Content-Type: application/json'       -d "{\"email\":\"admin@molido.ai\",\"password\":\"$MOLIDO_ADMIN_PASSWORD\"}")
    MOLIDO_TOKEN=$(printf '%s' "$body" | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
    [ -n "$MOLIDO_TOKEN" ] && break

    # فقط برای ۴۲۹ صبر می‌کنیم.  رمزِ غلط با صبر کردن درست نمی‌شود و
    # چهار بار تلاش فقط چهار دقیقه وقت را هدر می‌دهد.
    grep -qi '^HTTP/[0-9.]* 429' /tmp/molido-login-hdr.$$ || break
    wait_s=$(grep -i '^Retry-After-long:' /tmp/molido-login-hdr.$$ | tr -dc '0-9')
    wait_s=${wait_s:-60}
    printf '  … سقف ورود؛ %s ثانیه صبر (تلاش %s از ۴)
' "$wait_s" "$try" >&2
    sleep "$((wait_s + 2))"
  done
  rm -f /tmp/molido-login-hdr.$$
  [ -z "$MOLIDO_TOKEN" ] && printf '  ✗ ورود دوباره ناموفق ماند
' >&2
  export MOLIDO_TOKEN
}

for suite in $SUITES; do
  file="backend/test/$suite.sh"
  if [ ! -f "$file" ]; then
    printf '  %-15s فایل پیدا نشد\n' "$suite"
    broken="$broken $suite"
    continue
  fi

  wait_for_quota
  ensure_token
  out=$(bash "$file" 2>&1)

  # ─── تفکیک شکستِ گذرا از واقعی ───
  #
  # بارها مجموعه‌ای در اجرای کامل چند شکست داشت و به‌تنهایی سبز بود.
  # نشانه‌اش همیشه `<<پاسخ-JSON-نبود: ۰ نویسه>>` بود — بدنهٔ خالی، که
  # با ۴۲۹ فرق دارد (۴۲۹ بدنهٔ JSON دارد).
  #
  # یک بار اجرای دوباره، حدس را از عیب‌یابی حذف می‌کند.
  # ⚠️ `grep -q 'FAIL'` نبود — و این ایراد سکوتِ کامل داشت.
  #
  #    خطِ جمع‌بندیِ **هر** مجموعه‌ای `PASS: 31   FAIL: 0` است، یعنی
  #    رشتهٔ `FAIL` همیشه پیدا می‌شد.  نتیجه دو چیز بود:
  #
  #      ۱. هر مجموعه‌ای، حتی کاملاً سبز، **دو بار** اجرا می‌شد —
  #         دو برابر زمان و دو برابر مصرفِ سهمیهٔ نرخ.
  #      ۲. بدتر: خودِ سازوکارِ «تفکیکِ شکستِ گذرا» مرده بود.  چون
  #         اجرای دوم هم همیشه «شکست» تشخیص داده می‌شد، پیامِ
  #         «بار دوم سبز شد» **هرگز** چاپ نشد.
  #
  #    حالا عددِ شکست خوانده می‌شود.  نبودِ عدد هم شکست است: مجموعه‌ای
  #    که نیمه‌کاره مرده، جمع‌بندی چاپ نمی‌کند.
  fails=$(printf '%s' "$out" | grep -oE 'FAIL: *[0-9]+' | tail -1 | grep -oE '[0-9]+')
  if [ -z "$fails" ] || [ "$fails" -gt 0 ]; then
    printf '  %-15s شکست داشت؛ یک بار دیگر…\n' "$suite"
    wait_for_quota
    ensure_token
    retry=$(bash "$file" 2>&1)
    rfails=$(printf '%s' "$retry" | grep -oE 'FAIL: *[0-9]+' | tail -1 | grep -oE '[0-9]+')
    if [ -n "$rfails" ] && [ "$rfails" -eq 0 ]; then
      printf '  %-15s ⚠️  شکستِ گذرا بود — بار دوم سبز شد\n' "$suite"
    fi
    out="$retry"
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

  # ⚠️ «۰ سنجه» و «همه سبز» در گزارش یکسان دیده می‌شوند.
  #
  #    مجموعه‌ای که همهٔ سنجه‌هایش را رد می‌کند `PASS: 0  FAIL: 0`
  #    می‌دهد — دقیقاً شبیهِ سالم بودن.  `restaurant` و `self-order`
  #    در نمایهٔ فروشگاه عمداً همین‌اند و مشکلی نیست؛ خطر آن روزی است
  #    که مجموعه‌ای **ناخواسته** خاموش شود (شرطی که عوض شده، فایلی که
  #    زودتر خارج می‌شود) و ماه‌ها کسی نفهمد — چون گزارش سبز است.
  #
  #    پس صفر سنجه برچسبِ خودش را می‌گیرد، نه رنگِ سبز.
  if [ "${p:-0}" -eq 0 ] && [ "${f:-0}" -eq 0 ]; then
    printf '  %-15s رد شد — هیچ سنجه‌ای اجرا نشد
' "$suite"
    skipped="$skipped $suite"
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

# مجموعه‌های رد‌شده در جمع کل دیده نمی‌شوند؛ اینجا نام‌برده می‌شوند تا
# «رد شد» با «سبز شد» اشتباه گرفته نشود.
if [ -n "$skipped" ]; then
  printf '  رد شده (۰ سنجه):%s
' "$skipped"
fi

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

echo '--- offline queue ---'
node --experimental-strip-types web/scripts/verify-offline-queue.mjs 2>&1 | tail -2

echo '--- provider scope ---'
node web/scripts/verify-provider-scope.mjs 2>&1 | tail -2

echo '--- guard wiring ---'
node web/scripts/verify-guard-wiring.mjs 2>&1 | tail -2

# ⚠️ تحلیلی که ساخته شده ولی صفحه‌ای صدایش نمی‌زند، هیچ نشانه‌ای
#    نمی‌دهد: API سالم است، صفحه هم سالم است.  شش تحلیل ماه‌ها
#    این‌طور نامرئی ماندند.
echo '--- insights coverage ---'
node web/scripts/verify-insights-coverage.mjs 2>&1 | tail -2
ins_rc=${PIPESTATUS[0]}
[ "$ins_rc" -eq 0 ] || broken="$broken insights-coverage"

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

# ⚠️ این یکی خروجیِ ناصفر می‌دهد و عمداً اجرا را می‌شکند.
#
#    وب و بک‌اند هرکدام فهرستِ قابلیت‌های محصول را دارند و باید یکی
#    بمانند.  یک بار از هم دور افتادند (`municipality` در برابر
#    `municipal`) و هیچ خطایی نداد — فقط ۱۲ ورودیِ منو بی‌گیت ماندند
#    و کاربرِ فروشگاه با کلیک روی «پارکینگ» ۴۰۴ می‌گرفت.
#
#    برخلافِ نگهبان‌های هشداری، اینجا مثبتِ کاذب ممکن نیست: دو فهرست
#    یا یکی‌اند یا نیستند.
echo '--- product features ---'
node web/scripts/verify-product-features.mjs 2>&1 | tail -3
feat_rc=${PIPESTATUS[0]}
[ "$feat_rc" -eq 0 ] || broken="$broken product-features"

# ⚠️ مجموعه‌ای که نوشته شده ولی در `SUITES` نیست، هرگز اجرا نمی‌شود.
#
#    `restaurant` و `e2e-resto` دقیقاً همین بودند: ۴۷۴ خط و حدود ۸۹
#    سنجه که ماه‌ها اجرا نشدند.  نبودشان دیده نشد چون هر دو نگهبانِ
#    محصول دارند و در نمایهٔ فروشگاه به‌هرحال `SKIPPED` می‌دادند —
#    کسی تفاوتِ «رد شد» و «اصلاً نبود» را نمی‌دید.
#
#    خروجیِ گزارش هم کمکی نمی‌کرد: مجموعه‌ای که اجرا نشده، هیچ سطری
#    نمی‌سازد.  غیابْ چیزی برای دیدن ندارد؛ باید فعالانه شمرده شود.
# ⚠️ متغیری که در `.env.example` مستند شده ولی به کانتینر پاس نشده،
#    در توسعه کار می‌کند و در تولید ساکت می‌ماند.  چهار بار تکرار شد.
echo '--- env wiring ---'
node web/scripts/verify-env-wiring.mjs 2>&1 | tail -3
env_rc=${PIPESTATUS[0]}
[ "$env_rc" -eq 0 ] || broken="$broken env-wiring"

echo '--- suite registration ---'
unregistered=''
# ⚠️ فاصله‌ها یکدست می‌شوند، وگرنه نامِ **آخرِ هر خط** پیدا نمی‌شود.
#
#    `SUITES` چندخطی است؛ پس از `accounts`، `import` و `e2e-resto`
#    خطِ جدید می‌آید نه فاصله، و الگوی `" $n "` نمی‌خورد.  نخستین
#    نسخهٔ همین نگهبان دقیقاً همان سه نام را «ثبت‌نشده» گزارش کرد در
#    حالی که هر سه در فهرست بودند.
suites_flat=" $(printf '%s' "$ALL_SUITES" | tr -s '[:space:]' ' ') "
for f in backend/test/*.sh; do
  n=$(basename "$f" .sh)
  # `leak-check` ابزارِ کمکی است نه مجموعه؛ خودش از بیرون صدا زده می‌شود.
  [ "$n" = "leak-check" ] && continue
  case "$suites_flat" in *" $n "*) ;; *) unregistered="$unregistered $n" ;; esac
done
if [ -n "$unregistered" ]; then
  printf '  FAIL مجموعهٔ ثبت‌نشده:%s
' "$unregistered"
  broken="$broken suite-registration"
else
  printf '  OK   هر فایلِ آزمون در فهرست هست
'
fi

[ -n "$broken" ] && { printf '\n  مجموعه‌های خراب:%s\n' "$broken"; exit 1; }
exit $([ "$total_fail" -eq 0 ] && echo 0 || echo 1)
