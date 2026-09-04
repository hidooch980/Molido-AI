#!/usr/bin/env bash
#
# فروشِ کالای امانیِ گرفته‌شده از صندوق.
#
# ⚠️ تا امروز ممکن نبود، و در `consignment.service.ts` صریح نوشته شده
#    بود: امانیِ گرفته‌شده به `Inventory` اضافه نمی‌شود (چون مالِ ما
#    نیست و نباید در ترازنامه بنشیند)، پس صندوق «موجود نیست» می‌دید.
#
# ---------- گران‌بهاترین سنجهٔ این پرونده ----------
#
# ⚠️ **بهای تمام‌شده نباید دو بار بخورد.**
#
#    وسوسه این بود که سطرِ امانی مثل هر سطرِ دیگر در `SaleCogs` بیاید.
#    آن‌وقت هم `SaleCogs` بهایش را می‌زد و هم `ConsignmentInSettle` —
#    یعنی سودِ ناخالص به‌اندازهٔ کلِ فروشِ امانی کم گزارش می‌شد.
#
#    و بستانکارش هم غلط بود: `SaleCogs` موجودی کالا را بستانکار می‌کند،
#    در حالی که ما آن موجودی را هرگز نداشتیم.
#
#    هیچ‌کدام خطا نمی‌داد.  ترازنامه تراز می‌ماند و عدد فقط **غلط**
#    می‌شد.

set -u
cd "$(dirname "$0")/.."

export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

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
[ -n "$TOKEN" ] || { echo "  x ورود نشد"; exit 1; }
A=(-H "Authorization: Bearer $TOKEN")
J=(-H 'Content-Type: application/json')

CO=seed-company
WH=seed-warehouse
# ⚠️ کالای **اختصاصی**، نه کالای seed.
#    یک بار دستکاریِ `seed-p3` شش سنجهٔ `e2e-cycles` را قرمز کرد.
SKU=cpos-p1
SUP=cpos-sup1

