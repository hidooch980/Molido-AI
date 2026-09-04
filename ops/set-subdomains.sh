#!/usr/bin/env bash
#
# زیردامنهٔ جدا برای هر محصول.
#
#   bash ops/set-subdomains.sh shop.molido.ir cafe.molido.ir [میزبان-ssh]
#
# ⚠️ **DNS پیش از هر تغییری سنجیده می‌شود، و این اختیاری نیست.**
#
#    Caddy با دیدنِ یک دامنه دیگر `tls internal` نمی‌زند و می‌رود سراغ
#    Let's Encrypt.  اگر رکوردِ A نباشد یا به آی‌پیِ دیگری اشاره کند،
#    گواهی صادر نمی‌شود و نتیجه‌اش **سایتِ از دسترس خارج** است — نه یک
#    هشدارِ مرورگر.
#
#    یعنی گامی که به نظر بی‌خطر می‌آید («فقط یک متغیر») می‌تواند
#    سرویس را قطع کند.  پس اول سنجش، بعد تغییر.
#
# ⚠️ بلوکِ آی‌پی هرگز برداشته نمی‌شود.
#
#    اگر صدور گواهی شکست بخورد، راهِ ورود از آی‌پی باز می‌ماند.  تنها
#    راهِ دسترسی نباید چیزی باشد که به اینترنتِ بیرون وابسته است.

set -u

STORE_HOST="${1:-}"
RESTO_HOST="${2:-}"
HOST="${3:-mlz}"
REMOTE="${MOLIDO_REMOTE_DIR:-/opt/molido}"

die() { printf '\n  ✗ %s\n' "$*" >&2; exit 1; }
step() { printf '\n── %s\n' "$*"; }

[ -n "$STORE_HOST" ] && [ -n "$RESTO_HOST" ] || die \
  "دو زیردامنه بدهید:  bash ops/set-subdomains.sh shop.molido.ir cafe.molido.ir"

for h in "$STORE_HOST" "$RESTO_HOST"; do
  case "$h" in
    *.*.*) ;;
    *) die "«$h» زیردامنه به نظر نمی‌رسد (مثلاً shop.molido.ir)" ;;
  esac
done

[ "$STORE_HOST" != "$RESTO_HOST" ] || die "دو زیردامنه باید متفاوت باشند"

cd "$(dirname "$0")/.." || die "شاخهٔ پروژه پیدا نشد"

step "۰) دسترسی به $HOST"
SERVER_IP=$(ssh -o ConnectTimeout=20 -o BatchMode=yes "$HOST" \
  "grep -E '^MOLIDO_HOST=' '$REMOTE/.env' | cut -d= -f2- | tr -d '\"'" 2>/dev/null)
[ -n "$SERVER_IP" ] || die "به $HOST وصل نشد یا MOLIDO_HOST خوانده نشد"
echo "  نشانیِ فعلیِ سرور: $SERVER_IP"

step "۱) سنجشِ DNS"
#
# ⚠️ با چند حل‌کنندهٔ عمومی سنجیده می‌شود، نه فقط یکی.
#
#    حل‌کنندهٔ محلی می‌تواند رکوردِ کهنه را کش کرده باشد و «درست» نشان
#    بدهد در حالی که Let's Encrypt چیزِ دیگری می‌بیند.  آن‌وقت
#    اسکریپت سبز می‌گوید و گواهی شکست می‌خورد.
dns_ok=1
for pair in "$STORE_HOST" "$RESTO_HOST"; do
  found=""
  for resolver in 8.8.8.8 1.1.1.1; do
    got=$(nslookup -type=A "$pair" "$resolver" 2>/dev/null \
          | sed -n '/Name:/,$p' | awk '/^Address/{print $2}' | head -1)
    [ -n "$got" ] && found="$found $got"
  done

  if [ -z "$found" ]; then
    printf '  ✗ %-24s رکورد A ندارد\n' "$pair"
    dns_ok=0
  elif printf '%s' "$found" | grep -q "$SERVER_IP"; then
    printf '  ✓ %-24s → %s\n' "$pair" "$SERVER_IP"
  else
    printf '  ✗ %-24s →%s  (باید %s باشد)\n' "$pair" "$found" "$SERVER_IP"
    dns_ok=0
  fi
done

