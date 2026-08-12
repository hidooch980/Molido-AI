#!/usr/bin/env bash
#
# ⚠️ دادهٔ آزمون عمداً لاتین است: پوستهٔ ویندوز متن فارسی را در `curl -d`
#    به علامت سؤال تبدیل می‌کند و شکستِ کاذب می‌سازد.  خودِ برنامه یونیکد
#    را درست ذخیره می‌کند؛ برای آزمودنش JSON را در فایل UTF-8 بنویسید و با
#    `curl --data-binary @file` بفرستید.
# آزمون یکپارچهٔ پایانی — همهٔ زیرسیستم‌ها روی داده واقعی
cd "D:/aziz/molido-ai/Molido-AI-main" || exit 1
A=http://localhost:3000
C="docker compose -f docker-compose.yml -f docker-compose.store.yml"

T=$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@molido.ai","password":"admin123"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['accessToken'])")
AU="Authorization: Bearer $T"
JS="Content-Type: application/json"

P() { python3 -c "import sys,json,io;sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8');d=json.load(sys.stdin);print($1)"; }

pass=0; fail=0
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
