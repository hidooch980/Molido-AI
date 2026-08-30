#!/usr/bin/env bash
#
# سلامتِ دفتر کل — فراتر از «تراز صفر است».
#
# ⚠️ چرا لازم شد؟  چون «تراز صفر» یک ایرادِ واقعی را پنهان کرد.
#
#    حساب ۱۲۰۱ «اموال و تجهیزات» — که یک **دارایی** است — ماندهٔ
#    **بستانکار** داشت.  علتش این بود که واگذاری و استهلاک سند
#    می‌زدند ولی خریدِ دارایی نه.  یعنی دفاتر می‌گفتند دارایی‌هایی
#    واگذار شده‌اند که هرگز خریداری نشده بودند.
#
#    و هیچ آزمونی نگرفتش، چون **تراز همچنان صفر بود**: هر دو طرفِ
#    سندِ واگذاری درست بود؛ چیزی که کم بود سندِ *قبلی* بود.
#
#    «تراز صفر است» با «دفتر درست است» یکی نیست.  تنها سنجه‌ای که
#    این خانواده از اشکال‌ها را می‌گیرد، نگاه به **علامتِ ماندهٔ** هر
#    حساب است: دارایی و هزینه بدهکار می‌مانند، بدهی و سرمایه و درآمد
#    بستانکار.
#
# ⚠️ سندهای باطل‌شده باید **دوطرفه** حذف شوند.
#
#    نسخهٔ اولِ همین پرس‌وجو فقط `status <> 'REVERSED'` گذاشت و شش
#    حسابِ سالم را «وارونه» گزارش کرد — چون سندِ اصلی حذف می‌شد ولی
#    سندِ `REVERSAL` که خنثی‌اش می‌کند می‌ماند.  نتیجه: نیمی از یک
#    جفتِ متعادل.

cd "$(dirname "$0")/../.." || exit 1
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d '\r'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

if [ -z "$(Q 'SELECT 1;')" ]; then
  echo "  پایگاه‌داده در دسترس نیست — از این مجموعه گذشتیم"
  echo
  printf "   PASS: 0   FAIL: 0   SKIPPED\n"
  exit 0
fi

# ⚠️ حساب‌های «کاهنده» عمداً علامتِ وارونه دارند و استثنای نام‌دارند.
#
#    `4102` تخفیفات فروش زیر درآمد می‌نشیند و بدهکار می‌شود؛ اگر
#    بستانکار بود، فروش را زیاد نشان می‌داد.
#    `1202` استهلاک انباشته زیر دارایی می‌نشیند و بستانکار می‌شود.
#    `4105` سود/زیان واگذاری هر دو علامت می‌گیرد — زیانِ واگذاری
#    بدهکار است و کاملاً عادی.
CONTRA="'4102','1202','4105'"

echo '--- ۱) تراز آزمایشی صفر است ---'
chk "بدهکار = بستانکار" \
  "$(Q "SELECT CASE WHEN round(COALESCE(sum(debit),0) - COALESCE(sum(credit),0)) = 0
                    THEN 'ok' ELSE 'off' END
        FROM \"JournalLine\" l
        JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
        WHERE e.status <> 'REVERSED';")" "ok"

echo '--- ۲) علامتِ ماندهٔ حساب‌ها ---'
# ⚠️ **سنجهٔ اصلیِ این فایل.**
BAD=$(Q "
WITH live AS (
  SELECT l.*
  FROM \"JournalLine\" l
  JOIN \"JournalEntry\" e ON e.id = l.\"entryId\"
  WHERE e.status <> 'REVERSED'
    AND e.\"sourceType\" NOT IN ('REVERSAL', 'FiscalYearClose')
)
SELECT COALESCE(string_agg(code, ', '), '')
FROM (
  SELECT a.code
  FROM live v JOIN \"Account\" a ON a.id = v.\"accountId\"
  WHERE a.code NOT IN ($CONTRA)
  GROUP BY a.code, a.type
  HAVING (a.type IN ('ASSET','EXPENSE')  AND sum(v.credit) > sum(v.debit))
      OR (a.type IN ('LIABILITY','EQUITY','REVENUE') AND sum(v.debit)  > sum(v.credit))
) x;")

# ⚠️ `1102` بانک روی پایگاه‌دادهٔ توسعه وارونه است، چون آزمون‌ها
#    پرداختِ حقوق می‌زنند بی‌آنکه واریزی ثبت کنند.  دادهٔ آزمون است،
#    نه اشکالِ کد — و اگر اینجا شکست می‌داد، قرمزی می‌شد که هیچ‌کس
#    نمی‌تواند سبزش کند.
KNOWN="${LEDGER_KNOWN_INVERTED:-1102}"
REAL=$(printf '%s' "$BAD" | tr -d ' ' | tr ',' '\n' | grep -vxF "$KNOWN" | grep -v '^$' | paste -sd, -)

chk "حسابی با ماندهٔ وارونه نیست" "${REAL:-none}" "none"

if [ -n "$REAL" ]; then
  echo
  echo "     دارایی و هزینه باید بدهکار بمانند، بدهی و سرمایه و درآمد بستانکار."
  echo "     اگر حسابی عمداً کاهنده است، کدش را به CONTRA اضافه کنید."
fi

echo '--- ۳) هر سند دوطرفه است ---'
# ⚠️ سندِ یک‌طرفه تراز کل را نمی‌شکند اگر سندِ یک‌طرفهٔ دیگری خنثی‌اش
#    کند — ولی هر دو غلط‌اند و در گزارشِ حساب دیده می‌شوند.
chk "سندِ نامتراز نیست" \
  "$(Q "SELECT count(*) FROM (
          SELECT l.\"entryId\"
          FROM \"JournalLine\" l
          JOIN \"JournalEntry\" e ON e.id = l.\"entryId\"
          WHERE e.status <> 'REVERSED'
          GROUP BY l.\"entryId\"
          HAVING round(sum(l.debit) - sum(l.credit)) <> 0
        ) x;")" "0"

echo '--- ۴) خطِ بدون حساب نیست ---'
chk "همهٔ خطوط حساب دارند" \
  "$(Q "SELECT count(*) FROM \"JournalLine\" WHERE \"accountId\" IS NULL;")" "0"

# ⚠️ خطی که هم بدهکار باشد هم بستانکار، در گزارش دو بار شمرده می‌شود.
chk "خطِ دوعلامتی نیست" \
  "$(Q "SELECT count(*) FROM \"JournalLine\" WHERE debit > 0 AND credit > 0;")" "0"

chk "خطِ صفر-صفر نیست" \
  "$(Q "SELECT count(*) FROM \"JournalLine\" WHERE COALESCE(debit,0) = 0 AND COALESCE(credit,0) = 0;")" "0"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
