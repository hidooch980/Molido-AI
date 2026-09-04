#!/usr/bin/env bash
#
# دیده‌بان — ماشینِ حالتش واقعاً اجرا می‌شود، نه فقط `bash -n`.
#
# ⚠️ این تنها اسکریپتی است که کارش **وقتی همه‌چیز خراب است** شروع
#    می‌شود.  اگر خودش خراب باشد، دقیقاً همان شب می‌فهمیم که نباید.
#
#    پس هر چهار حالت اجرا می‌شود: سالم، یک شکست (باید ساکت بماند)،
#    دو شکست (باید هشدار بدهد)، شکستِ سوم (نباید دوباره هشدار بدهد)،
#    و بازگشت.

cd "$(dirname "$0")/../.." || exit 1

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/home" "$TMP/state" "$TMP/bin"
: > "$TMP/home/.env"

# ⚠️ به‌جای پیامکِ واقعی و داکرِ واقعی، بدل — و بدل‌ها **ثبت** می‌کنند.
#
#    سنجهٔ اصلی «چند پیامک رفت» است، و بدونِ ثبت‌کردن نمی‌شود سنجیدش.
cat > "$TMP/bin/curl" <<'EOF'
#!/bin/sh
for a in "$@"; do
  case "$a" in
    *sms/send.json*) echo "sms" >> "$SMS_LOG"; exit 0;;
  esac
done
printf '%s' "$(cat "$HEALTH_CODE")"
EOF

cat > "$TMP/bin/docker" <<'EOF'
#!/bin/sh
echo "docker $*" >> "$DOCKER_LOG"
EOF
chmod +x "$TMP/bin/curl" "$TMP/bin/docker"

export SMS_LOG="$TMP/sms.log" DOCKER_LOG="$TMP/docker.log" HEALTH_CODE="$TMP/code"
: > "$SMS_LOG"; : > "$DOCKER_LOG"

run() {
  printf '%s' "$1" > "$HEALTH_CODE"
  PATH="$TMP/bin:$PATH" \
  MOLIDO_DIR="$TMP/home" \
  MOLIDO_WATCHDOG_STATE="$TMP/state" \
  WATCHDOG_SMS_TO=09120000000 \
  SMS_API_KEY=fake-key \
    sh ops/watchdog.sh > "$TMP/out.txt" 2>&1
}

sms_count() { wc -l < "$SMS_LOG" | tr -d ' '; }

echo '--- ۱) سالم: هیچ اتفاقی نمی‌افتد ---'
run 200
chk "پیامکی نرفت" "$(sms_count)" "0"
chk "شمارندهٔ شکست ساخته نشد" "$([ -f "$TMP/state/fails" ] && echo yes || echo no)" "no"

echo '--- ۱.۵) ۴۰۱ یعنی زنده، نه پایین ---'
#
# ⚠️ این اشکالِ **واقعی** بود و روی سرور پیدا شد.
#
#    نشانیِ پیش‌فرض `localhost:3000/health` بود، ولی پورتِ بک‌اند
#    منتشر نمی‌شود و آن مسیر هم پشتِ احراز هویت است.  دیده‌بان روی
#    سامانهٔ کاملاً سالم می‌گفت «پایین است» — و اگر کلیدِ پیامک تنظیم
#    بود، هر ده دقیقه هشدارِ کاذب می‌فرستاد.
#
#    نبض‌سنج می‌پرسد «جواب می‌دهد؟»، نه «اجازه دارم؟».
run 401
chk "۴۰۱ زنده شمرده می‌شود" "$(sms_count)" "0"
chk "شمارندهٔ شکست ساخته نشد" "$([ -f "$TMP/state/fails" ] && echo yes || echo no)" "no"

# ⚠️ ولی ۵xx **پایین** است: بالا آمده و خراب است.
run 503; run 503
chk "۵۰۳ هشدار می‌دهد" "$(sms_count)" "1"

# ⚠️ پاک‌سازیِ **کامل** — لاگِ داکر هم.
#
#    نسخهٔ اول فقط حالت و لاگِ پیامک را پاک کرد، ولی ۵۰۳ها یک
#    «بلند کردن» هم ثبت کرده بودند و سنجهٔ بخشِ ۳ دو تا می‌دید.
#    نشتِ حالت بین بخش‌های یک آزمون، همان چیزی است که آزمون را
#    غیرقابل اعتماد می‌کند.
run 200
rm -rf "$TMP/state"; mkdir -p "$TMP/state"
: > "$SMS_LOG"; : > "$DOCKER_LOG"

echo '--- ۲) یک شکست: ساکت می‌ماند ---'
# ⚠️ سنجهٔ مهم.  بازراه‌اندازیِ عادی هم یک شکست می‌سازد؛ اگر اینجا
#    پیامک می‌رفت، هر استقرار یک هشدارِ کاذب داشت — و هشدارِ کاذب
#    یعنی هشدارِ واقعیِ بعدی هم نادیده گرفته می‌شود.
run 000
chk "هنوز پیامکی نرفت" "$(sms_count)" "0"
chk "شمارنده ۱ شد" "$(cat "$TMP/state/fails")" "1"

echo '--- ۳) دو شکستِ پیاپی: هشدار ---'
run 502
chk "یک پیامک رفت" "$(sms_count)" "1"
chk "پیش از هشدار بلند کردن را امتحان کرد" \
  "$(grep -c 'up -d backend' "$DOCKER_LOG")" "1"

echo '--- ۴) شکستِ سوم: تکرار نمی‌کند ---'
# ⚠️ بدونِ این، یک قطعیِ شبانه دوازده پیامک در ساعت می‌فرستد.
run 502
chk "پیامکِ دوم نرفت" "$(sms_count)" "1"

echo '--- ۵) بازگشت: یک پیامکِ خبرِ خوب ---'
run 200
chk "پیامکِ بازگشت رفت" "$(sms_count)" "2"
chk "حالت پاک شد" "$([ -f "$TMP/state/alerted" ] && echo yes || echo no)" "no"

echo '--- ۶) قطعیِ بعدی دوباره هشدار می‌دهد ---'
# ⚠️ اگر حالت درست پاک نشده باشد، دیده‌بان پس از اولین قطعی برای
#    همیشه ساکت می‌ماند — بدترین حالتِ ممکن، چون سالم به نظر می‌رسد.
run 000; run 000
chk "هشدارِ تازه رفت" "$(sms_count)" "3"

echo '--- ۷) بدونِ تنظیمِ پیامک هم نمی‌شکند ---'
# ⚠️ روی سروری که هنوز کلیدِ پیامک ندارد باید بی‌صدا کار کند، نه
#    اینکه با خطا بایستد — وگرنه cron هر پنج دقیقه لاگِ خطا می‌ریزد.
rm -rf "$TMP/state"; mkdir -p "$TMP/state"; : > "$SMS_LOG"
printf '000' > "$HEALTH_CODE"
for _ in 1 2; do
  PATH="$TMP/bin:$PATH" MOLIDO_DIR="$TMP/home" MOLIDO_WATCHDOG_STATE="$TMP/state" \
    sh ops/watchdog.sh >/dev/null 2>&1
done
chk "بدونِ کلید خطا نداد" "$?" "0"
chk "و پیامکی هم نفرستاد" "$(sms_count)" "0"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
