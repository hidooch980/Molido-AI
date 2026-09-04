#!/usr/bin/env bash
#
# پیکربندیِ درگاه پرداخت روی سرور.
#
#   bash ops/set-payment.sh [میزبان]
#
# ⚠️ شناسهٔ پذیرنده از **ورودیِ محرمانه** خوانده می‌شود، نه از آرگومان.
#
#    آرگومانِ خط فرمان در `~/.bash_history`، در خروجیِ `ps` و در لاگِ
#    ممیزیِ سیستم می‌نشیند.  یعنی اعتبارنامهٔ مالی روی دیسک می‌ماند و
#    هر کاربرِ دیگری روی همان ماشین می‌بیندش.
#
#    اینجا مقدار فقط در حافظه می‌ماند و مستقیم به `.env` سرور می‌رود.
#
# ⚠️ پیش‌فرض **حالتِ آزمایشی** است.
#
#    نخستین پیکربندی نباید با پول واقعی باشد.  با `--live` به حالتِ
#    واقعی می‌رود، و آن‌وقت هم صریحاً تأیید می‌خواهد.

set -u

HOST="${1:-mlz}"
REMOTE="${MOLIDO_REMOTE_DIR:-/opt/molido}"
LIVE=no

for arg in "$@"; do
  [ "$arg" = "--live" ] && LIVE=yes
done

die() { printf '\n  ✗ %s\n' "$*" >&2; exit 1; }
step() { printf '\n── %s\n' "$*"; }

cd "$(dirname "$0")/.." || die "شاخهٔ پروژه پیدا نشد"

step "۰) دسترسی به $HOST"
ssh -o ConnectTimeout=20 -o BatchMode=yes "$HOST" 'echo "  متصل: $(hostname)"' \
  || die "به $HOST وصل نشد"

# ---------------------------------------------------------------- ۱) نشانیِ عمومی
step "۱) نشانیِ بازگشت"

HOSTNAME_ENV=$(ssh -o BatchMode=yes "$HOST" \
  "grep -E '^MOLIDO_HOST=' $REMOTE/.env | cut -d= -f2- | tr -d '\"'")
[ -n "$HOSTNAME_ENV" ] || die "MOLIDO_HOST روی سرور خوانده نشد"

CALLBACK="https://$HOSTNAME_ENV/api/site/purchase/callback"
printf '  %s\n' "$CALLBACK"

# ⚠️ زرین‌پال معمولاً نشانیِ بازگشت را با **دامنهٔ ثبت‌شدهٔ پذیرنده**
#    می‌سنجد.  با آی‌پی، تراکنش در همان گامِ اول رد می‌شود — و پیامش
#    هیچ اشاره‌ای به دامنه نمی‌کند.
case "$HOSTNAME_ENV" in
  *[0-9].[0-9]*)
    printf '\n  ⚠️  نشانیِ فعلی یک آی‌پی است، نه دامنه.\n'
    printf '      زرین‌پال نشانیِ بازگشت را با دامنهٔ ثبت‌شدهٔ پذیرنده می‌سنجد.\n'
    printf '      اگر در پنلِ زرین‌پال همین آی‌پی را ثبت کرده باشید کار می‌کند؛\n'
    printf '      وگرنه تراکنش در همان گامِ اول رد می‌شود.\n'
    printf '\n'
    printf '      ⚠️ با یک خریدِ **کم‌ارزش** بسنجید، نه با فروشِ واقعی.\n'
    printf '         پیامِ ردِ زرین‌پال هیچ اشاره‌ای به دامنه نمی‌کند، پس با\n'
    printf '         مبلغِ بزرگ دنبالِ اشتباهی می‌گردید.\n\n'
    ;;
esac

# ---------------------------------------------------------------- ۲) گرفتنِ شناسه
step "۲) شناسهٔ پذیرنده"
printf '  شناسه را وارد کنید (روی صفحه دیده نمی‌شود، و در تاریخچه نمی‌ماند):\n  > '

# `-s` یعنی روی صفحه چاپ نشود.
read -r -s MERCHANT
printf '\n'

[ -n "$MERCHANT" ] || die "چیزی وارد نشد"

# ⚠️ ریختِ شناسه سنجیده می‌شود، نه فقط تهی نبودنش.
#
#    شناسهٔ زرین‌پال یک UUID سی‌وشش‌نویسه‌ای است.  چسباندنِ اشتباهِ
#    چیزِ دیگری — مثلاً کلیدِ API — خطایی می‌سازد که فقط سرِ نخستین
#    پرداختِ واقعی دیده می‌شود.
if ! printf '%s' "$MERCHANT" | grep -qiE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
  printf '  ⚠️  این مقدار شکلِ UUID ندارد (۸-۴-۴-۴-۱۲).\n'
  printf '      شناسهٔ زرین‌پال چنین ریختی دارد.  ادامه می‌دهید؟ [y/N] '
  read -r ans </dev/tty
  case "$ans" in y|Y) ;; *) die "لغو شد" ;; esac
fi

# ---------------------------------------------------------------- ۳) حالت
step "۳) حالت"
if [ "$LIVE" = yes ]; then
  printf '  ⚠️  حالتِ **واقعی**: از این پس پولِ واقعی جابه‌جا می‌شود.\n'
  printf '      پیشنهاد: اول بدونِ `--live` بیازمایید.\n'
  printf '      ادامه می‌دهید؟ [y/N] '
  read -r ans </dev/tty
  case "$ans" in y|Y) ;; *) die "لغو شد" ;; esac
  SANDBOX=false
