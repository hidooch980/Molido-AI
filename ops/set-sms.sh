#!/usr/bin/env bash
#
# پیکربندیِ پیامک روی سرور.
#
#   bash ops/set-sms.sh [میزبان]
#
# ⚠️ بدونِ پیامک، **فروشِ آنلاین عملاً بسته است**.
#
#    ورودِ مشتری در فروشگاهِ اینترنتی با کدِ یک‌بارمصرف است.  اگر
#    `SMS_API_KEY` تنظیم نباشد، سامانه کد را فقط شبیه‌سازی می‌کند و به
#    دستِ مشتری نمی‌رسد — عمدی است (نصبی که پیامک ندارد نباید حسابِ
#    مشتریِ حضوری را به هرکسی بدهد)، ولی نتیجه‌اش این است که هیچ
#    مشتریِ تازه‌ای نمی‌تواند ثبت‌نام کند.
#
# ⚠️ کلید از **ورودیِ محرمانه** خوانده می‌شود، نه از آرگومان.
#
#    آرگومانِ خط فرمان در `~/.bash_history`، در خروجیِ `ps` و در لاگِ
#    ممیزیِ سیستم می‌نشیند.  یعنی کلید روی دیسک می‌ماند و هر کاربرِ
#    دیگری روی همان ماشین می‌بیندش.
#
#    اینجا مقدار فقط در حافظه می‌ماند و مستقیم به `.env` سرور می‌رود.
#    هیچ‌جا چاپ نمی‌شود — نه اینجا، نه در گفت‌وگو.

set -u

HOST="${1:-mlz}"
REMOTE="${MOLIDO_REMOTE_DIR:-/opt/molido}"

die() { printf '\n  ✗ %s\n' "$*" >&2; exit 1; }
step() { printf '\n── %s\n' "$*"; }

cd "$(dirname "$0")/.." || die "شاخهٔ پروژه پیدا نشد"

step "۰) دسترسی به $HOST"
ssh -o ConnectTimeout=20 -o BatchMode=yes "$HOST" 'echo "  متصل: $(hostname)"' \
  || die "به $HOST وصل نشد"

# ---------------------------------------------------------------- ۱) کلید
step "۱) ارائه‌دهنده"
printf '  ۱) کاوه‌نگار\n  ۲) sms.ir\n  انتخاب [۱]: '
read -r pick </dev/tty
case "${pick:-1}" in
  2|۲) PROVIDER=sms.ir ;;
  *)   PROVIDER=kavenegar ;;
esac
printf '  ارائه‌دهنده: %s\n' "$PROVIDER"

# ---------------------------------------------------------------- ۲) کلید
step "۲) کلیدِ API"
printf '  کلید را وارد کنید (روی صفحه دیده نمی‌شود، و در تاریخچه نمی‌ماند):\n  > '
read -r -s SMS_KEY
printf '\n'

[ -n "$SMS_KEY" ] || die "چیزی وارد نشد"

# ⚠️ ریخت سنجیده می‌شود، نه فقط تهی نبودنش.
#
#    کلیدِ کاوه‌نگار رشتهٔ بلندِ هگزادسیمال یا Base64 است.  چسباندنِ
#    اشتباهِ چیزِ دیگری — مثلاً شمارهٔ خط — خطایی می‌سازد که فقط سرِ
#    نخستین ثبت‌نامِ واقعیِ مشتری دیده می‌شود.
if [ "${#SMS_KEY}" -lt 20 ]; then
  printf '  ⚠️  این مقدار برای کلیدِ API کوتاه است (%s نویسه).\n' "${#SMS_KEY}"
  printf '      مطمئنید شمارهٔ خط را وارد نکرده‌اید؟  ادامه می‌دهید؟ [y/N] '
  read -r ans </dev/tty
  case "$ans" in y|Y) ;; *) die "لغو شد" ;; esac
fi

# ---------------------------------------------------------------- ۲) شمارهٔ فرستنده
step "۲) شمارهٔ فرستنده"
printf '  شمارهٔ خطِ خدماتی (Enter برای پیش‌فرضِ 10008663): '
read -r SENDER </dev/tty
SENDER=${SENDER:-10008663}
printf '  فرستنده: %s\n' "$SENDER"

TEMPLATE=""
if [ "$PROVIDER" = "sms.ir" ]; then
  # ⚠️ بیشترِ حساب‌های sms.ir فقط با **قالبِ تأییدشده** اجازهٔ ارسالِ کدِ
  #    یک‌بارمصرف دارند؛ متنِ آزاد رد می‌شود یا در صف می‌ماند.
  #
  #    خالی گذاشتنش یعنی متنِ آزاد از راهِ `/send/bulk` — برای پیامِ
  #    عمومی درست است، ولی کدِ ورود احتمالاً نمی‌رسد.
  printf '  شناسهٔ قالبِ کدِ یک‌بارمصرف (Enter = متنِ آزاد): '
  read -r TEMPLATE </dev/tty
  [ -n "$TEMPLATE" ] && printf '  قالب: %s\n' "$TEMPLATE"
fi

# ---------------------------------------------------------------- ۳) شمارهٔ دیده‌بان
step "۳) شمارهٔ هشدارِ دیده‌بان"
#
# ⚠️ اختیاری است ولی همین‌جا پرسیده می‌شود، چون کلیدِ پیامک تازه تنظیم
#    شده و دیده‌بان بدونِ شماره فقط لاگ می‌نویسد.  دو مرحله کردنش یعنی
#    مرحلهٔ دوم فراموش شود.
printf '  شماره‌ای که در قطعیِ سامانه پیامک بگیرد (Enter برای رد شدن): '
read -r ALERT_TO </dev/tty

