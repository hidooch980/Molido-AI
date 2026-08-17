#!/usr/bin/env bash
#
# رگرسیون پروفایل کافه‌رستوران.
#
# چرا جدا از `run-tests.sh`: ماژول‌ها بر اساس محصول بارگذاری می‌شوند.
# پروفایل `store` اصلاً `RestaurantModule` را بالا نمی‌آورد، پس همهٔ
# آزمون‌های رستوران آنجا ۴۰۴ می‌گیرند — شکستی که معنایی ندارد.
#
# نتیجهٔ آن جدایی این بود که ۳۸ مسیر API و ۱۲۳۰ خط سرویس **هرگز
# اجرا نشدند**.  کدی که اجرا نمی‌شود، کدی است که کسی نمی‌داند کار
# می‌کند یا نه.
#
# راه‌اندازی (یک بار):
#   docker compose -f docker-compose.yml -f docker-compose.resto.yml up -d
#   docker compose -p molido-resto -f docker-compose.yml -f docker-compose.resto.yml \
#     exec -T -e ADMIN_PASSWORD=... backend node dist/database/seed.js
#
# اجرا:
#   bash run-resto-tests.sh

cd "$(dirname "$0")" || exit 1

# پروفایل رستوران روی پورت‌های خودش است تا کنار فروشگاه بالا بماند.
export MOLIDO_API=${MOLIDO_API:-http://localhost:3200}
export MOLIDO_ADMIN_PASSWORD=${MOLIDO_ADMIN_PASSWORD:-admin123}
export MOLIDO_COMPOSE=${MOLIDO_COMPOSE:-"docker compose -p molido-resto -f docker-compose.yml -f docker-compose.resto.yml"}

SUITES="e2e-resto restaurant"
[ $# -gt 0 ] && SUITES="$*"

LOGDIR=${MOLIDO_LOGDIR:-.test-logs}
mkdir -p "$LOGDIR"

total_pass=0; total_fail=0; broken=""

echo "  API: $MOLIDO_API"
echo

for suite in $SUITES; do
  file="backend/test/$suite.sh"
  if [ ! -f "$file" ]; then
    echo "  ✗ $suite — فایل نیست"
    broken="$broken $suite"
    continue
  fi

  out="$LOGDIR/resto-$suite.log"
  bash "$file" >"$out" 2>&1
  code=$?

  p=$(grep -oE 'PASS: *[0-9]+' "$out" | tail -1 | grep -oE '[0-9]+')
  f=$(grep -oE 'FAIL: *[0-9]+' "$out" | tail -1 | grep -oE '[0-9]+')
  p=${p:-0}; f=${f:-0}

  # خروجِ غیرصفر بدون شمارش یعنی اسکریپت وسط راه مرد — نه اینکه
  # آزمونی شکست خورده باشد.  این دو را نباید یکی شمرد.
  if [ "$code" -ne 0 ] && [ "$p" -eq 0 ] && [ "$f" -eq 0 ]; then
    echo "  ✗ $suite — اجرا نشد (کد $code)"
    broken="$broken $suite"
    tail -3 "$out" | sed 's/^/      /'
    continue
  fi

  printf '  %-14s PASS: %-5s FAIL: %s\n' "$suite" "$p" "$f"
  [ "$f" -gt 0 ] && grep -E '^\s*FAIL' "$out" | sed 's/^/      /'

  total_pass=$((total_pass + p))
  total_fail=$((total_fail + f))
done

echo '  ---------------------------------------'
printf '  %-14s PASS: %-5s FAIL: %s\n' "TOTAL" "$total_pass" "$total_fail"
[ -n "$broken" ] && echo "  مجموعه‌های خراب:$broken"

echo
echo "  خروجی کامل: $LOGDIR/resto-<نام مجموعه>.log"

[ "$total_fail" -eq 0 ] && [ -z "$broken" ]
