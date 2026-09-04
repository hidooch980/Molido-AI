#!/usr/bin/env bash
#
# بهای تمام‌شدهٔ میانگین موزون.
#
# ⚠️ چه چیزی غلط بود؟
#
#    بهای تمام‌شدهٔ فروش از `Product."purchasePrice"` می‌آمد — عددی که
#    هر دریافتِ خرید بازنویسی‌اش می‌کرد.  یعنی بهای **همهٔ** واحدهای
#    فروخته‌شده با قیمتِ آخرین خرید حساب می‌شد.
#
#    سنجهٔ اصلیِ این فایل همین است: صد واحد به ۱۰۰۰ و صد واحد به
#    ۲۰۰۰ ⇒ میانگین باید ۱۵۰۰ باشد.  کدِ قبلی ۲۰۰۰ می‌داد و سودِ
#    ناخالص را کمتر از واقع گزارش می‌کرد.
#
#    خطایی که هیچ‌کس نمی‌بیند: صورتِ سود و زیان عددِ معقولی نشان
#    می‌دهد، فقط غلط است.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

# توکن مشترک: اگر `run-tests.sh` یک بار وارد شده باشد، دوباره وارد
# نمی‌شویم.  سقف ورود عمداً سخت است (جلوی حدس رمز را می‌گیرد)، و ورودِ
# جداگانه در هر مجموعه همان سقف را می‌خورد، توکن خالی برمی‌گردد، و
# مجموعه با شکست‌هایی می‌افتد که هیچ ربطی به کد ندارند.
T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json'   -d '{"email":"admin@molido.ai","password":"'"$PW"'"}'   | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  # پیام قبلی همیشه «سقف ورود» را متهم می‌کرد — ولی رمزِ غلط، سرویسِ
  # خاموش و سقفِ ورود سه چیز متفاوت‌اند و سه راه‌حل متفاوت دارند.
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST $A/auth/login     -H 'Content-Type: application/json' -d '{"email":"admin@molido.ai","password":"'"$PW"'"}')
  case "$code" in
    000) echo "  ✗ ورود ناموفق — سرویس روی $A پاسخ نمی‌دهد" ;;
    401) echo "  ✗ ورود ناموفق — رمز نادرست است (MOLIDO_ADMIN_PASSWORD را بده)" ;;
    429) echo "  ✗ ورود ناموفق — سقف ورود خورده؛ چند دقیقه صبر کن" ;;
    *)   echo "  ✗ ورود ناموفق — پاسخ $code از $A/auth/login" ;;
  esac
  exit 1
fi
AU="Authorization: Bearer $T"; JS="Content-Type: application/json"
P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except ValueError:
    # پاسخ JSON نبود: خالی، ۴۲۹ بی‌بدنه، یا اتصال قطع‌شده.  بدون این
    # برچسب، خروجیِ خالی در گزارش شبیه اشکال منطقی به نظر می‌رسید.
    # برچسب باید بی‌گیومه و بی‌بک‌اسلش باشد: این مقدار در عبارتِ
    # پایتونِ سنجهٔ بعدی جاگذاری می‌شود و اگر گیومه داشته باشد نحو
    # را می‌شکند — یعنی برچسبِ تشخیصی، خودش شکست تازه می‌سازد.
    bad = chr(39) + chr(34) + chr(92)
    safe = ''.join(c for c in raw[:40] if c.isprintable() and c not in bad)
    print('<<پاسخ-JSON-نبود: %d نویسه: %s>>' % (len(raw), safe)); sys.exit(0)
print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -t -c "$1" | tr -d ' \r\n'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

SUP=$(curl -s "$A/suppliers" -H "$AU" | P "d[0]['id']")
WH=$(curl -s "$A/warehouses" -H "$AU" | P "d[0]['id']")
CO=$(Q "SELECT \"companyId\" FROM \"Warehouse\" WHERE id='$WH';")

