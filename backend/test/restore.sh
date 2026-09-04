#!/usr/bin/env bash
#
# آزمون بازیابی پشتیبان.
#
# پشتیبانی که بازیابی‌اش آزموده نشده، پشتیبان نیست — فقط فایلی است که
# آدم را آسوده‌خاطر می‌کند.  و روزی که واقعاً لازم شود، هیچ فرصتی برای
# فهمیدن اینکه کار نمی‌کند باقی نمانده.
#
# اینجا پشتیبان در یک دیتابیس **جدا** بازیابی می‌شود و محتوایش با
# دادهٔ زنده مقایسه.  دادهٔ اصلی هیچ‌وقت لمس نمی‌شود.

cd "$(dirname "$0")/../.." || exit 1
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
DB=${MOLIDO_DB:-molido_ai}
SCRATCH=restore_test_$$

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# مقایسهٔ دو عدد که **هیچ‌کدام نباید خالی باشد**.
#
# `chk` تنها برابری را می‌سنجد، و دو رشتهٔ خالی برابرند.  یک بار داکر
# وسط اجرا افتاد و هر دو طرف خالی برگشتند — آزمون سبز داد در حالی که
# کل دیتابیس در دسترس نبود.  آزمونی که در بدترین حالت سبز بدهد، از
# نبودنش بدتر است.
chknum() {
  if [ -z "$2" ] || [ -z "$3" ]; then
    fail=$((fail+1)); printf '  FAIL %s (شمارش خالی — دیتابیس در دسترس نیست)\n' "$1"
  else
    chk "$1" "$2" "$3"
  fi
}
psql()  { $C exec -T postgres psql -U postgres -qc "$1" >/dev/null 2>&1; }
count() { $C exec -T postgres psql -U postgres -d "$1" -tAc "SELECT count(*) FROM \"$2\"" 2>/dev/null | tr -d '\r'; }

cleanup() { psql "DROP DATABASE IF EXISTS $SCRATCH"; rm -f .restore-test.dump; }
trap cleanup EXIT

echo '--- ۱) گرفتن پشتیبان ---'
$C exec -T postgres pg_dump -U postgres -d "$DB" --format=custom > .restore-test.dump 2>/dev/null
SIZE=$(wc -c < .restore-test.dump | tr -d ' ')
chk "پشتیبان ساخته شد" "$([ "$SIZE" -gt 10000 ] && echo yes || echo no)" "yes"

echo '--- ۲) بازیابی در دیتابیس جدا ---'
# جدا و نه روی خودش: آزمونی که دادهٔ زنده را جایگزین کند، خودش
# خطرناک‌تر از چیزی است که می‌سنجد.
psql "DROP DATABASE IF EXISTS $SCRATCH"
psql "CREATE DATABASE $SCRATCH"
$C exec -T postgres pg_restore -U postgres -d "$SCRATCH" --no-owner --no-acl < .restore-test.dump >/dev/null 2>&1
chk "بازیابی بدون خطای مرگبار" "$([ -n "$(count "$SCRATCH" Product)" ] && echo yes || echo no)" "yes"

echo '--- ۳) محتوا برابر است ---'
# شمارش هر جدول، نه فقط «بازیابی موفق بود».  pg_restore می‌تواند با
# خطاهای جزئی تمام شود و دیتابیسی ناقص بسازد که سالم به نظر می‌رسد.
for t in Product Customer Sale User Supplier Company; do
  chknum "$t" "$(count "$SCRATCH" "$t")" "$(count "$DB" "$t")"
done

echo '--- ۴) ساختار هم آمده، نه فقط ردیف‌ها ---'
LIVE_T=$($C exec -T postgres psql -U postgres -d "$DB" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d '\r')
REST_T=$($C exec -T postgres psql -U postgres -d "$SCRATCH" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null | tr -d '\r')
chknum "شمار جدول‌ها" "$REST_T" "$LIVE_T"
chk "جدول‌ها واقعاً وجود دارند" "$([ "${REST_T:-0}" -gt 50 ] && echo yes || echo no)" "yes"

echo
echo "PASS: $pass  FAIL: $fail"
[ $fail -eq 0 ]
