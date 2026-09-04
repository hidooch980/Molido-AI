#!/usr/bin/env bash
#
# استقرار روی سرور اینترنتی — روی خودِ سرور اجرا می‌شود.
#
#   bash deploy-vps.sh
#
# تفاوتش با `setup.sh`: آن برای شبکهٔ محلی است و رمز پیش‌فرض را قبول
# می‌کند.  این یکی فرض می‌گیرد سامانه از اینترنت در دسترس است، پس:
#   • هیچ پورتی جز ۸۰ و ۴۴۳ باز نمی‌شود
#   • همه‌چیز پشت TLS می‌رود
#   • رمز مدیر اجباری است و پیش‌فرض پذیرفته نمی‌شود
#   • رمزهای دیتابیس و JWT تصادفی ساخته می‌شوند
#
# اجرای دوباره بی‌ضرر است: مقادیر موجود در .env دست نمی‌خورند.

set -eu

cd "$(dirname "$0")"

red()  { printf '\033[31m%s\033[0m\n' "$1"; }
ok()   { printf '\033[32m  ✓\033[0m %s\n' "$1"; }
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }
die()  { red "  ✗ $1"; exit 1; }

# ---------- ۱) پیش‌نیازها ----------
step "۱) بررسی پیش‌نیازها"

command -v docker >/dev/null 2>&1 || die "داکر نصب نیست.  نصب:  curl -fsSL https://get.docker.com | sh"
docker compose version >/dev/null 2>&1 || die "افزونهٔ docker compose نصب نیست"
docker info >/dev/null 2>&1 || die "سرویس داکر بالا نیست:  systemctl start docker"
ok "داکر آماده است"

command -v openssl >/dev/null 2>&1 || die "openssl لازم است:  apt install -y openssl"
ok "openssl موجود است"

# حافظه: بیلد Next.js با کمتر از ~۲ گیگ کشته می‌شود و پیام خطایش گمراه‌کننده
# است («exit code 137» بدون هیچ توضیحی).
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
if [ "$mem_mb" -gt 0 ] && [ "$mem_mb" -lt 1900 ]; then
  red "  ⚠ حافظه ${mem_mb}MB است؛ بیلد ممکن است کشته شود."
  red "    راه‌حل: swap بسازید —"
  red "    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile"
  printf '  ادامه بدهم؟ [y/N] '
  read -r go < /dev/tty
  [ "$go" = "y" ] || exit 1
fi

# ---------- ۲) نشانی عمومی ----------
step "۲) نشانی سرویس"

# .env موجود خوانده می‌شود تا اجرای دوباره چیزی را خراب نکند.
[ -f .env ] && . ./.env 2>/dev/null || true

if [ -z "${MOLIDO_HOST:-}" ]; then
  printf '  دامنه یا آی‌پی سرور (مثال: shop.example.com یا 194.5.176.140): '
  read -r MOLIDO_HOST < /dev/tty
fi
[ -n "$MOLIDO_HOST" ] || die "نشانی خالی است"

# دامنه یا آی‌پی؟  Let's Encrypt برای آی‌پی گواهی نمی‌دهد.
if printf '%s' "$MOLIDO_HOST" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
  MOLIDO_TLS="tls internal"
  # هیچ دستور email ای تولید نمی‌شود.  `{$VAR:default}` در Caddy وقتی
  # متغیر **خالی** باشد (نه تعریف‌نشده) پیش‌فرض را برنمی‌دارد، و `email`
  # بدون آرگومان کل Caddy را از بالا آمدن بازمی‌دارد.
  MOLIDO_ACME=""
  PUBLIC_URL="https://$MOLIDO_HOST"
  red "  ⚠ با آی‌پی، گواهی خودامضا استفاده می‌شود و مرورگر هشدار می‌دهد."
  red "    برای فروشگاه واقعی یک دامنه بگیرید — کاربری که یاد بگیرد"
  red "    هشدار گواهی را رد کند، در برابر جعل سایت بی‌دفاع می‌شود."