# ⚠️ کالای اختصاصی، نه کالای seed.
#
#    این آزمون بها و موجودی را عمداً دستکاری می‌کند.  روی کالای مشترک،
#    مجموعه‌های دیگر را با شکستِ دروغین می‌انداخت — همان چیزی که یک بار
#    شش سنجهٔ `e2e-cycles` را قرمز کرد.
PROD="avgcost-p1"
cleanup() {
  $C exec -T postgres psql -U postgres -d molido_ai -q -c "
    -- ⚠️ سندِ معکوسِ مرجوعی هم باید برود: sourceIdِ آن شناسهٔ سندِ
    --    معکوس‌شده است، نه فاکتور — پس با شرطِ ساده پیدا نمی‌شد و
    --    هر اجرا یک سند جا می‌گذاشت.  نگهبانِ نشت گرفتش.
    DELETE FROM \"JournalLine\" WHERE \"entryId\" IN
      (SELECT id FROM \"JournalEntry\" WHERE \"sourceId\" IN
        (SELECT id FROM \"Sale\" WHERE note='AVGCOST-sale'
         UNION SELECT id FROM \"Purchase\" WHERE note LIKE 'AVGCOST%'
         UNION SELECT id FROM \"ProductReturn\" WHERE reason LIKE 'AVGCOST%'
         UNION SELECT id FROM \"JournalEntry\" WHERE \"sourceId\" IN
           (SELECT id FROM \"Sale\" WHERE note='AVGCOST-sale'
            UNION SELECT id FROM \"ProductReturn\" WHERE reason LIKE 'AVGCOST%')));
    DELETE FROM \"JournalEntry\" WHERE \"sourceId\" IN
      (SELECT id FROM \"Sale\" WHERE note='AVGCOST-sale'
       UNION SELECT id FROM \"Purchase\" WHERE note LIKE 'AVGCOST%'
       UNION SELECT id FROM \"ProductReturn\" WHERE reason LIKE 'AVGCOST%'
       UNION SELECT id FROM \"JournalEntry\" WHERE \"sourceId\" IN
         (SELECT id FROM \"Sale\" WHERE note='AVGCOST-sale'
          UNION SELECT id FROM \"ProductReturn\" WHERE reason LIKE 'AVGCOST%'));
    DELETE FROM \"ProductReturnItem\" WHERE \"productId\"='$PROD';
    DELETE FROM \"ProductReturn\" WHERE reason LIKE 'AVGCOST%';
    DELETE FROM \"StockMovement\" WHERE \"productId\"='$PROD';
    DELETE FROM \"SaleItem\" WHERE \"productId\"='$PROD';
    DELETE FROM \"Sale\" WHERE note='AVGCOST-sale';
    DELETE FROM \"PurchaseItem\" WHERE \"productId\"='$PROD';
    DELETE FROM \"Purchase\" WHERE note LIKE 'AVGCOST%';
    DELETE FROM \"Inventory\" WHERE \"productId\"='$PROD';
    DELETE FROM \"Warehouse\" WHERE id='avgcost-wh2';
    DELETE FROM \"Product\" WHERE id='$PROD';" >/dev/null 2>&1
}
cleanup
trap cleanup EXIT

$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  INSERT INTO \"Product\" (id, \"companyId\", name, sku, unit, \"salePrice\", \"purchasePrice\", \"trackInventory\")
  VALUES ('$PROD','$CO','AvgCost Probe','AVGCOST-1','adad',5000,1000,true);" >/dev/null 2>&1

buy() {  # مقدار، بها، کرایه
  local r
  r=$(curl -s -X POST $A/purchases -H "$AU" -H "$JS" -d "{
    \"supplierId\":\"$SUP\",\"warehouseId\":\"$WH\",\"receive\":true,
    \"note\":\"AVGCOST\",\"freightCost\":$3,
    \"items\":[{\"productId\":\"$PROD\",\"quantity\":$1,\"purchasePrice\":$2}]}")
  echo "$r" | P "d.get('id','')"
}
avg() { Q "SELECT round(\"avgCost\",2)::text FROM \"Inventory\" WHERE \"productId\"='$PROD' AND \"warehouseId\"='$WH';"; }

echo '--- ۱) نخستین خرید، میانگین را می‌سازد ---'
buy 100 1000 0 >/dev/null
chk "موجودی ۱۰۰" "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE \"productId\"='$PROD';")" "100"
chk "میانگین ۱۰۰۰" "$(avg)" "1000.00"

echo '--- ۲) خریدِ گران‌تر، میانگین را وسط می‌برد ---'
#
# ⚠️ قلبِ این آزمون.
#
#    (۱۰۰×۱۰۰۰ + ۱۰۰×۲۰۰۰) ÷ ۲۰۰ = ۱۵۰۰
#    کدِ قبلی اینجا ۲۰۰۰ می‌داد — یعنی بهای صد واحدِ ارزان را هم
#    گران حساب می‌کرد.
buy 100 2000 0 >/dev/null
chk "موجودی ۲۰۰" "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE \"productId\"='$PROD';")" "200"
chk "میانگین ۱۵۰۰ شد" "$(avg)" "1500.00"

echo '--- ۳) فروش میانگین را عوض نمی‌کند ---'
# تعریفِ میانگین موزون: خروج بها را دست نمی‌زند.
CUST=$(Q "SELECT id FROM \"Customer\" LIMIT 1;")
SALE=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"customerId\":\"$CUST\",\"warehouseId\":\"$WH\",\"note\":\"AVGCOST-sale\",
  \"paymentMethod\":\"CASH\",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":10,\"price\":5000}]}")
SID=$(echo "$SALE" | P "d.get('id','')")
chk "فروش ثبت شد" "$([ -n "$SID" ] && echo yes || echo no)" "yes"
chk "موجودی ۱۹۰" "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE \"productId\"='$PROD';")" "190"
chk "میانگین همان ۱۵۰۰" "$(avg)" "1500.00"

echo '--- ۴) سندِ بهای تمام‌شده با میانگین خورد، نه با آخرین خرید ---'
#
# ⚠️ همان جایی که خطا به صورتِ سود و زیان می‌رسید.
#
#    ۱۰ واحد × ۱۵۰۰ = ۱۵۰۰۰.  با کدِ قبلی ۱۰×۲۰۰۰ = ۲۰۰۰۰ می‌شد،
#    یعنی ۵۰۰۰ سودِ ناخالصِ گزارش‌نشده.
chk "بهای تمام‌شده ۱۵۰۰۰" \
  "$(Q "SELECT round(SUM(l.debit))::int FROM \"JournalLine\" l
        JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
        WHERE e.\"sourceType\"='SaleCogs' AND e.\"sourceId\"='$SID' AND l.debit>0;")" "15000"

