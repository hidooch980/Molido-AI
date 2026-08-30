#!/usr/bin/env bash
#
# به‌روزرسانی سرور — از دستگاهی که به سرور دسترسی دارد اجرا می‌شود.
#
#   bash ops/update-vps.sh [میزبان]
#
# پیش‌فرضِ میزبان `mlz` است (از `~/.ssh/config`).  می‌شود چیز دیگری داد:
#
#   bash ops/update-vps.sh root@194.5.176.140
#
# تفاوتش با `deploy-vps.sh`: آن **راه‌اندازی اولیه** است و روی خودِ
# سرور اجرا می‌شود.  این یکی کدِ تازه را می‌فرستد و سرویس‌ها را
# نو می‌کند — یعنی کاری که بعد از هر دور توسعه لازم است.
#
# ⚠️ همهٔ گام‌ها **سنجیده** می‌شوند، نه اینکه به خروجیِ موفق اعتماد شود.
#    چهار دامِ زیر همه امروز واقعاً اتفاق افتادند.

set -u

HOST="${1:-mlz}"
REMOTE="${MOLIDO_REMOTE_DIR:-/opt/molido}"

# ⚠️ دام ۱: مجموعهٔ اشتباهِ overlay.
#
#    استک با **سه** فایل ساخته شده.  یک بار `store` را جا انداختم و
#    نتیجه‌اش ایمیجی به نام `molido-web` بود در حالی که کانتینر
#    `molido-store-web` می‌خواست — یعنی ساخت موفق شد و هیچ اثری نداشت.
CF="-f docker-compose.yml -f docker-compose.store.yml -f docker-compose.vps.yml"

die() { printf '\n  ✗ %s\n' "$*" >&2; exit 1; }
step() { printf '\n── %s\n' "$*"; }

cd "$(dirname "$0")/.." || die "شاخهٔ پروژه پیدا نشد"

# ---------------------------------------------------------------- ۰) دسترسی
step "۰) دسترسی به $HOST"
ssh -o ConnectTimeout=20 -o BatchMode=yes "$HOST" 'echo "  متصل: $(hostname)"' \
  || die "به $HOST وصل نشد.

     اگر مهلت تمام شد، احتمالاً مسیرِ شبکه است نه سرور: این سرور از
     بعضی شبکه‌ها فیلتر می‌شود.  از شبکه‌ای که دسترسی دارد اجرا کنید."

# ---------------------------------------------------------------- ۱) پشتیبان
step "۱) پشتیبان پیش از تغییر"