cleanup() {
  # ⚠️ هر دستور **جدا** اجرا می‌شود، نه همه در یک `psql -c`.
  #
  #    `psql -c "a; b; c"` هر سه را در یک تراکنشِ ضمنی می‌گذارد: اگر
  #    `a` بشکند، `b` و `c` هم لغو می‌شوند — بی‌آنکه چیزی در خروجی
  #    دیده شود چون `Q` را به /dev/null می‌فرستیم.
  #
  #    نتیجه‌اش این بود که ردیفِ امانیِ اجرای قبلی می‌ماند، اجرای بعدی
  #    `INSERT`ش با نقضِ یکتاییِ docNo می‌شکست، و آزمون روی ردیفِ کهنه
  #    کار می‌کرد — با شناسه‌ای که هیچ‌جا نمی‌خواند.  دو ساعت شبیهِ
  #    اشکالِ کدِ فروش به نظر می‌رسید.
  local sale_ids='(SELECT id FROM "Sale" WHERE note='"'"'cpos'"'"')'
  local ret_ids='(SELECT id FROM "ProductReturn" WHERE "saleId" IN '"$sale_ids"')'

  Q "DELETE FROM \"JournalLine\" WHERE \"entryId\" IN
       (SELECT id FROM \"JournalEntry\" WHERE \"sourceId\" IN $sale_ids
                                             OR \"sourceId\" IN $ret_ids)" >/dev/null
  Q "DELETE FROM \"JournalEntry\" WHERE \"sourceId\" IN $sale_ids
                                      OR \"sourceId\" IN $ret_ids" >/dev/null
  Q "DELETE FROM \"ProductReturnItem\" WHERE \"returnId\" IN $ret_ids" >/dev/null
  Q "DELETE FROM \"ProductReturn\" WHERE \"saleId\" IN $sale_ids" >/dev/null
  Q "DELETE FROM \"Payment\" WHERE \"saleId\" IN $sale_ids" >/dev/null
  Q "DELETE FROM \"SaleItem\" WHERE \"saleId\" IN $sale_ids" >/dev/null
  Q "DELETE FROM \"SaleItem\" WHERE \"productId\"='$SKU'" >/dev/null
  Q "DELETE FROM \"Sale\" WHERE note='cpos'" >/dev/null
  Q "DELETE FROM \"ConsignmentItem\" WHERE \"productId\"='$SKU'" >/dev/null
  Q "DELETE FROM \"Consignment\" WHERE \"docNo\" LIKE 'CPOS-%'" >/dev/null
  Q "DELETE FROM \"InventoryMovement\" WHERE \"productId\"='$SKU'" >/dev/null
  Q "DELETE FROM \"Inventory\" WHERE \"productId\"='$SKU'" >/dev/null
  Q "DELETE FROM \"Product\" WHERE id='$SKU'" >/dev/null
  Q "DELETE FROM \"Supplier\" WHERE id='$SUP'" >/dev/null
}
trap cleanup EXIT
cleanup

# ─────────────────── آماده‌سازی ───────────────────
# ⚠️ `unit` ستونِ NOT NULL است — یک بار جا افتادنش ۱۲ سنجه را یک‌جا
#    قرمز کرد، با پیام‌هایی که به ستون اشاره نمی‌کردند.
#
# ⚠️ `purchasePrice` عمداً **ناصفر** است (۱۲۰۰۰)، و این بی‌اهمیت نیست.
#
#    نسخهٔ اول صفر گذاشت و آزمون **بی‌اثر** شد: با شکستِ عمدیِ «سطرِ
#    امانی را در SaleCogs هم بیاور»، `unitCostOf` به `purchasePrice`
#    عقب می‌گشت، بهای دوباره صفر می‌شد، و `postAuto` سندِ خالی نمی‌سازد
#    — پس سنجه سبز می‌ماند در حالی که اشکال سرِ جایش بود.
#
#    عددِ ناصفر یعنی بهای دوباره ۴۸۰۰۰ می‌شود و دیده می‌شود.  و کالایی
#    که هم خریدِ عادی داشته و هم امانی گرفته شده، حالتِ واقعی‌تری هم
#    هست.
Q "INSERT INTO \"Supplier\" (id,\"companyId\",name,\"createdAt\",\"updatedAt\")
   VALUES ('$SUP','$CO','مالکِ امانی cpos',now(),now());
   INSERT INTO \"Product\" (id,\"companyId\",name,sku,unit,\"salePrice\",\"purchasePrice\",
                            status,\"trackInventory\",\"createdAt\",\"updatedAt\")
   VALUES ('$SKU','$CO','کالای امانی cpos','$SKU','عدد',30000,12000,'ACTIVE',true,now(),now());" >/dev/null

# ⚠️ ساختِ فیکسچر **همین‌جا** سنجیده می‌شود.
#
#    `Q` خطای psql را فقط به رشته می‌دهد و دور می‌ریزد.  نسخهٔ اول این
#    فایل ستونِ `price` نوشت (نامش `salePrice` است)، `INSERT` بی‌صدا
#    شکست، و سنجهٔ بعدی «برخی کالاها یافت نشدند» داد — پیامی که به
#    ستونِ اشتباه هیچ اشاره‌ای ندارد و دنبالِ اشکال در کدِ فروش
#    می‌فرستد.
if [ "$(Q "SELECT count(*)::int FROM \"Product\" WHERE id='$SKU'")" != "1" ]; then
  echo "  x فیکسچرِ کالا ساخته نشد — ادامه بی‌معناست"
  Q "INSERT INTO \"Product\" (id,\"companyId\",name,sku,unit,\"salePrice\",\"purchasePrice\",
                               status,\"trackInventory\",\"createdAt\",\"updatedAt\")
     VALUES ('$SKU','$CO','x','$SKU','عدد',1,0,'ACTIVE',true,now(),now())" | head -3
  exit 1
fi

CID=$(Q "SELECT gen_random_uuid()::text")
IID=$(Q "SELECT gen_random_uuid()::text")
# ۱۰ عدد امانی، هر کدام با بدهیِ ۲۰۰۰۰ به مالک.
Q "INSERT INTO \"Consignment\" (id,\"companyId\",direction,\"docNo\",\"supplierId\",
                                status,\"createdAt\",\"updatedAt\")
   VALUES ('$CID','$CO','IN','CPOS-1','$SUP','OPEN',now(),now());
   INSERT INTO \"ConsignmentItem\" (id,\"companyId\",\"consignmentId\",\"productId\",
                                    quantity,\"unitPrice\",\"createdAt\",\"updatedAt\")
   VALUES ('$IID','$CO','$CID','$SKU',10,20000,now(),now());" >/dev/null

# ⚠️ و همان سنجه برای امانی: اگر ردیفِ اجرای قبلی مانده باشد، `INSERT`
#    با نقضِ یکتاییِ docNo می‌شکند و آزمون روی ردیفِ کهنه کار می‌کند.
if [ "$(Q "SELECT count(*)::int FROM \"ConsignmentItem\" WHERE id='$IID'")" != "1" ]; then
  echo "  x فیکسچرِ امانی ساخته نشد — احتمالاً مانده‌ای از اجرای قبلی هست"
  Q "SELECT ci.id, c.\"docNo\" FROM \"ConsignmentItem\" ci
       JOIN \"Consignment\" c ON c.id=ci.\"consignmentId\"
      WHERE ci.\"productId\"='$SKU'"
  exit 1
fi

sec "۱) امانیِ گرفته‌شده در انبار نیست"
# ⚠️ سنجهٔ قرینه: اگر روزی کسی «برای راحتی» امانی را به `Inventory`
#    اضافه کند، ترازنامه با دارایی‌ای که مالِ ما نیست باد می‌کند.
chk "موجودیِ انبار صفر است" \
  "$(Q "SELECT COALESCE(sum(quantity),0)::int FROM \"Inventory\" WHERE \"productId\"='$SKU'")" "0"

