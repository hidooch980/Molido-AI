#!/bin/sh
#
# دیده‌بان — هر پنج دقیقه سلامت را می‌سنجد و در قطعی پیامک می‌زند.
#
#   crontab:  */5 * * * * /opt/molido/ops/watchdog.sh >> /var/log/molido-watchdog.log 2>&1
#
# ⚠️ چرا لازم است؟  چون امروز راهی برای **دانستنِ** قطعی نداریم.
#
#    `unless-stopped` کانتینر را برمی‌گرداند، ولی اگر برنگردد —
#    مهاجرتِ شکسته، دیسکِ پر، پستگرسِ بالا نیامده — هیچ‌کس خبردار
#    نمی‌شود تا اولین مشتری زنگ بزند.  و آن یعنی قطعی به اندازهٔ یک
#    شبِ کامل طول بکشد.
#
# ⚠️ پیامک فقط پس از **دو** شکستِ پیاپی.
#
#    یک شکستِ تنها معمولاً بازراه‌اندازیِ عادی یا یک لحظه کندی است.
#    هشدار برایش یعنی پیامکِ بی‌مورد، و پیامکِ بی‌مورد یعنی هشدارِ
#    بعدی هم نادیده گرفته می‌شود.  دو شکستِ پیاپی (~۵ دقیقه) یعنی
#    واقعاً پایین است.
#
# ⚠️ و پس از هشدار **ساکت** می‌شود تا بازگشت.
#
#    وگرنه یک قطعیِ شبانه دوازده پیامک در ساعت می‌فرستد.  یک پیامک
#    برای «افتاد»، یک پیامک برای «برگشت» — همین.

set -u

DIR="${MOLIDO_DIR:-/opt/molido}"
URL="${MOLIDO_HEALTH_URL:-http://localhost:3000/health}"
STATE="${MOLIDO_WATCHDOG_STATE:-/var/lib/molido-watchdog}"

cd "$DIR" 2>/dev/null || exit 0

# ⚠️ کلیدِ پیامک از `.env` خوانده می‌شود، نه از آرگومان.
#
#    آرگومان در `ps` و در تاریخچهٔ پوسته دیده می‌شود — کلیدی که
#    هرکسی روی سرور بتواند بخواندش، کلید نیست.
[ -f "$DIR/.env" ] && . "$DIR/.env" 2>/dev/null

ALERT_TO="${WATCHDOG_SMS_TO:-}"
KEY="${SMS_API_KEY:-}"
SENDER="${SMS_SENDER:-10008663}"

mkdir -p "$STATE" 2>/dev/null
FAILS="$STATE/fails"
ALERTED="$STATE/alerted"

stamp() { date '+%Y-%m-%d %H:%M:%S'; }

notify() {
  # پیامک اختیاری است: اگر تنظیم نشده، لاگ همچنان نوشته می‌شود.
  [ -n "$ALERT_TO" ] && [ -n "$KEY" ] || return 0
  curl -s -m 20 -G "https://api.kavenegar.com/v1/$KEY/sms/send.json" \
    --data-urlencode "receptor=$ALERT_TO" \
    --data-urlencode "sender=$SENDER" \
    --data-urlencode "message=$1" >/dev/null 2>&1
}

# ⚠️ هم کدِ HTTP و هم مهلت.  سرویسی که ۲۰۰ می‌دهد ولی سی ثانیه طول
#    می‌کشد، برای کاربر افتاده است.
CODE=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$URL" 2>/dev/null)

if [ "$CODE" = "200" ]; then
  if [ -f "$ALERTED" ]; then
    echo "$(stamp)  بازگشت (HTTP 200)"
    notify "مولیدو: سامانه برگشت — $(stamp)"
    rm -f "$ALERTED"
  fi
  rm -f "$FAILS"
  exit 0
fi

N=$(cat "$FAILS" 2>/dev/null || echo 0)
N=$((N + 1))
echo "$N" > "$FAILS"
echo "$(stamp)  شکست شمارهٔ $N (HTTP ${CODE:-none})"

# ⚠️ پیش از هشدار، **یک بار** بلند کردن.
#
#    بیشترِ قطعی‌ها با همین برطرف می‌شوند و نیمه‌شب کسی را بیدار
#    نمی‌کنند.  اگر کار کرد، اجرای بعدی «بازگشت» می‌بیند و هرگز
#    پیامکی نمی‌رود.
if [ "$N" -eq 2 ]; then
  echo "$(stamp)  تلاش برای بلند کردن…"
  docker compose -f docker-compose.yml -f docker-compose.store.yml -f docker-compose.vps.yml \
    up -d backend >/dev/null 2>&1
fi

if [ "$N" -ge 2 ] && [ ! -f "$ALERTED" ]; then
  echo "$(stamp)  هشدار فرستاده شد"
  notify "مولیدو: سامانه پاسخ نمی‌دهد (HTTP ${CODE:-none}) — $(stamp)"
  : > "$ALERTED"
fi