# ⚠️ دام ۲: پشتیبانِ خالیِ بی‌خطا.
#
#    `docker compose` بدون overlay پستگرس را نمی‌بیند و فایلِ ۲۰ بایتی
#    می‌سازد — و `gzip -t` هم قبولش می‌کند چون فایلِ فشردهٔ خالی سالم
#    است.  پس نامِ کانتینر مستقیم، و شمارِ جدول‌ها مقایسه می‌شود.
ssh -o BatchMode=yes "$HOST" "set -e
  TS=\$(date +%Y%m%d-%H%M%S)
  OUT=/opt/backups/pre-update-\$TS.sql.gz
  mkdir -p /opt/backups
  docker exec molido-store-postgres-1 pg_dump -U postgres molido_ai | gzip > \"\$OUT\"
  DUMP=\$(zcat \"\$OUT\" | grep -c '^CREATE TABLE')
  LIVE=\$(docker exec molido-store-postgres-1 psql -U postgres -d molido_ai -tAq \
          -c \"SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';\")
  echo \"  فایل: \$OUT\"
  echo \"  جدول در پشتیبان: \$DUMP   در پایگاه: \$LIVE\"
  [ \"\$DUMP\" -eq \"\$LIVE\" ] || { echo '  ✗ پشتیبان ناقص'; exit 1; }
  echo '  ✓ پشتیبان کامل'
" || die "پشتیبان‌گیری شکست — استقرار انجام نشد"

# ---------------------------------------------------------------- ۲) ارسال کد
step "۲) ارسال کد"

# `rsync` روی همهٔ دستگاه‌ها نیست؛ `tar` روی ssh همه‌جا هست.
# `.env` سرور عمداً مستثناست — رمزهای تولید آنجا زندگی می‌کنند.
tar czf - \
  --exclude=node_modules --exclude=.next --exclude=.git \
  --exclude='*.tar.gz' --exclude=.env --exclude=dist \
  --exclude=backups --exclude='*.log' \
  . 2>/dev/null | ssh -o BatchMode=yes "$HOST" "cd $REMOTE && tar xzf -" \
  || die "ارسال کد شکست"

ssh -o BatchMode=yes "$HOST" "cd $REMOTE && [ -f .env ] && echo '  ✓ .env سرور دست‌نخورده' || echo '  ✗ .env نیست!'"

# ---------------------------------------------------------------- ۳) ساخت
step "۳) ساخت ایمیج‌ها"

# ⚠️ دام ۳: «Built» گفتن بدون ساختنِ ایمیج.
#
#    یک بار `docker compose build` موفق گزارش داد ولی ایمیجِ جدیدی
#    نساخت — ایمیج پنج ساعت قدیمی ماند و تغییرات دیده نمی‌شد.  پس
#    زمانِ ساختِ ایمیج پیش و پس مقایسه می‌شود.
BEFORE=$(ssh -o BatchMode=yes "$HOST" \
  "docker image inspect molido-store-web:latest --format '{{.Created}}' 2>/dev/null || echo none")

ssh -o BatchMode=yes "$HOST" "cd $REMOTE && docker compose $CF build backend web" \
  | grep -E 'naming to|Built|ERROR|error' | tail -6

AFTER=$(ssh -o BatchMode=yes "$HOST" \
  "docker image inspect molido-store-web:latest --format '{{.Created}}' 2>/dev/null || echo none")

# ⚠️ «ایمیج عوض شد» سنجهٔ درستی نبود.
#
#    وقتی تغییرِ این دور فقط در بک‌اند یا SQL باشد، ایمیجِ وب **باید**
#    دست‌نخورده بماند — لایه‌ها از کش می‌آیند.  شرطِ قبلی در همان حالتِ
#    کاملاً سالم استقرار را متوقف می‌کرد.
#
#    ادعای واقعی این است: ایمیج نباید از منبعش قدیمی‌تر باشد.  همان را
#    می‌سنجیم، که هم دامِ اصلی (ساختِ بی‌اثر) را می‌گیرد و هم به
#    استقرارِ فقط-بک‌اند گیر نمی‌دهد.
if [ "$BEFORE" = "$AFTER" ]; then
  NEWEST=$(ssh -o BatchMode=yes "$HOST" \
    "find $REMOTE/web -type f -not -path '*/node_modules/*' -not -path '*/.next/*' \
       -printf '%T@\n' 2>/dev/null | sort -rn | head -1 | cut -d. -f1")
  IMG_EPOCH=$(ssh -o BatchMode=yes "$HOST" \
    "date -d \"\$(docker image inspect molido-store-web:latest --format '{{.Created}}')\" +%s 2>/dev/null || echo 0")

  if [ -n "$NEWEST" ] && [ "$IMG_EPOCH" -gt 0 ] && [ "$NEWEST" -gt "$IMG_EPOCH" ]; then
    die "ایمیج وب از منبعش قدیمی‌تر است — ساخت اثری نداشت.
     ایمیج: $AFTER"
  fi
  echo "  ✓ ایمیج وب دست‌نخورده (تغییری در web/ نبود) — $AFTER"
else
  echo "  ✓ ایمیج وب تازه شد: $AFTER"
fi

# ---------------------------------------------------------------- ۴) مهاجرت
step "۴) مهاجرت پایگاه داده"
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && docker compose $CF run --rm migrate" 2>&1 | tail -4

# ---------------------------------------------------------------- ۵) راه‌اندازی
step "۵) راه‌اندازی سرویس‌ها"

# `--force-recreate` چون بدونش کانتینر با ایمیجِ قدیمی می‌ماند وقتی
# فقط لایه‌های داخلی عوض شده‌اند.
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && docker compose $CF up -d --force-recreate backend web" 2>&1 | tail -4

ssh -o BatchMode=yes "$HOST" "
  for i in \$(seq 1 40); do
    [ \"\$(docker inspect molido-store-backend-1 --format '{{.State.Health.Status}}' 2>/dev/null)\" = healthy ] && break
    sleep 3
  done
  docker ps --format '  {{.Names}}\t{{.Status}}' | grep molido-store
"

# ---------------------------------------------------------------- ۶) تأیید
step "۶) تأیید کارکردی"

# ⚠️ دام ۴: «کانتینر بالاست» با «کدِ تازه اجرا می‌شود» یکی نیست.
#
#    قابلیتی سنجیده می‌شود که فقط در کدِ تازه هست — نه اینکه به
#    وضعیتِ کانتینر اعتماد شود.
ssh -o BatchMode=yes "$HOST" "
  ALL=\$(docker exec molido-store-backend-1 sh -c 'wget -qO- \"http://localhost:3000/shop/products?limit=200\"' | grep -o '\"id\"' | wc -l)
  ONE=\$(docker exec molido-store-backend-1 sh -c 'wget -qO- \"http://localhost:3000/shop/products?limit=200&maxPrice=1\"' | grep -o '\"id\"' | wc -l)
  echo \"  کالا بدون صافی: \$ALL   با maxPrice=1: \$ONE\"
  [ \"\$ONE\" -eq 0 ] && echo '  ✓ صافی قیمت زنده است (کد امروز)' || echo '  ✗ صافی کار نکرد — کد قدیمی؟'
"

step "۷) بازرسی سلامت"
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && bash ops/prod-verify.sh 2>&1 | tail -8"

printf '\n  ✓ به‌روزرسانی تمام شد\n\n'