sec "۲) فروش از صندوق کار می‌کند"
SALE=$(curl -s "${A[@]}" "${J[@]}" -X POST "$API/sales" -d "{
  \"warehouseId\":\"$WH\",\"note\":\"cpos\",
  \"items\":[{\"productId\":\"$SKU\",\"quantity\":4,\"price\":30000}],
  \"payments\":[{\"method\":\"CASH\",\"amount\":120000}]}")
SID=$(echo "$SALE" | P "import sys,json;print(json.load(sys.stdin).get('id',''))")
if [ -z "$SID" ]; then
  echo "  FAIL فروش ثبت نشد: $(echo "$SALE" | head -c 250)"
  FAIL=$((FAIL+1))
  printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"; exit 1
fi
chk "فاکتور ثبت شد" "yes" "yes"

chk "سطر به سندِ امانی گره خورد" \
  "$(Q "SELECT (\"consignmentItemId\"='$IID')::text FROM \"SaleItem\" WHERE \"saleId\"='$SID'")" "true"
# ⚠️ بها **بدهی به مالک** است (۲۰۰۰۰)، نه میانگینِ موجودی (که وجود ندارد)
#    و نه `purchasePrice` (که صفر است).
chk "بهای سطر = بدهی به مالک" \
  "$(Q "SELECT \"unitCost\"::int FROM \"SaleItem\" WHERE \"saleId\"='$SID'")" "20000"
chk "۴ عدد تسویه شد" \
  "$(Q "SELECT \"settledQty\"::int FROM \"ConsignmentItem\" WHERE id='$IID'")" "4"

sec "۳) موجودیِ انبار دست‌نخورده ماند"
# ⚠️ اگر `applyStockDelta` صدا زده شده بود، این منفی می‌شد.
chk "هنوز صفر یا نبود" \
  "$(Q "SELECT COALESCE(sum(quantity),0)::int FROM \"Inventory\" WHERE \"productId\"='$SKU'")" "0"