else
  MOLIDO_TLS=""
  PUBLIC_URL="https://$MOLIDO_HOST"
  if [ -z "${ACME_EMAIL:-}" ]; then
    printf '  ایمیل برای Let'\''s Encrypt (هشدار انقضای گواهی): '
    read -r ACME_EMAIL < /dev/tty
  fi
  MOLIDO_ACME="email $ACME_EMAIL"
fi
ok "نشانی: $PUBLIC_URL"

# ---------- ۳) رمز مدیر ----------
step "۳) رمز مدیر"

if [ -z "${ADMIN_PASSWORD:-}" ]; then
  # روی سروری که به اینترنت وصل است، رمز پیش‌فرض یعنی سامانه از لحظهٔ
  # نصب باز است.  اسکن‌کننده‌های خودکار admin123 را در همان ساعت اول
  # امتحان می‌کنند.
  while :; do
    printf '  رمز مدیر (دست‌کم ۱۲ نویسه، admin123 پذیرفته نیست): '
    stty -echo 2>/dev/null || true
    read -r ADMIN_PASSWORD < /dev/tty
    stty echo 2>/dev/null || true
    echo
    if [ "${#ADMIN_PASSWORD}" -lt 12 ]; then
      red "  کوتاه است."
    elif [ "$ADMIN_PASSWORD" = "admin123" ]; then
      red "  همان رمز پیش‌فرض است."
    else
      break
    fi
  done
fi
ok "رمز مدیر تنظیم شد"

# ---------- ۴) رمزهای داخلی ----------
step "۴) رمزهای داخلی"

secret() { openssl rand -hex 32; }

# فقط آنچه هنوز نیست ساخته می‌شود؛ اجرای دوباره رمز دیتابیس را عوض
# نمی‌کند (که کل سامانه را از کار می‌انداخت).
: "${POSTGRES_PASSWORD:=$(secret)}"
: "${APP_DB_PASSWORD:=$(secret)}"
: "${JWT_SECRET:=$(secret)}"
: "${JWT_REFRESH_SECRET:=$(secret)}"
: "${N8N_WEBHOOK_SECRET:=$(secret)}"
: "${N8N_PASSWORD:=$(openssl rand -base64 18 | tr -d '/+=' )}"
: "${APP_DB_USER:=molido_app}"
: "${POSTGRES_USER:=postgres}"
: "${POSTGRES_DB:=molido_ai}"
: "${N8N_USER:=admin}"
: "${MOLIDO_PRODUCT:=store}"
ok "رمزها آماده‌اند"

# ---------- ۵) نوشتن .env ----------
step "۵) نوشتن .env"

umask 077   # .env نباید برای بقیهٔ کاربران سرور خواندنی باشد
cat > .env <<EOF
# ساختهٔ deploy-vps.sh — این فایل رمز دارد؛ جایی کپی‌اش نکنید.
MOLIDO_PRODUCT=$MOLIDO_PRODUCT

MOLIDO_HOST="$MOLIDO_HOST"
MOLIDO_TLS="$MOLIDO_TLS"
PUBLIC_URL="$PUBLIC_URL"
ACME_EMAIL="${ACME_EMAIL:-}"
MOLIDO_ACME="${MOLIDO_ACME:-}"

POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD="$POSTGRES_PASSWORD"
POSTGRES_DB=$POSTGRES_DB
APP_DB_USER=$APP_DB_USER
APP_DB_PASSWORD="$APP_DB_PASSWORD"

JWT_SECRET="$JWT_SECRET"
JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET"
JWT_EXPIRES_IN=7d

ADMIN_PASSWORD="$ADMIN_PASSWORD"

N8N_USER=$N8N_USER
N8N_PASSWORD="$N8N_PASSWORD"
N8N_WEBHOOK_SECRET="$N8N_WEBHOOK_SECRET"

