#!/usr/bin/env bash
#
# کالای امانی.
#
# ⚠️ دو سنجهٔ اصلی، و هر دو دربارهٔ حسابداری‌اند نه انبارداری:
#
#    ۱) **امانی دادن فروش نیست.**  هنگام خروج نباید هیچ درآمدی محقق
#       شود.  اگر بشود، درآمدِ امسال بالا و سالِ بعد پایین می‌رود — و
#       اگر کالا برگردد، فروشِ برگشتیِ ساختگی می‌سازد.
#
#    ۲) **امانیِ گرفته‌شده دارایی ما نیست.**  نه به موجودی اضافه می‌شود
#       نه سندی می‌خورد.  این تنها جایی است که «هیچ سندی نخورد» درست
#       است — و آزمون باید همین را تضمین کند، وگرنه فردا کسی «سند
#       جامانده» فرضش می‌کند و اضافه‌اش می‌کند.

set -u
cd "$(dirname "$0")/.."

API=http://localhost:3000
CF="-f ../docker-compose.yml -f ../docker-compose.store.yml"
PASS=0; FAIL=0

chk() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  OK   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi
}
sec() { printf -- '--- %s ---\n' "$*"; }
Q() { docker compose $CF exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>&1 | tr -d '\r'; }
P() { python -c "$1" 2>/dev/null; }

PW="${MOLIDO_ADMIN_PASSWORD:-}"
[ -n "$PW" ] || PW="$(grep '^ADMIN_PASSWORD=' ../.env | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"admin@molido.ai\",\"password\":\"$PW\"}" \
  | P 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
[ -n "$TOKEN" ] || { echo "  ✗ ورود نشد"; exit 1; }
A=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

CO=seed-company
WH=$(Q "SELECT id FROM \"Warehouse\" WHERE \"companyId\"='$CO' LIMIT 1")

cleanup() {
  Q "DELETE FROM \"JournalLine\" WHERE \"entryId\" IN
       (SELECT id FROM \"JournalEntry\" WHERE \"sourceType\" LIKE 'Consignment%');
     DELETE FROM \"JournalEntry\" WHERE \"sourceType\" LIKE 'Consignment%';
     DELETE FROM \"ConsignmentItem\" WHERE \"companyId\"='$CO';
     DELETE FROM \"Consignment\"     WHERE \"companyId\"='$CO';
     DELETE FROM \"StockMovement\"   WHERE \"refType\"='Consignment';
     DELETE FROM \"Inventory\"       WHERE \"productId\" LIKE 'cons-%';
     DELETE FROM \"Product\"         WHERE id LIKE 'cons-%';
     DELETE FROM \"Customer\"        WHERE id LIKE 'cons-%';
     DELETE FROM \"Supplier\"        WHERE id LIKE 'cons-%';" >/dev/null
}
trap cleanup EXIT
cleanup

POST() { curl -s "${A[@]}" -X POST "$API$1" -d "$2"; }
CODE() { curl -s -o /dev/null -w '%{http_code}' "${A[@]}" -X POST "$API$1" -d "$2"; }
J() { echo "$R" | P "import sys,json;d=json.load(sys.stdin);print($1)"; }

# ---------------------------------------------------------------- فیکسچر
sec "۰) داده"
Q "INSERT INTO \"Product\" (id,\"companyId\",name,sku,\"purchasePrice\",\"salePrice\",unit)
     VALUES ('cons-p1','$CO','کالای امانی','CONS-1',10000,15000,'عدد');
   INSERT INTO \"Inventory\" (id,\"warehouseId\",\"productId\",quantity,\"avgCost\")
     VALUES ('cons-inv','$WH','cons-p1',100,10000);
   INSERT INTO \"Customer\" (id,\"companyId\",\"firstName\") VALUES ('cons-c1','$CO','امانت‌گیر');
   INSERT INTO \"Supplier\" (id,\"companyId\",name)         VALUES ('cons-s1','$CO','مالکِ امانی');" >/dev/null
chk "موجودی اولیه ۱۰۰" "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE id='cons-inv'")" "100"

# ---------------------------------------------------------------- خروج
sec "۱) امانیِ داده‌شده"
R=$(POST /consignments "{\"direction\":\"OUT\",\"customerId\":\"cons-c1\",\"warehouseId\":\"$WH\",
     \"items\":[{\"productId\":\"cons-p1\",\"quantity\":30,\"unitPrice\":15000}]}")
OUT_ID=$(J "d.get('id','')")
chk "سند امانی ساخته شد" "$([ -n "$OUT_ID" ] && echo yes || echo no)" "yes"
chk "شمارهٔ سند"        "$(J "d.get('docNo')")" "AMO-00001"
chk "موجودی ۳۰ تا کم شد" "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE id='cons-inv'")" "70"

