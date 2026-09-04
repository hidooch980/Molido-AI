#!/usr/bin/env bash
#
# تعویضِ نشانیِ عمومی از آی‌پی به دامنه.
#
#   bash ops/set-domain.sh shop.molido.ir [میزبان-ssh]
#
# ⚠️ دامنهٔ **اصلی** را اینجا ندهید.
#
#    `molido.ir` وب‌سایتِ اصلی است و روی سرورِ دیگری (194.5.178.154)
#    میزبانی می‌شود.  دادنش به این اسکریپت یعنی Caddyِ مولیدو خودش را
#    صاحبِ آن نام بداند و بخواهد برایش گواهی بگیرد — کاری که هم شکست
#    می‌خورد و هم `PUBLIC_URL` و CORS را به سایتی می‌برد که مالِ ما
#    نیست.
#
#    سنجشِ DNS پایین جلویش را می‌گیرد، ولی بهتر است اصلاً امتحان نشود.
#    برای چند محصول از `ops/set-subdomains.sh` استفاده کنید.
#
# ⚠️ چرا اسکریپت و نه ویرایشِ دستیِ `.env`؟
#
#    چهار متغیر باید با هم عوض شوند و هر کدام جای دیگری خوانده
#    می‌شود.  یکی را جا انداختن یعنی حالتی که «کار می‌کند» ولی نیمه‌کاره
#    است — مثلاً گواهی درست می‌شود ولی مرورگر به‌خاطر CORS هر
#    درخواستِ API را رد می‌کند، و پیامش هیچ ربطی به دامنه ندارد.
#
# ⚠️ DNS **پیش از** هر تغییری سنجیده می‌شود.
#
#    بدونِ رکوردِ A، Let's Encrypt گواهی نمی‌دهد.  و چون Caddy با
#    دامنه دیگر `tls internal` نمی‌زند، نتیجه‌اش سایتِ کاملاً از
#    دسترس خارج است — نه یک هشدارِ مرورگر.
#
#    یعنی گامی که به نظر بی‌خطر می‌آید («فقط یک متغیر»)، می‌تواند
#    سرویس را قطع کند.  پس اول سنجش، بعد تغییر.

set -u

DOMAIN="${1:-}"
HOST="${2:-mlz}"
REMOTE="${MOLIDO_REMOTE_DIR:-/opt/molido}"

die() { printf '\n  ✗ %s\n' "$*" >&2; exit 1; }
step() { printf '\n── %s\n' "$*"; }

[ -n "$DOMAIN" ] || die "دامنه را بدهید:  bash ops/set-domain.sh shop.molido.ir"

case "$DOMAIN" in
  *.*) ;;
  *) die "«$DOMAIN» دامنه به نظر نمی‌رسد" ;;
esac

cd "$(dirname "$0")/.." || die "شاخهٔ پروژه پیدا نشد"

# ---------------------------------------------------------------- ۰) دسترسی
step "۰) دسترسی به $HOST"
ssh -o ConnectTimeout=20 -o BatchMode=yes "$HOST" 'echo "  متصل: $(hostname)"' \
  || die "به $HOST وصل نشد"

SERVER_IP=$(ssh -o BatchMode=yes "$HOST" \
  "grep -E '^MOLIDO_HOST=' $REMOTE/.env | cut -d= -f2- | tr -d '\"'")
[ -n "$SERVER_IP" ] || die "MOLIDO_HOST فعلی خوانده نشد"
echo "  نشانیِ فعلی: $SERVER_IP"

# ---------------------------------------------------------------- ۱) DNS
step "۱) بررسی DNS پیش از هر تغییر"

# ⚠️ از خودِ سرور پرسیده می‌شود، نه از دستگاهِ توسعه.
#
#    Let's Encrypt از بیرون به سرور می‌زند، پس آنچه مهم است این است
#    که دامنه از دیدِ اینترنت به همین ماشین برسد.  کشِ DNS دستگاهِ
#    شما ممکن است چیز دیگری بگوید.
resolve() {
  ssh -o BatchMode=yes "$HOST" "dig +short +time=5 +tries=2 A '$1' @8.8.8.8 2>/dev/null | head -1"
}

A_MAIN=$(resolve "$DOMAIN")
printf '  %-20s %s\n' "$DOMAIN" "${A_MAIN:-(رکورد A ندارد)}"