echo '--- ۵) کرایهٔ حمل وارد میانگین می‌شود ---'
#
# ⚠️ پیش‌تر خریدِ بی‌کرایه اصلاً بها ثبت نمی‌کرد (`if share===0 continue`)
#    و خریدِ باکرایه هم فقط `purchasePrice` را بازنویسی می‌کرد.
#
#    ۱۹۰×۱۵۰۰ + ۱۰×(۱۰۰۰+۵۰۰۰/۱۰) = ۲۸۵۰۰۰ + ۱۵۰۰۰ = ۳۰۰۰۰۰ ÷ ۲۰۰ = ۱۵۰۰
P3=$(buy 10 1000 5000)
chk "موجودی ۲۰۰" "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE \"productId\"='$PROD';")" "200"
chk "میانگین ۱۵۰۰ ماند" "$(avg)" "1500.00"
# ⚠️ سنجه روی **همین** فاکتور است، نه MAX روی همهٔ خریدها.
#
#    MAX عددِ خریدِ گرانِ مرحلهٔ ۲ را برمی‌گرداند (۲۰۰۰) که هیچ ربطی
#    به کرایه ندارد.  نسخهٔ اول همین اشتباه را داشت و قرمزی‌اش را به
#    حسابِ کد گذاشتم تا در اجرای مستقل ثابت شد بهای رسیده درست است.
chk "بهای رسیده با کرایه ثبت شد" \
  "$(Q "SELECT round(\"landedUnitCost\")::int FROM \"PurchaseItem\" WHERE \"purchaseId\"='$P3';")" "1500"

echo '--- ۶) قید پایگاه داده: بهای منفی رد می‌شود ---'
# اگر روزی فرمول اشتباه شود، باید همان‌جا بشکند نه در گزارشِ ماه بعد.
chk "بهای منفی رد شد" \
  "$($C exec -T postgres psql -U postgres -d molido_ai -tAq -c \
     "UPDATE \"Inventory\" SET \"avgCost\"=-1 WHERE \"productId\"='$PROD';" 2>&1 \
     | grep -c 'violates check constraint')" "1"