# سقف درخواست؛ برای فروشگاه شلوغ بالا ببرید.
RATE_LIMIT=1200
RATE_LIMIT_BURST=50
EOF
ok ".env نوشته شد (فقط برای root خواندنی)"
umask 022

C="docker compose -f docker-compose.yml -f docker-compose.store.yml -f docker-compose.vps.yml"

# ---------- ۶) ساخت و اجرا ----------
step "۶) ساخت و اجرا (بار اول چند دقیقه طول می‌کشد)"

$C build
$C up -d
ok "سرویس‌ها بالا آمدند"

# ---------- ۷) دادهٔ اولیه ----------
step "۷) دادهٔ اولیه"

# منتظر بک‌اند: مهاجرت پیش از آن اجرا شده (depends_on)، ولی seed به
# فرآیندِ در حال اجرا نیاز دارد.
i=0
until $C exec -T backend node -e 'process.exit(0)' >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -gt 40 ] && die "بک‌اند بالا نیامد — لاگ:  $C logs backend"
  sleep 3
done

$C exec -T backend node dist/database/seed.js
ok "دادهٔ اولیه ثبت شد"

# ---------- ۸) بررسی ----------
step "۸) بررسی"

code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 "$PUBLIC_URL/api/healthz" || echo 000)
[ "$code" = "200" ] && ok "API پاسخ می‌دهد" || red "  ✗ API پاسخ نداد (کد $code) — لاگ:  $C logs caddy backend"

code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 "$PUBLIC_URL/" || echo 000)
[ "$code" = "200" ] && ok "پنل باز می‌شود" || red "  ✗ پنل باز نشد (کد $code)"

# رمز پیش‌فرض نباید کار کند
code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$PUBLIC_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@molido.ai","password":"admin123"}' || echo 000)
[ "$code" = "401" ] && ok "رمز پیش‌فرض کار نمی‌کند" || red "  ✗ رمز پیش‌فرض هنوز پذیرفته می‌شود (کد $code)"

# پورت‌های داخلی نباید از بیرون باز باشند
exposed=$($C ps --format '{{.Service}} {{.Ports}}' 2>/dev/null \
  | grep -vE '^caddy' | grep -c '0.0.0.0' || true)
[ "${exposed:-0}" -eq 0 ] && ok "هیچ پورت داخلی روی اینترنت باز نیست" \
  || red "  ✗ $exposed سرویس پورت باز دارد — بررسی کنید:  $C ps"

# ---------- ۹) دیوار آتش ----------
step "۹) دیوار آتش"

if command -v ufw >/dev/null 2>&1; then
  if ufw status 2>/dev/null | grep -q 'Status: active'; then
    ok "ufw فعال است"
  else
    red "  ⚠ ufw نصب است ولی خاموش.  فعالش کنید — این مهم است:"
    echo "      ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable"
  fi
else
  red "  ⚠ ufw نصب نیست.  بدون دیوار آتش، هر پورتی که فردا کسی باز کند"
  red "    مستقیم روی اینترنت است:  apt install -y ufw"
fi

# ---------- پایان ----------
printf '\n\033[1m  آماده است\033[0m\n\n'
printf '    پنل        %s\n' "$PUBLIC_URL"
printf '    فروشگاه    %s/shop\n' "$PUBLIC_URL/shop"
printf '    API        %s/api-docs\n\n' "$PUBLIC_URL"
printf '    ورود:  admin@molido.ai  /  رمزی که وارد کردید\n\n'
printf '    n8n از اینترنت باز نیست.  از تونل SSH:\n'
printf '      ssh -L 5678:localhost:5678 root@%s\n' "$MOLIDO_HOST"
printf '      سپس در مرورگر خودتان:  http://localhost:5678\n'
printf '      کاربر %s  رمز در .env\n\n' "$N8N_USER"
printf '    پشتیبان روزانه خودکار است.  بررسی:\n'
printf '      %s exec backup ls -la /backups/daily\n\n' "$C"
