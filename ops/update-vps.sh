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

# ⚠️ دام ۱ب: overlayِ **لبه** هم باید بیاید، وگرنه به‌روزرسانی محصولِ
#    دوم را از دسترس خارج می‌کند.
#
#    `up -d --force-recreate` کانتینر را با **همان** فایل‌هایی می‌سازد
#    که به آن داده‌ای.  اگر `edge-store-ip.yml` نباشد، فروشگاه از
#    شبکهٔ `molido_edge` بیرون می‌افتد، نامِ مستعارِ `store-web` حل
#    نمی‌شود، و Caddy برای **هر** درخواست ۵۰۲ می‌دهد.
#
#    ساخت موفق گزارش می‌شود، کانتینر سالم است، و سایت می‌خوابد.
#
#    اگر روی سرور شبکهٔ لبه ساخته شده باشد، خودکار اضافه می‌شود — پس
#    نصبِ تک‌محصولی چیزی برای تنظیم ندارد.
if ssh -o BatchMode=yes "$HOST" 'docker network inspect molido_edge' >/dev/null 2>&1; then
  for f in docker-compose.edge-store-ip.yml docker-compose.edge-caddy.yml; do
    ssh -o BatchMode=yes "$HOST" "test -f $REMOTE/$f" 2>/dev/null && CF="$CF -f $f"
  done
fi

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

# WARN دام ۳ب: کدِ خروجِ ساخت سنجیده نمی‌شد.
#
#    یک بار `node:22-alpine` روی IPv6 کشیده نشد («network is
#    unreachable»)، ساخت شکست خورد، و اسکریپت رد شد و تا آخر
#    «به‌روزرسانی تمام شد» گفت.  نتیجه: ایمیجِ بک‌اند هشت ساعت قدیمی
#    ماند، مهاجرت‌های ۰۷۱ تا ۰۷۳ اجرا نشدند، و تولید جدولِ اشتراک
#    نداشت — بی‌آنکه چیزی قرمز شود.
#
#    لولهٔ `| grep` کدِ خروج را می‌بلعد، پس خروجی در فایل جمع می‌شود.
BUILD_LOG=$(mktemp)
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && docker compose $CF build backend web" \
  > "$BUILD_LOG" 2>&1
BUILD_RC=$?
grep -E 'naming to|Built|ERROR|error' "$BUILD_LOG" | tail -6
if [ "$BUILD_RC" -ne 0 ]; then
  echo '  --- ته لاگ ساخت ---'; tail -15 "$BUILD_LOG"; rm -f "$BUILD_LOG"
  die "ساخت ایمیج شکست خورد (کد $BUILD_RC) — استقرار متوقف شد"
fi
rm -f "$BUILD_LOG"

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
MIG_RC=${PIPESTATUS[0]}
[ "$MIG_RC" -eq 0 ] || die "مهاجرت شکست خورد (کد $MIG_RC)"

# WARN کدِ خروجِ صفر کافی **نیست** — به بهای یک استقرارِ خراب یاد گرفته شد.
#
#    وقتی ایمیجِ بک‌اند کهنه بود، `migrate` با کدِ ۰ تمام شد و فقط
#    «رمز نقش molido_app همگام شد» چاپ کرد.  از دیدِ اسکریپت موفق بود؛
#    در واقع فایل‌های ۰۷۱ تا ۰۷۳ اصلاً داخلِ ایمیج نبودند، چون SQL در
#    ایمیج پخته می‌شود نه از میزبان خوانده.
#
#    پس ادعای واقعی سنجیده می‌شود: هر فایلِ مهاجرتِ مخزن باید در
#    `schema_migrations` ثبت شده باشد.  این هم ایمیجِ کهنه را می‌گیرد و
#    هم مهاجرتِ ردشده را.
LOCAL_MIG=$(ls backend/sql/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ')
APPLIED_MIG=$(ssh -o BatchMode=yes "$HOST" \
  "cd $REMOTE && docker compose $CF exec -T postgres \
     psql -U postgres -d molido_ai -tAc 'SELECT count(*) FROM schema_migrations' </dev/null" \
  2>/dev/null | tr -dc '0-9')
echo "  مهاجرت در مخزن: ${LOCAL_MIG}   اعمال‌شده: ${APPLIED_MIG:-؟}"
[ -n "$APPLIED_MIG" ] || die "شمارشِ schema_migrations خوانده نشد"
[ "$APPLIED_MIG" -ge "$LOCAL_MIG" ] \
  || die "مهاجرت ناقص: $APPLIED_MIG از $LOCAL_MIG — احتمالاً ایمیجِ بک‌اند کهنه است"
echo '  ✓ همهٔ مهاجرت‌ها اعمال شده‌اند'

# ---------------------------------------------------------------- ۵) راه‌اندازی
step "۵) راه‌اندازی سرویس‌ها"

# `--force-recreate` چون بدونش کانتینر با ایمیجِ قدیمی می‌ماند وقتی
# فقط لایه‌های داخلی عوض شده‌اند.
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && docker compose $CF up -d --force-recreate backend web caddy" 2>&1 | tail -4

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
# WARN `| tail -8` شکست را پنهان می‌کرد.
#
#    بازرسی «PASS: 24  FAIL: 1» گزارش داد و خطِ خودِ شکست بالاتر از
#    هشت خطِ آخر بود — پس دیده نشد و باید دستی روی سرور اجرا می‌شد.
#    خلاصه‌ای که علتش را دور می‌ریزد، خلاصهٔ بی‌فایده است.
#
#    حالا هر خطِ FAIL جدا نشان داده می‌شود.
#
# WARN و کدِ خروجِ بازرسی هم سنجیده نمی‌شد.
#
#    یک بار prod-verify.sh با CRLF به سرور رفت و پوستهٔ لینوکس آن را
#    اصلاً اجرا نکرد («syntax error near unexpected token $'{CR}'»).
#    هیچ سنجه‌ای اجرا نشد — و اسکریپت «به‌روزرسانی تمام شد» گفت.
#
#    بازرسی‌ای که اجرا نشده با بازرسی‌ای که سبز شده یکی نیست.
VERIFY_LOG=$(mktemp)
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && bash ops/prod-verify.sh 2>&1" > "$VERIFY_LOG" 2>&1
VERIFY_RC=$?
tail -8 "$VERIFY_LOG"
# «FAIL» تنها کافی نیست: خطِ خلاصه هم «FAIL: 0» دارد و سرتیترِ
# «شکست‌ها» را روی اجرای کاملاً سالم چاپ می‌کرد.
if grep -qE '^\s+FAIL ' "$VERIFY_LOG"; then
  echo '  --- شکست‌ها ---'
  grep -E '^\s+FAIL ' "$VERIFY_LOG"
fi
# سنجهٔ «واقعاً اجرا شد؟» — نه فقط «شکستی چاپ نشد؟»
if ! grep -qE 'PASS: [0-9]+' "$VERIFY_LOG"; then
  echo '  --- ته لاگ بازرسی ---'; tail -15 "$VERIFY_LOG"
  rm -f "$VERIFY_LOG"
  die "بازرسی اصلاً اجرا نشد (کد $VERIFY_RC) — استقرار تأیید نشد"
fi
if grep -qE 'FAIL: [1-9]' "$VERIFY_LOG"; then
  rm -f "$VERIFY_LOG"
  die "بازرسی شکست داشت — بالا را ببینید"
fi
rm -f "$VERIFY_LOG"

printf '\n  ✓ به‌روزرسانی تمام شد\n\n'