# ⚠️ `www` فقط برای دامنهٔ اصلی معنا دارد.
#
#    با `app.molido.ir` نسخهٔ پیشین سراغ `www.app.molido.ir` را
#    می‌گرفت — نامی که قرار نیست وجود داشته باشد — و خطِ «رکورد A
#    ندارد» چاپ می‌کرد.  هشداری که خودش اشتباه است، اعتماد به
#    هشدارهای درست را هم از بین می‌برد.
IS_APEX=no
case "$DOMAIN" in
  *.*.*) ;;
  *.*) IS_APEX=yes ;;
esac

if [ "$IS_APEX" = yes ]; then
  A_WWW=$(resolve "www.$DOMAIN")
  printf '  %-20s %s\n' "www.$DOMAIN" "${A_WWW:-(رکورد A ندارد)}"
else
  printf '  %-20s %s\n' "www" "(زیردامنه است — بررسی نشد)"
fi

[ -n "$A_MAIN" ] || die "دامنهٔ «$DOMAIN» رکورد A ندارد.

     در پنلِ DNS یک رکورد A بسازید:
         نام:    $([ "$IS_APEX" = yes ] && echo '@ (و www)' || echo "${DOMAIN%%.*}")        مقدار: $SERVER_IP

     سپس چند دقیقه صبر کنید و دوباره اجرا کنید.
     تا آن موقع سایت روی آی‌پی سالم کار می‌کند."

[ "$A_MAIN" = "$SERVER_IP" ] || die "دامنه به «$A_MAIN» اشاره می‌کند، نه به «$SERVER_IP».

     اگر از CDN استفاده می‌کنید (مثلاً ابر آروان)، باید حالتِ پروکسی
     را برای صدورِ گواهی موقتاً خاموش کنید — وگرنه Let's Encrypt به
     خودِ سرور نمی‌رسد."

echo "  ✓ دامنه به همین سرور اشاره می‌کند"

# ⚠️ پورت ۸۰ باید از بیرون باز باشد.
#
#    چالشِ HTTP-01 روی همان پورت انجام می‌شود.  اگر فایروال ببنددش،
#    Caddy بی‌صدا در حلقهٔ تلاش می‌ماند و سایت بالا نمی‌آید.
step "۲) پورت ۸۰ از بیرون"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://$DOMAIN/" 2>/dev/null || echo 000)
[ "$CODE" = "000" ] && die "پورت ۸۰ روی «$DOMAIN» پاسخ نمی‌دهد — صدور گواهی شکست می‌خورد"
echo "  ✓ پاسخ $CODE"

# ---------------------------------------------------------------- ۳) پشتیبان
step "۳) پشتیبان از .env"
BAK=$(ssh -o BatchMode=yes "$HOST" "cd $REMOTE && B=.env.bak-\$(date +%Y%m%d-%H%M%S) && cp .env \"\$B\" && echo \"\$B\"")
[ -n "$BAK" ] || die "پشتیبان گرفته نشد"
echo "  $BAK"

# ---------------------------------------------------------------- ۴) تغییر
step "۴) به‌روزرسانی متغیرها"

# ⚠️ `MOLIDO_TLS` باید **تهی** شود، نه `tls internal`.
#
#    با دامنه، Caddy خودش Let's Encrypt می‌گیرد.  ماندنِ
#    `tls internal` یعنی گواهیِ خودامضا روی دامنهٔ واقعی — بدترین
#    حالت: هم هشدارِ مرورگر، هم تصورِ اینکه امن است.
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && set -e
  set_var() {
    if grep -qE \"^\$1=\" .env; then
      sed -i \"s|^\$1=.*|\$1=\$2|\" .env
    else
      printf '%s=%s\n' \"\$1\" \"\$2\" >> .env
    fi
  }
  set_var MOLIDO_HOST '$DOMAIN'
  set_var MOLIDO_TLS ''
  set_var SITE_URL 'https://$DOMAIN'
  set_var CORS_ORIGIN 'https://$DOMAIN'
  set_var NEXT_PUBLIC_API_URL 'https://$DOMAIN/api'
  set_var NEXT_PUBLIC_SITE_URL 'https://$DOMAIN'
  grep -E '^(MOLIDO_HOST|MOLIDO_TLS|SITE_URL|CORS_ORIGIN|NEXT_PUBLIC_API_URL|NEXT_PUBLIC_SITE_URL)=' .env | sed 's/^/  /'