sec "۴) بهای تمام‌شده **یک بار** خورد"
# ⚠️ اصلِ ماجرا.  ۴ × ۲۰۰۰۰ = ۸۰۰۰۰ — نه ۱۶۰۰۰۰، و نه صفر.
chk "SaleCogs برای این فاکتور نیست" \
  "$(Q "SELECT count(*)::int FROM \"JournalEntry\"
          WHERE \"sourceType\"='SaleCogs' AND \"sourceId\"='$SID'")" "0"
chk "سندِ امانی خورد" \
  "$(Q "SELECT count(*)::int FROM \"JournalEntry\"
          WHERE \"sourceType\"='ConsignmentInSettle' AND \"sourceId\"='$SID'")" "1"
chk "بهای تمام‌شده ۸۰۰۰۰" \
  "$(Q "SELECT COALESCE(sum(jl.debit),0)::int FROM \"JournalLine\" jl
          JOIN \"JournalEntry\" je ON je.id=jl.\"entryId\"
          JOIN \"Account\" a ON a.id=jl.\"accountId\"
         WHERE je.\"sourceId\"='$SID' AND je.\"sourceType\"='ConsignmentInSettle'
           AND a.code='5101'")" "80000"
chk "بدهی به مالک ۸۰۰۰۰" \
  "$(Q "SELECT COALESCE(sum(jl.credit),0)::int FROM \"JournalLine\" jl
          JOIN \"JournalEntry\" je ON je.id=jl.\"entryId\"
          JOIN \"Account\" a ON a.id=jl.\"accountId\"
         WHERE je.\"sourceId\"='$SID' AND je.\"sourceType\"='ConsignmentInSettle'
           AND a.code='2101'")" "80000"

sec "۵) بیش از امانیِ موجود فروخته نمی‌شود"
# ۶ عدد مانده؛ ۷ باید رد شود.
OVER=$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "${J[@]}" -X POST "$API/sales" -d "{
  \"warehouseId\":\"$WH\",\"note\":\"cpos\",
  \"items\":[{\"productId\":\"$SKU\",\"quantity\":7,\"price\":30000}],
  \"payments\":[{\"method\":\"CASH\",\"amount\":210000}]}")
chk "فروشِ بیش از موجودی رد شد" "$OVER" "400"
chk "و چیزی تسویه نشد" \
  "$(Q "SELECT \"settledQty\"::int FROM \"ConsignmentItem\" WHERE id='$IID'")" "4"

# ─────────────────── مرجوعی ───────────────────
sec "۶) مرجوعی: دفتر کل دقیقاً خنثی می‌شود"
# ⚠️ تنها سنجه‌ای که نشتِ دائمی را می‌گیرد.
#
#    اگر مرجوعی قلمِ امانی را به `Inventory` برگرداند، موجودی‌ای ساخته
#    می‌شود که وجود ندارد.  اگر بدهی به مالک را کم نکند، تا ابد بدهکار
#    می‌مانیم بابت کالایی که پس داده‌ایم.
ITEMID=$(Q "SELECT id FROM \"SaleItem\" WHERE \"saleId\"='$SID'")
RET=$(curl -s "${A[@]}" "${J[@]}" -X POST "$API/returns/sale" -d "{
  \"saleId\":\"$SID\",\"refundMethod\":\"CASH\",\"cashBoxId\":\"seed-cashbox\",
  \"items\":[{\"sourceItemId\":\"$ITEMID\",\"qty\":4}]}")
RID=$(echo "$RET" | P "import sys,json;print(json.load(sys.stdin).get('id',''))")
chk "مرجوعی ثبت شد" "$([ -n "$RID" ] && echo yes || echo "no: $(echo "$RET" | head -c 150)")" "yes"

chk "تسویه آزاد شد" \
  "$(Q "SELECT \"settledQty\"::int FROM \"ConsignmentItem\" WHERE id='$IID'")" "0"
