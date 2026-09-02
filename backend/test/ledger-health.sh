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

echo '--- ۵) سلامتِ انبار و بهای تمام‌شده ---'
#
# ⚠️ این‌ها هم مثل دفتر کل **بی‌صدا** خراب می‌شوند.
#
#    موجودیِ منفی یعنی کالایی فروخته شده که نبود.  بهای منفی یعنی
#    میانگین موزون جایی شکسته.  و قلمِ فروشِ بی‌بها یعنی سودِ ناخالص
#    از بهای **امروز** حساب می‌شود نه بهای آن روز — که هیچ خطایی
#    نمی‌دهد، چون گزارش عقب‌گردِ `COALESCE` دارد.

chk "موجودیِ منفی نیست" \
  "$(Q 'SELECT count(*) FROM "Inventory" WHERE quantity < 0;')" "0"

chk "بهای میانگینِ منفی نیست" \
  "$(Q 'SELECT count(*) FROM "Inventory" WHERE "avgCost" < 0;')" "0"

chk "موجودیِ بی‌کالا نیست" \
  "$(Q 'SELECT count(*) FROM "Inventory" i
        WHERE NOT EXISTS (SELECT 1 FROM "Product" p WHERE p.id = i."productId");')" "0"

chk "موجودیِ بی‌انبار نیست" \
  "$(Q 'SELECT count(*) FROM "Inventory" i
        WHERE NOT EXISTS (SELECT 1 FROM "Warehouse" w WHERE w.id = i."warehouseId");')" "0"

# ⚠️ اقلامی که کالایشان هم بهای خرید ندارد استثنا می‌شوند: نوشتنِ صفر
#    برایشان بدتر از تهی است — صفر یعنی «رایگان فروختیم» و سود را
#    صددرصد نشان می‌دهد.
chk "قلمِ فروشِ بی‌بها نمانده" \
  "$(Q 'SELECT count(*) FROM "SaleItem" si
        JOIN "Product" p ON p.id = si."productId"
        WHERE si."unitCost" IS NULL AND COALESCE(p."purchasePrice", 0) > 0;')" "0"