# ---------------------------------------------------------------- ۴) نوشتن
step "۴) نوشتن در .env"

# ⚠️ مقدار از **ورودیِ استاندارد** می‌رود، نه در متنِ دستور.
#    با `ssh host "... $SMS_KEY ..."` کلید در `ps` سرور دیده می‌شد.
printf '%s' "$SMS_KEY" | ssh -o BatchMode=yes "$HOST" "cd $REMOTE && set -e
  KEY=\$(cat)
  B=.env.bak-\$(date +%Y%m%d-%H%M%S)
  cp .env \"\$B\"

  set_var() {
    if grep -qE \"^\$1=\" .env; then
      sed -i \"s|^\$1=.*|\$1=\$2|\" .env
    else
      printf '%s=%s\n' \"\$1\" \"\$2\" >> .env
    fi
  }

  set_var SMS_API_KEY \"\$KEY\"
  set_var SMS_SENDER '$SENDER'
  set_var SMS_PROVIDER '$PROVIDER'
  [ -n '$TEMPLATE' ] && set_var SMSIR_TEMPLATE_ID '$TEMPLATE'
  [ -n '$ALERT_TO' ] && set_var WATCHDOG_SMS_TO '$ALERT_TO'

  echo \"  پشتیبان: \$B\"
  # ⚠️ خودِ کلید چاپ نمی‌شود — فقط طول و چهار نویسهٔ آخر، برای اینکه
  #    بشود تشخیص داد درست نشسته یا نه.
  V=\$(grep -E '^SMS_API_KEY=' .env | cut -d= -f2-)
  printf '  SMS_API_KEY:      %s نویسه، پایان …%s\n' \"\${#V}\" \"\${V: -4}\"
  printf '  SMS_SENDER:       %s\n' \"\$(grep -E '^SMS_SENDER=' .env | cut -d= -f2-)\"
  printf '  SMS_PROVIDER:     %s\n' \"\$(grep -E '^SMS_PROVIDER=' .env | cut -d= -f2-)\"
  printf '  WATCHDOG_SMS_TO:  %s\n' \"\$(grep -E '^WATCHDOG_SMS_TO=' .env | cut -d= -f2-)\"
" || die "نوشتن در .env شکست"

unset SMS_KEY

# ---------------------------------------------------------------- ۵) راه‌اندازی
step "۵) راه‌اندازی بک‌اند"
CF="-f docker-compose.yml -f docker-compose.store.yml -f docker-compose.vps.yml"
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && docker compose $CF up -d --force-recreate backend" 2>&1 | tail -3

step "۶) سنجش"
#
# ⚠️ «متغیر نوشته شد» با «پیامک می‌رود» یکی نیست.
#
#    کلیدِ غلط هم در `.env` می‌نشیند و سامانه بالا می‌آید؛ خطایش فقط
#    سرِ نخستین ثبت‌نامِ واقعیِ مشتری دیده می‌شود — یعنی وقتی مشتری
#    پشتِ صفحه منتظر است.
#
#    اینجا اعتبارِ کلید از خودِ ارائه‌دهنده پرسیده می‌شود.  هزینه‌ای
#    ندارد و پیامکی نمی‌فرستد:
#      کاوه‌نگار  →  /account/info.json
#      sms.ir     →  /v1/credit   (مانده را هم می‌گوید)
sleep 8
if [ "$PROVIDER" = "sms.ir" ]; then
  ssh -o BatchMode=yes "$HOST" "cd $REMOTE && set -e
    K=\$(grep -E '^SMS_API_KEY=' .env | cut -d= -f2-)
    R=\$(curl -s -m 20 -H \"X-API-KEY: \$K\" https://api.sms.ir/v1/credit || echo '')
    case \"\$R\" in
      *'\"status\":1'*) printf '  ✓ کلید معتبر است — %s\n' \"\$R\" ;;
      *'\"status\":10'*) echo '  ✗ کلید نامعتبر است — دوباره اجرا کنید' ;;
      '')               echo '  ! sms.ir پاسخ نداد (شبکه؟) — کلید سنجیده نشد' ;;
      *)                printf '  ! پاسخِ نامنتظره: %s\n' \"\$(printf '%s' \"\$R\" | head -c 150)\" ;;
    esac
  "
else
  ssh -o BatchMode=yes "$HOST" "cd $REMOTE && set -e
    K=\$(grep -E '^SMS_API_KEY=' .env | cut -d= -f2-)
    R=\$(curl -s -m 20 \"https://api.kavenegar.com/v1/\$K/account/info.json\" || echo '')
    case \"\$R\" in
      *'\"status\":200'*) echo '  ✓ کلید معتبر است' ;;
      *'\"status\":401'*) echo '  ✗ کلید نامعتبر است — دوباره اجرا کنید' ;;
      '')                 echo '  ! کاوه‌نگار پاسخ نداد (شبکه؟) — کلید سنجیده نشد' ;;
      *)                  printf '  ! پاسخِ نامنتظره: %s\n' \"\$(printf '%s' \"\$R\" | head -c 120)\" ;;
    esac
  "
fi

step "تمام"
cat <<'TXT'

  حالا مشتری می‌تواند در فروشگاه اینترنتی ثبت‌نام کند.

  ⚠️ اگر دیده‌بان را هم تنظیم کردید، در crontab سرور بگذارید:

      */5 * * * * /opt/molido/ops/watchdog.sh >> /var/log/molido-watchdog.log 2>&1

TXT