# ⚠️ اصلِ ماجرا: هیچ درآمدی نباید محقق شده باشد.
chk "درآمد فروش (۴۱۰۱) دست‌نخورده" \
  "$(Q "SELECT COALESCE(sum(l.credit),0)::int FROM \"JournalLine\" l
          JOIN \"Account\" a ON a.id=l.\"accountId\"
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE a.code='4101' AND e.\"sourceType\"='ConsignmentOut'")" "0"
# دارایی فقط جابه‌جا شده: ۱۱۰۸ بدهکار، ۱۱۰۴ بستانکار — ۳۰ × ۱۰٬۰۰۰
chk "امانیِ نزد دیگران (۱۱۰۸) بدهکار شد" \
  "$(Q "SELECT COALESCE(sum(l.debit),0)::int FROM \"JournalLine\" l
          JOIN \"Account\" a ON a.id=l.\"accountId\"
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE a.code='1108' AND e.\"sourceType\"='ConsignmentOut'")" "300000"
chk "موجودی کالا (۱۱۰۴) بستانکار شد" \
  "$(Q "SELECT COALESCE(sum(l.credit),0)::int FROM \"JournalLine\" l
          JOIN \"Account\" a ON a.id=l.\"accountId\"
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE a.code='1104' AND e.\"sourceType\"='ConsignmentOut'")" "300000"
# ⚠️ کاردکس باید بگوید «کجا رفت»، نه «اصلاح شد».
chk "کاردکس TRANSFER_OUT ثبت کرد" \
  "$(Q "SELECT reason FROM \"StockMovement\" WHERE \"refType\"='Consignment' LIMIT 1")" "TRANSFER_OUT"

# ---------------------------------------------------------------- تسویه
sec "۲) تسویه — اینجا درآمد محقق می‌شود"
ITEM=$(Q "SELECT id FROM \"ConsignmentItem\" WHERE \"consignmentId\"='$OUT_ID'")
R=$(POST "/consignments/items/$ITEM/settle" '{"quantity":10}')
chk "تسویه ثبت شد"  "$(J "d.get('kind')")"          "SETTLE"
chk "ماندهٔ امانی ۲۰" "$(J "int(d.get('remaining',0))")" "20"

chk "حالا درآمد محقق شد (۱۰ × ۱۵٬۰۰۰)" \
  "$(Q "SELECT COALESCE(sum(l.credit),0)::int FROM \"JournalLine\" l
          JOIN \"Account\" a ON a.id=l.\"accountId\"
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE a.code='4101' AND e.\"sourceType\"='ConsignmentSettle'")" "150000"
chk "بهای تمام‌شده (۵۱۰۱) بدهکار شد (۱۰ × ۱۰٬۰۰۰)" \
  "$(Q "SELECT COALESCE(sum(l.debit),0)::int FROM \"JournalLine\" l
          JOIN \"Account\" a ON a.id=l.\"accountId\"
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE a.code='5101' AND e.\"sourceType\"='ConsignmentSettle'")" "100000"
# ⚠️ تسویه نباید کالا را به انبار برگرداند.
chk "موجودی انبار همان ۷۰ ماند" \
  "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE id='cons-inv'")" "70"

# ---------------------------------------------------------------- برگشت
sec "۳) برگشت"
R=$(POST "/consignments/items/$ITEM/return" '{"quantity":5}')
chk "برگشت ثبت شد"     "$(J "d.get('kind')")"          "RETURN"
chk "ماندهٔ امانی ۱۵"   "$(J "int(d.get('remaining',0))")" "15"
chk "موجودی به ۷۵ رسید" "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE id='cons-inv'")" "75"
chk "میانگین بها دست‌نخورده ماند" \
  "$(Q "SELECT \"avgCost\"::int FROM \"Inventory\" WHERE id='cons-inv'")" "10000"
chk "۱۱۰۸ بستانکار شد (۵ × ۱۰٬۰۰۰)" \
  "$(Q "SELECT COALESCE(sum(l.credit),0)::int FROM \"JournalLine\" l
          JOIN \"Account\" a ON a.id=l.\"accountId\"
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE a.code='1108' AND e.\"sourceType\"='ConsignmentReturn'")" "50000"

# ---------------------------------------------------------------- سقف
sec "۴) بیش از مانده"
chk "تسویهٔ بیش از مانده رد می‌شود" \
  "$(CODE "/consignments/items/$ITEM/settle" '{"quantity":999}')" "400"
chk "مقدارِ صفر رد می‌شود" \
  "$(CODE "/consignments/items/$ITEM/settle" '{"quantity":0}')" "400"
chk "و مانده دست‌نخورده ماند" \
  "$(Q "SELECT (quantity - \"settledQty\" - \"returnedQty\")::int FROM \"ConsignmentItem\" WHERE id='$ITEM'")" "15"

# ---------------------------------------------------------------- ورودی
sec "۵) ورودیِ نامعتبر"
chk "جهتِ ناشناخته رد می‌شود" \
  "$(CODE /consignments "{\"direction\":\"SIDEWAYS\",\"customerId\":\"cons-c1\",\"warehouseId\":\"$WH\",\"items\":[{\"productId\":\"cons-p1\",\"quantity\":1}]}")" "400"