echo '--- ۷) مرجوعی با بهای لحظهٔ فروش برمی‌گردد، نه بهای امروز ---'
#
# ⚠️ تنها سنجه‌ای که نشتِ دفتر کل را می‌گیرد.
#
#    فروشِ بخشِ ۳ با میانگینِ ۱۵۰۰ خرج خورد.  حالا عمداً یک خریدِ گران
#    ثبت می‌کنیم تا میانگین بالا برود، بعد همان قلم را برمی‌گردانیم.
#
#    اگر مرجوعی بهای *امروز* را بخواند، بدهکارِ فروش و بستانکارِ
#    برگشت برابر نمی‌شوند و اختلاف **برای همیشه** در دفتر کل می‌ماند —
#    بی‌آنکه تراز آزمایشی بهم بخورد، چون هر دو سند خودشان تراز‌ند.
buy 200 3000 0 >/dev/null
chk "میانگین بالا رفت" "$([ "$(avg)" != "1500.00" ] && echo yes || echo no)" "yes"

SITEM=$(Q "SELECT id FROM \"SaleItem\" WHERE \"saleId\"='$SID' LIMIT 1;")
chk "بهای ثبت‌شدهٔ سطر ۱۵۰۰ مانده" \
  "$(Q "SELECT round(\"unitCost\")::int FROM \"SaleItem\" WHERE id='$SITEM';")" "1500"

RET=$(curl -s -X POST $A/returns/sale -H "$AU" -H "$JS" -d "{
  \"saleId\":\"$SID\",\"reason\":\"AVGCOST-ret\",\"refundMethod\":\"NONE\",
  \"items\":[{\"sourceItemId\":\"$SITEM\",\"qty\":10}]}")
RID=$(echo "$RET" | P "d.get('id','')")
chk "مرجوعی ثبت شد" "$([ -n "$RID" ] && echo yes || echo no)" "yes"

# بهای برگشتی باید همان ۱۵۰۰×۱۰ باشد، نه بهای امروز.
chk "برگشت با ۱۵۰۰۰ خورد" \
  "$(Q "SELECT COALESCE(round(SUM(l.credit)),0)::int
        FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
        WHERE e.\"sourceId\"='$RID' AND l.credit>0
          AND l.\"accountId\" IN (SELECT l2.\"accountId\" FROM \"JournalLine\" l2
            JOIN \"JournalEntry\" e2 ON e2.id=l2.\"entryId\"
            WHERE e2.\"sourceType\"='SaleCogs' AND e2.\"sourceId\"='$SID' AND l2.debit>0);")" "15000"

echo '--- ۸) انتقال بین انبارها ارزش نمی‌سازد و نمی‌خورد ---'
#
# ⚠️ اگر بها همراه کالا نرود، ارزشِ کلِ موجودیِ شرکت بی‌سروصدا عوض
#    می‌شود بی‌آنکه چیزی خریده یا فروخته شده باشد.
# ⚠️ انبارِ دوم را خودمان می‌سازیم، نه اینکه اگر نبود از بخش بگذریم.
#
#    گذشتن از یک بخش یعنی سبز شدنِ آزمون بدونِ آزمودنِ چیزی — و
#    بدتر از قرمز است، چون کسی متوجه نمی‌شود.
WH2="avgcost-wh2"
$C exec -T postgres psql -U postgres -d molido_ai -q -c "
  INSERT INTO \"Warehouse\" (id, \"companyId\", name, code)
  VALUES ('$WH2','$CO','AvgCost WH2','AVGCOST-W2')
  ON CONFLICT (id) DO NOTHING;" >/dev/null 2>&1
if [ -n "$WH2" ]; then
  V1=$(Q "SELECT round(COALESCE(SUM(quantity*\"avgCost\"),0))::int FROM \"Inventory\" WHERE \"productId\"='$PROD';")
  curl -s -X POST $A/inventory/transfer -H "$AU" -H "$JS" -d "{
    \"productId\":\"$PROD\",\"fromWarehouseId\":\"$WH\",\"toWarehouseId\":\"$WH2\",
    \"quantity\":50}" >/dev/null
  V2=$(Q "SELECT round(COALESCE(SUM(quantity*\"avgCost\"),0))::int FROM \"Inventory\" WHERE \"productId\"='$PROD';")
  chk "ارزشِ کل پیش و پس از انتقال یکی است" "$V2" "$V1"
  chk "بها به انبار مقصد رسید" \
    "$(Q "SELECT CASE WHEN \"avgCost\" IS NULL THEN 'tohi' ELSE 'darad' END FROM \"Inventory\" WHERE \"productId\"='$PROD' AND \"warehouseId\"='$WH2';")" "darad"
else
  echo '  (انبار دومی نیست — از این بخش گذشتیم)'
fi

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
