#!/usr/bin/env bash
#
# ⚠️ دادهٔ آزمون عمداً لاتین است: پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند و شکستِ کاذب می‌سازد.  خودِ برنامه یونیکد
#    را درست ذخیره می‌کند؛ برای آزمودنش JSON را در فایل UTF-8 بنویسید و با
#    `curl --data-binary @file` بفرستید.
# آزمون یکپارچهٔ پایانی — همهٔ زیرسیستم‌ها روی داده واقعی
cd "D:/aziz/molido-ai/Molido-AI-main" || exit 1
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
AU="Authorization: Bearer $T"
JS="Content-Type: application/json"

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

pass=0; fail=0

# ⚠️ این مجموعه تا امروز هیچ پاک‌سازی‌ای نداشت.
#
#    بخشِ ۳ دو واحد از `seed-p3` می‌فروشد و بخشِ ۵ یکی را برمی‌گرداند
#    — یعنی هر اجرا **یک واحد** موجودی و **۳۱۰۰۰۰** صندوق را برای
#    همیشه جابه‌جا می‌کرد.
#
#    نتیجه‌اش شکستِ دروغین در مجموعه‌های دیگری بود که موجودیِ دقیق را
#    می‌سنجند؛ یک بار شش سنجهٔ `e2e-cycles` را قرمز کرد و وقتِ زیادی
#    صرفِ عیب‌یابیِ چیزی شد که اصلاً خراب نبود.
#
# ⚠️ وضعیتِ پیش از آزمون **قبل از** هر تغییری گرفته می‌شود.
Q0=$($C exec -T postgres psql -U postgres -d molido_ai -tAq -c   "SELECT quantity FROM \"Inventory\" WHERE \"productId\"='seed-p3' AND \"warehouseId\"='seed-warehouse';" | tr -d ' 
')
C0=$($C exec -T postgres psql -U postgres -d molido_ai -tAq -c   "SELECT balance FROM \"CashBox\" WHERE id='seed-cashbox';" | tr -d ' 
')

# ⚠️ حذفِ سند در **جفت** انجام می‌شود.
#
#    فروش، بهای تمام‌شده، دریافت و برگشت هرکدام سندِ خودشان را دارند.
#    اگر یکی بماند و بقیه بروند، تراز آزمایشی — که خودِ همین مجموعه
#    در بخشِ ۹ می‌سنجدش — در اجرای بعدی می‌شکند.
cleanup() {
  [ -z "$SID" ] && return 0

  # ⚠️ شناسهٔ مرجوعی **پیش از** حذف گرفته می‌شود.
  #
  #    اگر داخلِ خودِ SQL با زیرپرس‌وجو خوانده می‌شد، ترتیبِ دستورها
  #    اهمیت پیدا می‌کرد: حذفِ `ProductReturn` زیرپرس‌وجوی بعدی را
  #    خالی می‌کرد و حرکتِ انبارِ برگشت جا می‌ماند.  همین یک بار رخ داد
  #    و نگهبانِ نشت گرفتش.
  local RID
  RID=$($C exec -T postgres psql -U postgres -d molido_ai -tAq -c     "SELECT id FROM \"ProductReturn\" WHERE \"saleId\"='$SID' LIMIT 1;" | tr -d ' 
')

  # ⚠️ سندِ معکوس هم باید برود.
  #
  #    مرجوعی سندِ `REVERSAL` می‌سازد که `sourceId`ش شناسهٔ **سندِ
  #    معکوس‌شده** است، نه فاکتور و نه برگشت.  پس با شرطِ ساده پیدا
  #    نمی‌شد و هر اجرا دو سند جا می‌گذاشت.
  $C exec -T postgres psql -U postgres -d molido_ai -q -c "
    DELETE FROM \"JournalLine\" WHERE \"entryId\" IN
      (SELECT id FROM \"JournalEntry\"
        WHERE \"sourceId\" IN ('$SID','$RID')
           OR \"sourceId\" IN (SELECT id FROM \"JournalEntry\"
                                WHERE \"sourceId\" IN ('$SID','$RID')));
    DELETE FROM \"JournalEntry\"
      WHERE \"sourceId\" IN ('$SID','$RID')
         OR \"sourceId\" IN (SELECT id FROM \"JournalEntry\"
                              WHERE \"sourceId\" IN ('$SID','$RID'));
    DELETE FROM \"StockMovement\" WHERE \"refId\" IN ('$SID','$RID');
    DELETE FROM \"ProductReturnItem\" WHERE \"returnId\"='$RID';
    DELETE FROM \"ProductReturn\" WHERE id='$RID';
    DELETE FROM \"Payment\" WHERE \"saleId\"='$SID';
    DELETE FROM \"SaleItem\" WHERE \"saleId\"='$SID';
    DELETE FROM \"Sale\" WHERE id='$SID';
    UPDATE \"Inventory\" SET quantity=$Q0
      WHERE \"productId\"='seed-p3' AND \"warehouseId\"='seed-warehouse';
    UPDATE \"CashBox\" SET balance=$C0 WHERE id='seed-cashbox';" >/dev/null 2>&1

  [ -z "$T_COMM" ] && return 0
  $C exec -T postgres psql -U postgres -d molido_ai -q -c "
    DELETE FROM \"JournalLine\" WHERE \"entryId\" IN
      (SELECT id FROM \"JournalEntry\"
        WHERE \"sourceType\" IN ('AgentCommission','REVERSAL')
          AND \"createdAt\" > '$T_COMM');
    DELETE FROM \"JournalEntry\"
      WHERE \"sourceType\" IN ('AgentCommission','REVERSAL')
        AND \"createdAt\" > '$T_COMM';
    DELETE FROM \"AgentCommission\" WHERE \"createdAt\" > '$T_COMM';" >/dev/null 2>&1
}
trap cleanup EXIT
chk() { # chk "label" "actual" "expected"
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"
  else fail=$((fail+1)); printf '  FAIL %s  (got=%s want=%s)\n' "$1" "$2" "$3"; fi
}
chk_http() {
  code=$(curl -s -o /dev/null -w "%{http_code}" "$A/$1" -H "$AU")
  chk "$1" "$code" "200"
}

echo
echo '########## ۱) اندپوینت‌های خواندنی ##########'
for e in sales purchases suppliers expenses customers products inventory \
         inventory/low-stock warehouses categories cashbox treasury/accounts \
         cheques returns returns/stats ledger/entries ledger/trial-balance \
         ledger/income-statement ledger/balance-sheet ledger/fiscal-years \
         accounting/summary accounting/accounts assets assets/stats \
         sales-agents sales-agents/stats sales-agents/commissions \
         stock-count reports/dashboard reports/sales reports/profit \
         reports/sales/breakdown sales-chain/stats quotations sales-orders \
         shipments users audit-log notifications; do
  chk_http "$e"
done

echo
echo '########## ۲) موجودی: محافظ کف صفر ##########'
BOX=$(curl -s "$A/cashbox" -H "$AU" | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
R=$(curl -s -X POST $A/inventory/adjust -H "$AU" -H "$JS" \
  -d '{"productId":"seed-p3","warehouseId":"seed-warehouse","quantityChange":-999999}' \
  | P "d.get('statusCode')")
chk "adjust below zero rejected" "$R" "400"

echo
echo '########## ۳) فروش کامل ##########'
SALE=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"seed-warehouse\",
  \"items\":[{\"productId\":\"seed-p3\",\"quantity\":2,\"price\":310000}],
  \"payments\":[{\"method\":\"CASH\",\"amount\":620000,\"cashBoxId\":\"$BOX\"}]}")
SID=$(echo "$SALE" | P "d.get('id','')")
chk "sale created" "$(echo "$SALE" | P "'yes' if d.get('id') else 'no'")" "yes"
chk "sale total" "$(echo "$SALE" | P "int(float(d.get('total',0)))")" "620000"

echo
echo '########## ۴) کاردکس ثبت شد ##########'
K=$($C exec -T postgres psql -U postgres -d molido_ai -t -c \
  "SELECT reason FROM \"StockMovement\" ORDER BY \"createdAt\" DESC LIMIT 1;" | tr -d ' \r\n')
chk "kardex records SALE" "$K" "SALE"

echo
echo '########## ۵) مرجوعی + عودت نقدی ##########'
IID=$(curl -s "$A/sales/$SID" -H "$AU" | P "(d.get('items') or [{}])[0].get('id','')")
RET=$(curl -s -X POST $A/returns/sale -H "$AU" -H "$JS" \
  -d "{\"saleId\":\"$SID\",\"items\":[{\"sourceItemId\":\"$IID\",\"qty\":1}],\"refundMethod\":\"CASH\",\"cashBoxId\":\"$BOX\"}")
chk "return created" "$(echo "$RET" | P "'yes' if d.get('returnNo') else 'no'")" "yes"
OVER=$(curl -s -X POST $A/returns/sale -H "$AU" -H "$JS" \
  -d "{\"saleId\":\"$SID\",\"items\":[{\"sourceItemId\":\"$IID\",\"qty\":99}],\"refundMethod\":\"NONE\"}" \
  | P "d.get('statusCode')")
chk "over-return rejected" "$OVER" "400"

echo
echo '########## ۶) استهلاک idempotent ##########'
curl -s -X POST $A/assets/depreciation/run -H "$AU" -H "$JS" -d '{"period":"2026-07-01"}' >/dev/null
D2=$(curl -s -X POST $A/assets/depreciation/run -H "$AU" -H "$JS" -d '{"period":"2026-07-01"}' | P "d.get('total')")
chk "depreciation repeat = 0" "$D2" "0"

echo
echo '########## ۷) کمیسیون idempotent ##########'
# ⚠️ مهرِ زمانی پیش از فراخوانی گرفته می‌شود تا پاک‌سازی فقط چیزی را
#    ببرد که **همین اجرا** ساخته.
#
#    محاسبهٔ کمیسیون هر بار سندهای قبلی را معکوس و دوباره صادر می‌کند،
#    پس هر اجرا دو `AgentCommission` و دو `REVERSAL` جا می‌گذاشت.
#    حذفِ کورکورانه‌شان کمیسیونِ واقعیِ شرکت را هم می‌برد.
T_COMM=$($C exec -T postgres psql -U postgres -d molido_ai -tAq -c "SELECT now();" | tr -d '')

c1=$(curl -s -X POST $A/sales-agents/commissions/calculate -H "$AU" -H "$JS" -d '{}' | P "d.get('total')")
c2=$(curl -s -X POST $A/sales-agents/commissions/calculate -H "$AU" -H "$JS" -d '{}' | P "d.get('total')")
chk "commission stable on repeat" "$c1" "$c2"

echo
echo '########## ۸) RLS ##########'
N=$($C exec -T postgres env PGPASSWORD=molido_app_local psql -U molido_app -d molido_ai -t \
  -c "SELECT count(*) FROM \"Sale\";" | tr -d ' \r\n')
chk "no rows without tenant context" "$N" "0"

UNPROT=$($C exec -T postgres psql -U postgres -d molido_ai -t -c "
SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
JOIN information_schema.columns col ON col.table_name=c.relname
  AND col.table_schema='public' AND col.column_name='companyId'
WHERE n.nspname='public' AND c.relkind='r'
  AND NOT EXISTS (SELECT 1 FROM pg_policies p
    WHERE p.tablename=c.relname AND p.policyname='company_isolation');" | tr -d ' \r\n')
chk "every companyId table protected" "$UNPROT" "0"

echo
echo '########## ۹) تراز آزمایشی ##########'
DIFF=$($C exec -T postgres psql -U postgres -d molido_ai -t -c \
  "SELECT COALESCE(SUM(l.debit)-SUM(l.credit),0)::numeric(18,2) FROM \"JournalLine\" l
     JOIN \"JournalEntry\" e ON e.id=l.\"entryId\" WHERE e.status<>'DRAFT';" | tr -d ' \r\n')
chk "trial balance is zero" "$DIFF" "0.00"

echo
echo '########## ۱۰) صفحه‌های وب ##########'
for p in dashboard pos products inventory stock-count customers sales \
         sales-chain returns accounting assets fiscal-year sales-agents \
         labels reports; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3002/$p")
  chk "web /$p" "$code" "200"
done

echo
echo "==================================================="
printf "   PASS: %s     FAIL: %s\n" "$pass" "$fail"
echo "==================================================="
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