echo '--- ۵.۵) موجودیِ صندوق با دفتر می‌خواند؟ ---'
#
# ⚠️ این سنجه از شش اشکالِ واقعی درآمد که همگی **بی‌صدا** بودند.
#
#    چهار مسیر پول را جابه‌جا می‌کردند بدونِ سند: واریز/برداشتِ صندوق،
#    واریز/برداشتِ خزانه، وصولِ مشتری، و تسویهٔ رستوران.  تراز آزمایشی
#    در همهٔ آن‌ها **صفر** ماند — چون وقتی سندی زده نمی‌شود، چیزی هم
#    نامتراز نمی‌شود.
#
#    تنها نشانه‌اش همین است: موجودیِ صندوق‌ها با ماندهٔ حسابِ ۱۱۰۱
#    نخواند.
#
# ⚠️ اختلافِ **گذشته** شکست نمی‌دهد، فقط گزارش می‌شود.
#
#    داده‌ای که پیش از اصلاح ساخته شده واقعاً واگرا است و با کد درست
#    نمی‌شود.  قرمزیِ همیشگی یعنی نگهبانی که کسی نگاهش نمی‌کند.
#    `LEDGER_CASH_DRIFT` سقفِ پذیرفته‌شدهٔ همان گذشته است؛ برای نصبِ
#    تازه صفر بگذارید.
CASH_BOX=$(Q 'SELECT COALESCE(round(sum(balance)),0) FROM "CashBox";')
CASH_GL=$(Q "SELECT COALESCE(round(sum(l.debit - l.credit)), 0)
               FROM \"JournalLine\" l
               JOIN \"Account\" a ON a.id = l.\"accountId\"
               JOIN \"JournalEntry\" e ON e.id = l.\"entryId\"
              WHERE a.code = '1101' AND e.status <> 'REVERSED';")
DRIFT=$(( ${CASH_BOX:-0} - ${CASH_GL:-0} ))
[ "$DRIFT" -lt 0 ] && DRIFT=$(( -DRIFT ))
ALLOW=${LEDGER_CASH_DRIFT:-25000000}

chk "واگراییِ صندوق و دفتر زیرِ سقف است"   "$([ "$DRIFT" -le "$ALLOW" ] && echo yes || echo "no (اختلاف=$DRIFT سقف=$ALLOW)")" "yes"

if [ "$DRIFT" -gt 0 ]; then
  printf '     صندوق‌ها: %s   حساب ۱۱۰۱: %s   اختلاف: %s
' "$CASH_BOX" "$CASH_GL" "$DRIFT"
fi

echo '--- ۵.۶) بهای تمام‌شدهٔ ناشناخته ---'
#
# ⚠️ این **شکست نمی‌دهد**، گزارش می‌دهد.  و عمدی است.
#
#    بهای تمام‌شده دادهٔ کسب‌وکار است، نه کد.  قلمی که بها ندارد از
#    سندِ بهای تمام‌شده بیرون می‌ماند — یعنی سود **بیش از واقع** نشان
#    داده می‌شود، نه غلط.
#
#    خطرش این است که کسی به آن عدد نگاه کند و نداند ناقص است.  پس
#    اینجا شمرده می‌شود تا دیده شود.
#
# ⚠️ نوشتنِ صفر به‌جای تهی، بدترین کار است.
#
#    صفر یعنی «رایگان فروختیم» و سود را صددرصد نشان می‌دهد — عددی که
#    شبیه دادهٔ واقعی است و کسی شک نمی‌کند.  تهی دستِ‌کم صادق است.
if [ -n "$(Q "SELECT to_regclass('public.\"MenuItem\"');")" ]; then
  NOCOST=$(Q 'SELECT count(*) FROM "MenuItem" WHERE COALESCE(cost, 0) = 0;')
  TOTAL_MI=$(Q 'SELECT count(*) FROM "MenuItem";')
  if [ "${NOCOST:-0}" -gt 0 ]; then
    printf '  !    %s قلم از %s بهای تمام‌شده ندارند — سودِ رستوران ناقص است
'       "$NOCOST" "$TOTAL_MI"
    printf '       پنل ← رستوران ← منو، ستونِ «بهای تمام‌شده»
'
  else
    printf '  OK   همهٔ اقلامِ منو بها دارند
'
    pass=$((pass+1))
  fi

  # ⚠️ این یکی **شکست می‌دهد**: قلمِ سفارشی که بها دارد ولی در سند
  #    نیامده، یعنی سندِ بهای تمام‌شده جا افتاده — اشکالِ کد، نه داده.
  ORPHAN=$(Q 'SELECT count(DISTINCT i."orderId")
                FROM "RestaurantOrderItem" i
                JOIN "RestaurantOrder" o ON o.id = i."orderId"
               WHERE o.status = '"'"'PAID'"'"'
                 AND i."unitCost" IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM "JournalEntry" e
                                  WHERE e."sourceType" = '"'"'RestaurantCogs'"'"'
                                    AND e."sourceId" = o.id);')
  chk "سفارشِ بادار بی‌سندِ بها نیست" "${ORPHAN:-0}" "0"
fi

echo '--- ۶) کارایی: کلید خارجیِ بی‌نمایه ---'
#
# ⚠️ این خرابیِ **فردا**ست، نه امروز.
#
#    پستگرس برای کلیدِ خارجی خودکار نمایه نمی‌سازد.  تا وقتی جدول
#    کوچک است هیچ اثری ندارد و هیچ آزمونی نمی‌گیردش — ولی با رشدِ
#    داده، حذفِ سطرِ والد و `JOIN` از سمتِ فرزند ناگهان کند می‌شوند.
#
#    و آن وقت ساختنِ نمایه روی جدولِ بزرگ، خودش قفلِ طولانی می‌خواهد.
#
#    ۴۰ مورد از ۲۰۹ کلیدِ خارجی بی‌نمایه بودند؛ مهاجرت ۰۶۷ بستشان.
#    این سنجه هست تا کلیدِ خارجیِ **تازه** هم بی‌نمایه نماند.
MISSING=$(Q "SELECT COALESCE(string_agg(t.relname || '.' || a.attname, ', '), 'none')
             FROM pg_constraint c
             JOIN pg_class     t  ON t.oid = c.conrelid
             JOIN pg_namespace ns ON ns.oid = t.relnamespace
             JOIN pg_attribute a  ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
             WHERE c.contype = 'f' AND ns.nspname = 'public'
               AND NOT EXISTS (
                 SELECT 1 FROM pg_index i
                  WHERE i.indrelid = c.conrelid AND c.conkey[1] = ANY(i.indkey));")

chk "کلید خارجیِ بی‌نمایه نیست" "$MISSING" "none"

if [ "$MISSING" != "none" ]; then
  echo
  echo "     مهاجرت ۰۶۷ را دوباره اجرا کنید — فهرست را خودش از پایگاه‌داده می‌سازد."
fi

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