# ⚠️ امانیِ داده‌شده به تأمین‌کننده، داده‌ی به‌هم‌ریخته است.
chk "OUT بدونِ مشتری رد می‌شود" \
  "$(CODE /consignments "{\"direction\":\"OUT\",\"supplierId\":\"cons-s1\",\"warehouseId\":\"$WH\",\"items\":[{\"productId\":\"cons-p1\",\"quantity\":1}]}")" "400"
chk "IN بدونِ تأمین‌کننده رد می‌شود" \
  "$(CODE /consignments '{"direction":"IN","customerId":"cons-c1","items":[{"productId":"cons-p1","quantity":1}]}')" "400"
chk "بدونِ قلم رد می‌شود" \
  "$(CODE /consignments "{\"direction\":\"OUT\",\"customerId\":\"cons-c1\",\"warehouseId\":\"$WH\",\"items\":[]}")" "400"
chk "بیش از موجودی رد می‌شود" \
  "$(CODE /consignments "{\"direction\":\"OUT\",\"customerId\":\"cons-c1\",\"warehouseId\":\"$WH\",\"items\":[{\"productId\":\"cons-p1\",\"quantity\":9999}]}")" "400"
chk "و موجودی دست‌نخورده ماند" \
  "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE id='cons-inv'")" "75"

# ---------------------------------------------------------------- امانیِ گرفته‌شده
sec "۶) امانیِ گرفته‌شده — دارایی ما نیست"
BEFORE_ROWS=$(Q "SELECT count(*) FROM \"Inventory\" WHERE \"productId\"='cons-p1'")
R=$(POST /consignments '{"direction":"IN","supplierId":"cons-s1",
     "items":[{"productId":"cons-p1","quantity":50,"unitPrice":9000}]}')
IN_ID=$(J "d.get('id','')")
chk "سند گرفته‌شده ساخته شد" "$([ -n "$IN_ID" ] && echo yes || echo no)" "yes"
chk "شمارهٔ سندِ IN"          "$(J "d.get('docNo')")" "AMI-00001"

# ⚠️ دو سنجهٔ قرینه: نه موجودی، نه سند.
chk "به موجودی اضافه نشد" \
  "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE id='cons-inv'")" "75"
chk "سطر موجودیِ تازه‌ای نساخت" \
  "$(Q "SELECT count(*) FROM \"Inventory\" WHERE \"productId\"='cons-p1'")" "$BEFORE_ROWS"
chk "هیچ سندی نخورد" \
  "$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE \"sourceType\"='ConsignmentIn'")" "0"

# تسویهٔ IN بدهی می‌سازد، نه درآمد.
IN_ITEM=$(Q "SELECT id FROM \"ConsignmentItem\" WHERE \"consignmentId\"='$IN_ID'")
R=$(POST "/consignments/items/$IN_ITEM/settle" '{"quantity":20}')
chk "تسویهٔ IN ثبت شد" "$(J "d.get('kind')")" "SETTLE"
chk "بدهی به مالک (۲۱۰۱) بستانکار شد (۲۰ × ۹٬۰۰۰)" \
  "$(Q "SELECT COALESCE(sum(l.credit),0)::int FROM \"JournalLine\" l
          JOIN \"Account\" a ON a.id=l.\"accountId\"
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE a.code='2101' AND e.\"sourceType\"='ConsignmentInSettle'")" "180000"

# ---------------------------------------------------------------- گزارش
sec "۷) گزارشِ باز"
R=$(curl -s "${A[@]}" "$API/consignments/report/open")
chk "امانیِ داده‌شده در گزارش هست" "$(J "len(d['out'])")" "1"
chk "ماندهٔ داده‌شده ۱۵"            "$(J "int(d['out'][0]['openQty'])")" "15"
# ⚠️ این تنها جایی است که امانیِ گرفته‌شده دیده می‌شود؛ در انبار نیست.
chk "امانیِ گرفته‌شده در گزارش هست" "$(J "len(d['in'])")" "1"
chk "ماندهٔ گرفته‌شده ۳۰"           "$(J "int(d['in'][0]['openQty'])")" "30"
chk "ارزشِ کالای ما نزد دیگران"     "$(J "int(d['outValue'])")" "150000"

# ---------------------------------------------------------------- تراز
sec "۸) دفتر کل تراز است"
chk "همهٔ اسنادِ امانی تراز" \
  "$(Q "SELECT COALESCE(sum(l.debit)-sum(l.credit),0)::int FROM \"JournalLine\" l
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE e.\"sourceType\" LIKE 'Consignment%'")" "0"
# ⚠️ و ماندهٔ ۱۱۰۸ باید با کالای واقعاً بیرون بخواند: ۱۵ × ۱۰٬۰۰۰
chk "ماندهٔ ۱۱۰۸ با گزارش می‌خواند" \
  "$(Q "SELECT COALESCE(sum(l.debit)-sum(l.credit),0)::int FROM \"JournalLine\" l
          JOIN \"Account\" a ON a.id=l.\"accountId\"
          JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
         WHERE a.code='1108' AND e.\"sourceType\" LIKE 'Consignment%'")" "150000"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
