#!/usr/bin/env bash
#
# ساخت بستهٔ انتقال به سرور.
#
# چرا اسکریپت شد: انتقال تا امروز دستی بود، و یک بار همان دستی بودن
# پروژه را شکست — `--exclude=uploads` که برای دادهٔ آپلودشده نوشته شده
# بود، `backend/src/uploads/` را هم انداخت و ساخت روی سرور با
# «Cannot find module './uploads/uploads.module'» مرد.
#
# درسش: **فهرست سفید، نه فهرست سیاه.**  فهرست سیاه هرچه را نگفته‌ای
# می‌برد — از جمله چیزهایی که نباید.  فهرست سفید هرچه را نگفته‌ای جا
# می‌گذارد، و جا ماندن، سر و صدا می‌کند.
#
# اجرا:  bash bundle.sh [مسیر-خروجی]

set -u
cd "$(dirname "$0")" || exit 1

OUT=${1:-molido-deploy.tar.gz}

red()  { printf '\033[31m%s\033[0m\n' "$1"; }
ok()   { printf '\033[32m  ✓ %s\033[0m\n' "$1"; }
die()  { red "  ✗ $1"; exit 1; }

# ---------- چه چیزی می‌رود ----------
#
# پوشه‌های کد و پیکربندی.  هر چیز تازه‌ای که به پروژه اضافه شود باید
# اینجا هم اضافه شود — و آزمونِ پایین همین را یادآوری می‌کند.
INCLUDE=(
  backend/src
  backend/sql
  backend/test
  backend/tools
  backend/package.json
  backend/package-lock.json
  backend/tsconfig.json
  backend/nest-cli.json
  backend/jest.config.js
  backend/Dockerfile

  web/app
  web/components
  web/lib
  web/public
  web/scripts
  web/package.json
  web/package-lock.json
  web/tsconfig.json
  web/next.config.mjs
  web/Dockerfile

  mcp/server.mjs
  mcp/molido.mjs
  mcp/tools.mjs
  mcp/tools.spec.mjs
  mcp/verify-server.mjs
  mcp/package.json
  mcp/README.md

  data
  n8n-workflows
  print-agent
  backup
  Caddyfile
  docker-compose.yml
  docker-compose.vps.yml
  docker-compose.store.yml
  deploy-vps.sh
  deploy-check.sh
  bundle.sh
  run-tests.sh
  setup.sh
  README.md
)

# ---------- چه چیزی باید در بسته باشد ----------
#
# نگهبانِ اصلی.  فایلی که تازه اضافه شده و کسی یادش رفته در `INCLUDE`
# بگذارد، اینجا گیر می‌افتد — نه سه ساعت بعد وسط ساختِ سرور.
REQUIRED=(
  backend/src/uploads/uploads.module.ts
  backend/src/voice/voice.service.ts
  backend/src/voice/translit-rules.ts
  backend/sql/migrations/033_voice_corpus.sql
  backend/test/voice.sh
  web/app/voice/page.tsx
  web/lib/speech.ts
  web/scripts/verify-speech.mjs
  web/scripts/verify-i18n.mjs
  mcp/server.mjs
  mcp/tools.mjs
  backend/sql/migrations/034_product_names_stay_persian.sql
  backend/src/purchasing/quote-rules.ts
  web/app/voice/Session.tsx
  data/balochi/fa-bal-gatitos.csv
  data/balochi/ATTRIBUTION.md
  run-tests.sh
)

# ---------- چه چیزی نباید در بسته باشد ----------
#
# نه فقط برای حجم: `.env` رمز دارد و `node_modules` ساختِ ویندوز است
# که روی لینوکس کار نمی‌کند.
#
# ⚠️ الگوها **لنگر** دارند و این عمدی است.
#
# الگوی سادهٔ `uploads/` روی `backend/src/uploads/` هم می‌افتد — و
# دقیقاً همین اشتباه یک بار ساخت روی سرور را شکست.  `^uploads/` فقط
# پوشهٔ دادهٔ ریشه را می‌گیرد، نه ماژول کد را.
FORBIDDEN=(
  '^\.env'
  '(^|/)node_modules/'
  '(^|/)\.next/'
  '(^|/)\.git/'
  '^uploads/'
  '^\.test-logs/'
  '^\.mcp\.json$'
)

echo "  ساخت بسته: $OUT"

missing=()
for path in "${INCLUDE[@]}"; do
  [ -e "$path" ] || missing+=("$path")
done
if [ ${#missing[@]} -gt 0 ]; then
  red "  ✗ در فهرست هست ولی روی دیسک نیست:"
  for m in "${missing[@]}"; do red "      $m"; done
  die "فهرست INCLUDE با پروژه هم‌گام نیست"
fi

present=()
for path in "${INCLUDE[@]}"; do
  [ -e "$path" ] && present+=("$path")
done

tar --exclude='node_modules' \
    --exclude='.next' \
    --exclude='*.log' \
    --exclude='__pycache__' \
    -czf "$OUT" "${present[@]}" 2>/dev/null || die "ساخت بسته ناموفق بود"

ok "بسته ساخته شد ($(du -h "$OUT" | cut -f1))"

# ---------- بازرسی ----------
listing=$(tar -tzf "$OUT")

fail=0
for path in "${REQUIRED[@]}"; do
  if printf '%s\n' "$listing" | grep -qx "$path"; then
    :
  else
    red "  ✗ جا مانده: $path"
    fail=1
  fi
done
[ $fail -eq 0 ] && ok "هر ${#REQUIRED[@]} فایل کلیدی در بسته هست"

for pattern in "${FORBIDDEN[@]}"; do
  if printf '%s\n' "$listing" | grep -q -- "$pattern"; then
    red "  ✗ نباید در بسته باشد: $pattern"
    fail=1
  fi
done
[ $fail -eq 0 ] && ok "هیچ فایل ممنوعی در بسته نیست"

count=$(printf '%s\n' "$listing" | grep -vc '/$')
ok "$count فایل"

if [ $fail -ne 0 ]; then
  rm -f "$OUT"
  die "بسته حذف شد — نیمه‌کاره فرستادنش بدتر از نفرستادن است"
fi

echo
echo "  انتقال:"
echo "    scp $OUT root@SERVER:/opt/"
echo "    ssh root@SERVER 'cd /opt && rm -rf molido && mkdir molido && tar -xzf $(basename "$OUT") -C molido && cd molido && bash deploy-vps.sh'"