else
  printf '  حالتِ آزمایشی (sandbox) — پولِ واقعی جابه‌جا نمی‌شود.\n'
  printf '  برای حالتِ واقعی:  bash ops/set-payment.sh %s --live\n' "$HOST"
  SANDBOX=true
fi

# ---------------------------------------------------------------- ۴) نوشتن
step "۴) نوشتن در .env"

# ⚠️ مقدار از **ورودیِ استاندارد** می‌رود، نه در متنِ دستور.
#    با `ssh host "... $MERCHANT ..."` شناسه در `ps` سرور دیده می‌شد.
printf '%s' "$MERCHANT" | ssh -o BatchMode=yes "$HOST" "cd $REMOTE && set -e
  MERCHANT=\$(cat)
  B=.env.bak-\$(date +%Y%m%d-%H%M%S)
  cp .env \"\$B\"

  set_var() {
    if grep -qE \"^\$1=\" .env; then
      # ⚠️ جداکنندهٔ | چون مقدار می‌تواند / داشته باشد.
      sed -i \"s|^\$1=.*|\$1=\$2|\" .env
    else
      printf '%s=%s\n' \"\$1\" \"\$2\" >> .env
    fi
  }

  set_var ZARINPAL_MERCHANT_ID \"\$MERCHANT\"
  set_var ZARINPAL_SANDBOX '$SANDBOX'
  set_var API_PUBLIC_URL 'https://$HOSTNAME_ENV/api'

  # ⚠️ اگر نشانیِ آزمونی از قبل مانده باشد، پرداختِ واقعی به سرورِ
  #    ساختگی می‌رود.  صریحاً پاک می‌شود.
  sed -i 's|^ZARINPAL_BASE_URL=.*|ZARINPAL_BASE_URL=|' .env 2>/dev/null || true

  echo \"  پشتیبان: \$B\"
  # ⚠️ خودِ شناسه چاپ نمی‌شود — فقط طول و چهار نویسهٔ آخر، برای اینکه
  #    بشود تشخیص داد درست نشسته یا نه.
  V=\$(grep -E '^ZARINPAL_MERCHANT_ID=' .env | cut -d= -f2-)
  printf '  ZARINPAL_MERCHANT_ID: %s نویسه، پایان …%s\n' \"\${#V}\" \"\${V: -4}\"
  printf '  ZARINPAL_SANDBOX:     %s\n' \"\$(grep -E '^ZARINPAL_SANDBOX=' .env | cut -d= -f2-)\"
  printf '  API_PUBLIC_URL:       %s\n' \"\$(grep -E '^API_PUBLIC_URL=' .env | cut -d= -f2-)\"
" || die "نوشتن در .env شکست"

unset MERCHANT

# ---------------------------------------------------------------- ۵) راه‌اندازی
step "۵) راه‌اندازی بک‌اند"
CF="-f docker-compose.yml -f docker-compose.store.yml -f docker-compose.vps.yml"
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && docker compose $CF up -d --force-recreate backend" 2>&1 | tail -3

ssh -o BatchMode=yes "$HOST" "
  for i in \$(seq 1 40); do
    [ \"\$(docker inspect molido-store-backend-1 --format '{{.State.Health.Status}}' 2>/dev/null)\" = healthy ] && break
    sleep 3
  done
  docker ps --format '  {{.Names}}\t{{.Status}}' | grep molido-store-backend
"

# ---------------------------------------------------------------- ۶) تأیید
step "۶) تأیید"

# ⚠️ سنجه این است که درگاه دیگر «پیکربندی نشده» نگوید — نه اینکه
#    پرداختی انجام شود.  پرداختِ واقعی را باید آدم انجام دهد.
OUT=$(curl -s --max-time 20 -X POST "https://$HOSTNAME_ENV/api/site/purchase" \
  -H 'Content-Type: application/json' \
  -d '{"slugs":["__probe__"],"name":"probe","phone":"09120000000"}' 2>/dev/null)

case "$OUT" in
  *"پیکربندی نشده"*)
    printf '  ✗ درگاه هنوز پیکربندی‌نشده گزارش می‌شود — بک‌اند مقدار را نخوانده.\n'
    printf '    بررسی کنید که ZARINPAL_MERCHANT_ID در docker-compose به کانتینر پاس شود.\n'
    exit 1 ;;
  *"ماژول ناشناخته"*)
    printf '  ✓ درگاه پیکربندی شد (اسلاگِ آزمایشی درست رد شد)\n' ;;
  *)
    printf '  پاسخ: %s\n' "$(printf '%s' "$OUT" | head -c 160)" ;;
esac

printf '\n  ✓ تمام شد.\n'
printf '    گامِ بعدی: یک خریدِ واقعیِ کم‌مبلغ انجام دهید و در پنل زرین‌پال ببینیدش.\n'
if [ "$SANDBOX" = true ]; then
  printf '    الان در حالتِ آزمایشی است؛ برای واقعی:  bash ops/set-payment.sh %s --live\n' "$HOST"
fi