if [ "$dns_ok" -eq 0 ]; then
  # ⚠️ ناهم‌خوانیِ آی‌پی همیشه اشکال نیست: **CDN** هم همین شکلی است.
  #
  #    اگر دامنه پشتِ آروان‌کلاود (یا هر CDN) باشد، رکوردِ A به لبهٔ
  #    CDN اشاره می‌کند نه به سرور — و این کاملاً درست است.  رد کردنش
  #    یعنی نگهبان جلوی کارِ درست را بگیرد.
  #
  #    پس اول تشخیص می‌دهیم، و اگر CDN بود راهنماییِ درست می‌دهیم.
  CDN=""
  for h in "$STORE_HOST" "$RESTO_HOST"; do
    srv=$(curl -sI -m 20 "http://$h/" 2>/dev/null | grep -i '^server:' | cut -d' ' -f2- | tr -d '
')
    [ -n "$srv" ] && CDN="$srv"
  done

  if [ -n "$CDN" ]; then
    cat <<TXT

  ⚠️ زیردامنه‌ها پشتِ CDN هستند: $CDN

  رکوردِ A به لبهٔ CDN اشاره می‌کند و این **درست** است — نه اشکال.
  ولی دو چیز باید در پنلِ CDN تنظیم شده باشد:

      ۱. مبدأ (origin/upstream) = $SERVER_IP
      ۲. گواهیِ SSL برای هر دو زیردامنه فعال باشد

  ⚠️ و در `.env` سرور:  TRUST_PROXY=2
     چون حالا دو پرش هست (CDN ← Caddy).  با «۱» برنامه نشانیِ لبهٔ
     CDN را «کاربر» می‌بیند و همهٔ مشتری‌ها یک سطلِ نرخِ مشترک
     می‌گیرند — یعنی اولین کسی که چند بار اشتباه وارد شود، ورودِ همه
     را می‌بندد، بی‌آنکه خطایی داده شود.

  اگر هر سه انجام شده، با این متغیر ادامه بدهید:

      MOLIDO_DNS_BEHIND_CDN=1 bash ops/set-subdomains.sh $STORE_HOST $RESTO_HOST

TXT
    [ "${MOLIDO_DNS_BEHIND_CDN:-}" = "1" ] || die "پشتِ CDN — با متغیرِ بالا تأیید کنید"
    echo "  ✓ پشتِ CDN تأیید شد؛ ادامه می‌دهیم"
  else
    cat <<TXT

  رکوردهای لازم را در پنلِ دامنه بسازید و دوباره اجرا کنید:

      A   ${STORE_HOST%%.*}   $SERVER_IP
      A   ${RESTO_HOST%%.*}   $SERVER_IP

  انتشارِ DNS معمولاً چند دقیقه تا چند ساعت طول می‌کشد.
TXT
    die "DNS آماده نیست — هیچ تغییری داده نشد"
  fi
fi

step "۲) اعتبارِ پیکربندی، پیش از اعمال"
# ⚠️ اینجا سنجیده می‌شود، نه بعد از reload.
#
#    پیکربندیِ نامعتبر یعنی Caddy بالا نمی‌آید و سایت می‌خوابد.
#    سنجشِ محلی چند ثانیه است؛ قطعیِ ناشی از آن، ساعت‌ها.
if docker image inspect caddy:2-alpine >/dev/null 2>&1; then
  ROOT=$(pwd -W 2>/dev/null || pwd)
  out=$(MSYS_NO_PATHCONV=1 docker run --rm \
    -e MOLIDO_HOST="$SERVER_IP" -e MOLIDO_TLS="" -e MOLIDO_ACME="" \
    -e MOLIDO_HOST_STORE="$STORE_HOST" -e MOLIDO_HOST_RESTO="$RESTO_HOST" \
    -v "$ROOT/Caddyfile.subdomains:/etc/caddy/Caddyfile:ro" \
    caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1)
  printf '%s' "$out" | grep -q 'Valid configuration' \
    || { printf '%s\n' "$out" | tail -3; die "پیکربندی معتبر نیست"; }
  echo "  ✓ پیکربندی معتبر است"
else
  echo "  ! تصویر caddy محلی نیست — سنجش روی سرور انجام می‌شود"
fi

step "۳) اعمال روی سرور"
#
# ⚠️ اسکریپت از **ورودی استاندارد** می‌رود، نه در آرگومانِ ssh.
#
#    رشتهٔ دولک‌ای چهار لایه گریز می‌سازد (اینجا ← ssh ← پوستهٔ راه
#    دور ← docker) و امروز یک بار همین باعث شد سنجه‌ای خطای نحوی
#    داشته باشد و هرگز اجرا نشود — بی‌آنکه `bash -n` بگیردش.
# ⚠️ **هر چهار آرگومان** فرستاده شود.
#
#    نسخهٔ اول سه تا می‌فرستاد ولی متنِ راه‌دور `$4` را می‌خواند؛ با
#    `set -eu` یعنی همان خطِ پنجم `unbound variable` می‌داد و استقرار
#    هرگز شروع نمی‌شد — پیش از هر تغییری، ولی هرگز کار نمی‌کرد.
#
#    `bash -n` نمی‌گیردش (نحو کاملاً درست است).  فقط اجرای واقعیِ
#    متنِ راه‌دور با آرگومان‌های نمونه نشانش داد.
ssh -o BatchMode=yes "$HOST" bash -s -- \
  "$REMOTE" "$STORE_HOST" "$RESTO_HOST" "${MOLIDO_DNS_BEHIND_CDN:-0}" <<'REMOTE_SCRIPT'
set -eu
REMOTE_DIR="$1"
STORE_HOST="$2"
RESTO_HOST="$3"
BEHIND_CDN="$4"
cd "$REMOTE_DIR"

BASE='docker compose -f docker-compose.yml'

# شبکهٔ مشترک — بدونش Caddy فقط یکی از دو پروژه را می‌بیند.
docker network inspect molido_edge >/dev/null 2>&1 \
  || { docker network create molido_edge >/dev/null && echo '  + شبکهٔ molido_edge ساخته شد'; }

# ⚠️ پشتیبان از .env پیش از دست زدن به آن.
cp .env ".env.bak.$(date +%Y%m%d-%H%M%S)"

set_var() {
  if grep -qE "^$1=" .env; then
    sed -i "s|^$1=.*|$1=$2|" .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}
set_var MOLIDO_HOST_STORE "$STORE_HOST"
set_var MOLIDO_HOST_RESTO "$RESTO_HOST"

# ⚠️ تعدادِ پرش‌ها با CDN یکی بیشتر می‌شود.
#
#    مشتری → CDN → Caddy → برنامه.  با «۱» برنامه نشانیِ لبهٔ CDN را
#    «کاربر» می‌بیند و همهٔ مشتری‌ها یک سطلِ نرخِ مشترک می‌گیرند —
#    اولین کسی که چند بار اشتباه وارد شود ورودِ همه را می‌بندد، بدونِ
#    هیچ خطایی.
if [ "$BEHIND_CDN" = "1" ]; then
  set_var TRUST_PROXY 2
  echo '  + TRUST_PROXY=2 (پشتِ CDN)'
fi
echo "  + متغیرها نوشته شدند"

# ⚠️ `build web` **اجباری** است، نه بهینه‌سازی.
#
#    Next.js نشانیِ API را در زمانِ ساخت داخلِ باندل می‌نویسد.  بدونِ
#    ساختِ دوباره، پنل بالا می‌آید و ظاهرش سالم است، ولی مرورگرِ
#    مشتری هر درخواست را به نشانیِ **قبلی** می‌فرستد — روی سرور یعنی
#    به `localhost` خودش.  خطایش هم CORS است و هیچ ربطی به زیردامنه
#    ندارد، پس دنبالِ اشتباهی می‌گردید.
STORE_C="$BASE -f docker-compose.store.yml -f docker-compose.edge-store.yml"
RESTO_C="$BASE -f docker-compose.resto.yml -f docker-compose.edge-resto.yml"

echo '  ساختِ دوبارهٔ پنل با نشانیِ تازه…'
$STORE_C build web
$RESTO_C build web

$STORE_C up -d backend web
$RESTO_C up -d backend web

# ⚠️ Caddy **آخر** بالا می‌آید.
#
#    اگر اول بیاید، به میزبان‌هایی اشاره می‌کند که هنوز روی شبکهٔ
#    مشترک نیستند و درخواست‌ها ۵۰۲ می‌گیرند — قطعیِ کوتاه ولی واقعی.
$BASE -f docker-compose.store.yml -f docker-compose.vps.yml \
      -f docker-compose.edge-caddy.yml up -d --force-recreate caddy

sleep 5
echo
echo '── وضعیت'
docker ps --filter name=caddy --format '  caddy: {{.Status}}'
for h in "$STORE_HOST" "$RESTO_HOST"; do
  code=$(curl -sk -o /dev/null -w '%{http_code}' -H "Host: $h" https://localhost/ || echo 000)
  printf '  %-24s HTTP %s\n' "$h" "$code"
done
REMOTE_SCRIPT

step "تمام"
cat <<TXT

  فروشگاه:  https://$STORE_HOST
  رستوران:  https://$RESTO_HOST
  آی‌پی:     https://$SERVER_IP   (همچنان کار می‌کند)

  ⚠️ اگر مرورگر هشدارِ گواهی داد، یعنی Let's Encrypt نتوانسته
     اعتبارسنجی کند.  علتش این است که سرور از بیرونِ ایران در دسترس
     نیست و چالش‌های http-01 و tls-alpn-01 هرگز موفق نمی‌شوند.
     راهِ حل چالشِ DNS-01 است؛ توضیحش پایینِ Caddyfile.subdomains.
TXT