chk "به انبار برنگشت" \
  "$(Q "SELECT COALESCE(sum(quantity),0)::int FROM \"Inventory\" WHERE \"productId\"='$SKU'")" "0"
chk "SalesReturnCogs نخورد" \
  "$(Q "SELECT count(*)::int FROM \"JournalEntry\"
          WHERE \"sourceType\"='SalesReturnCogs' AND \"sourceId\"='$RID'")" "0"

# ⚠️ خالصِ بهای تمام‌شده و بدهی، هر دو باید **صفر** شوند.
chk "خالصِ بهای تمام‌شده صفر شد" \
  "$(Q "SELECT COALESCE(sum(jl.debit-jl.credit),0)::int FROM \"JournalLine\" jl
          JOIN \"JournalEntry\" je ON je.id=jl.\"entryId\"
          JOIN \"Account\" a ON a.id=jl.\"accountId\"
         WHERE je.\"sourceType\" IN ('ConsignmentInSettle','ConsignmentInReturn')
           AND je.\"sourceId\" IN ('$SID','$RID') AND a.code='5101'")" "0"
chk "خالصِ بدهی به مالک صفر شد" \
  "$(Q "SELECT COALESCE(sum(jl.credit-jl.debit),0)::int FROM \"JournalLine\" jl
          JOIN \"JournalEntry\" je ON je.id=jl.\"entryId\"
          JOIN \"Account\" a ON a.id=jl.\"accountId\"
         WHERE je.\"sourceType\" IN ('ConsignmentInSettle','ConsignmentInReturn')
           AND je.\"sourceId\" IN ('$SID','$RID') AND a.code='2101'")" "0"

sec "۷) هر سندِ تازه تراز است"
chk "سندِ نامتراز نیست" \
  "$(Q "SELECT count(*)::int FROM (
          SELECT \"entryId\" FROM \"JournalLine\"
           GROUP BY \"entryId\" HAVING abs(sum(debit)-sum(credit)) > 0.005) x")" "0"

# ─────────────────── موجودیِ خودی دست‌نخورده ───────────────────
sec "۸) کالای عادی هنوز از انبار می‌رود"
# ⚠️ سنجهٔ قرینه: تغییرِ مسیرِ فروش نباید مسیرِ عادی را عوض کند.
BEFORE=$(Q "SELECT quantity::int FROM \"Inventory\" WHERE \"productId\"='seed-p1' AND \"warehouseId\"='$WH'")
S2=$(curl -s "${A[@]}" "${J[@]}" -X POST "$API/sales" -d "{
  \"warehouseId\":\"$WH\",\"note\":\"cpos\",
  \"items\":[{\"productId\":\"seed-p1\",\"quantity\":1}],
  \"payments\":[{\"method\":\"CASH\",\"amount\":1}]}")
S2ID=$(echo "$S2" | P "import sys,json;print(json.load(sys.stdin).get('id',''))")
AFTER=$(Q "SELECT quantity::int FROM \"Inventory\" WHERE \"productId\"='seed-p1' AND \"warehouseId\"='$WH'")
chk "از انبار کم شد" "$([ -n "$S2ID" ] && echo $((BEFORE - AFTER)) || echo x)" "1"
chk "و SaleCogs خورد" \
  "$(Q "SELECT count(*)::int FROM \"JournalEntry\"
          WHERE \"sourceType\"='SaleCogs' AND \"sourceId\"='$S2ID'")" "1"
# ⚠️ نظافت: این فاکتور موجودیِ seed را کم کرد و باید برگردد، وگرنه
#    مجموعه‌های بعدی با موجودیِ کمتر شروع می‌کنند.
curl -s -o /dev/null "${A[@]}" "${J[@]}" -X PATCH "$API/sales/$S2ID/cancel" -d '{}'
chk "فاکتورِ سنجه باطل و موجودی برگشت" \
  "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE \"productId\"='seed-p1' AND \"warehouseId\"='$WH'")" "$BEFORE"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