" || die "به‌روزرسانی .env شکست"

# ---------------------------------------------------------------- ۵) ساخت وب
step "۵) ساخت دوبارهٔ وب"

# ⚠️ `NEXT_PUBLIC_*` در **زمانِ ساخت** در باندل جا می‌افتد.
#
#    عوض کردنش در `.env` بدونِ ساختِ دوباره هیچ اثری ندارد: مرورگر
#    همچنان نشانیِ قدیمی را صدا می‌زند و همه‌چیز با CORS می‌شکند.
CF="-f docker-compose.yml -f docker-compose.store.yml -f docker-compose.vps.yml"
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && docker compose $CF build web" 2>&1 | tail -3

# ---------------------------------------------------------------- ۶) راه‌اندازی
step "۶) راه‌اندازی"
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && docker compose $CF up -d --force-recreate caddy web backend" 2>&1 | tail -4

# ---------------------------------------------------------------- ۷) گواهی
step "۷) انتظار برای گواهی"

# صدور معمولاً چند ثانیه است ولی گاهی تا یک دقیقه طول می‌کشد.
OK=no
for i in $(seq 1 24); do
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$DOMAIN/" 2>/dev/null || echo 000)
  if [ "$CODE" = "200" ] || [ "$CODE" = "302" ]; then OK=yes; break; fi
  sleep 5
done

if [ "$OK" != yes ]; then
  printf '\n  ✗ https://%s پاسخ نداد.\n\n' "$DOMAIN"
  ssh -o BatchMode=yes "$HOST" "docker logs molido-store-caddy-1 --tail 15 2>&1 | grep -iE 'error|obtain|challenge' | tail -6" || true
  printf '\n  بازگشت:\n    ssh %s \"cd %s && cp %s .env && docker compose %s up -d --force-recreate caddy web\"\n' \
    "$HOST" "$REMOTE" "$BAK" "$CF"
  exit 1
fi

echo "  ✓ https://$DOMAIN پاسخ داد ($CODE)"

# ⚠️ گواهی **واقعاً** از Let's Encrypt است یا هنوز خودامضا؟
#
#    بدونِ این سنجه، «۲۰۰ گرفتم» به معنی موفقیت خوانده می‌شد در حالی
#    که مرورگرِ کاربر هشدار می‌دهد.
ISSUER=$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
         | openssl x509 -noout -issuer 2>/dev/null | sed 's/^issuer=//')
printf '  صادرکنندهٔ گواهی: %s\n' "${ISSUER:-(خوانده نشد)}"
case "$ISSUER" in
  *"Let's Encrypt"*|*"E1"*|*"E5"*|*"R3"*|*"R10"*|*"R11"*) echo "  ✓ گواهی معتبر" ;;
  *) echo "  ⚠️ گواهی هنوز خودامضا به نظر می‌رسد — لاگ Caddy را ببینید" ;;
esac

# ---------------------------------------------------------------- ۸) تأیید
step "۸) تأیید کارکردی"
for path in "/" "/api/shop/products" "/robots.txt"; do
  printf '  %-22s %s\n' "$path" \
    "$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://$DOMAIN$path" 2>/dev/null || echo 000)"
done

# نقشهٔ سایت باید دامنهٔ تازه را بگوید، نه localhost.
SITEMAP=$(curl -s --max-time 15 "https://$DOMAIN/robots.txt" 2>/dev/null | grep -i '^Sitemap:' | head -1)
printf '  %s\n' "${SITEMAP:-(Sitemap در robots.txt نیست)}"
case "$SITEMAP" in
  *"$DOMAIN"*) echo "  ✓ نقشهٔ سایت دامنهٔ درست را می‌گوید" ;;
  *) echo "  ⚠️ نقشهٔ سایت هنوز نشانیِ قدیمی دارد — SITE_URL به وب نرسیده" ;;
esac

printf '\n  ✓ دامنه فعال شد: https://%s\n' "$DOMAIN"
printf '    پشتیبانِ .env: %s\n' "$BAK"
