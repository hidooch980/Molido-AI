#!/usr/bin/env bash
#
# صورت وضعیت مشتری — گردش حساب با ماندهٔ جاری.
#
# ⚠️ سنجهٔ اصلی: **ماندهٔ اول دوره**.
#
#    بدونِ آن، صورت وضعیتِ یک بازه از صفر شروع می‌شود و ماندهٔ پایانش با
#    واقعیت نمی‌خواند — همان اشکالی که در ترازِ آزمایشیِ سالِ نو داشتیم.
#    این آزمون عمداً بازه‌ای می‌گیرد که رویدادِ پیش از خودش دارد.

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
A=(-H "Authorization: Bearer $TOKEN")

CO=seed-company
WH=$(Q "SELECT id FROM \"Warehouse\" WHERE \"companyId\"='$CO' LIMIT 1")
US=$(Q "SELECT id FROM \"User\" WHERE \"companyId\"='$CO' LIMIT 1")

cleanup() {
  Q "DELETE FROM \"Payment\"       WHERE id LIKE 'st-%';
     DELETE FROM \"ProductReturn\" WHERE id LIKE 'st-%';
     DELETE FROM \"Sale\"          WHERE id LIKE 'st-%';
     DELETE FROM \"Customer\"      WHERE id LIKE 'st-%';" >/dev/null
}
trap cleanup EXIT
cleanup

# ---------------------------------------------------------------- فیکسچر
#
#   ۱۴۰۵/۰۱/۱۰  فاکتور   ۱٬۰۰۰٬۰۰۰  بدهکار   ← پیش از بازه
#   ۱۴۰۵/۰۱/۱۵  پرداخت     ۴۰۰٬۰۰۰  بستانکار ← پیش از بازه
#   ────────────────────────────────── ماندهٔ اول دوره = ۶۰۰٬۰۰۰
#   ۱۴۰۵/۰۳/۰۱  فاکتور   ۲٬۰۰۰٬۰۰۰  بدهکار
#   ۱۴۰۵/۰۳/۰۵  مرجوعی     ۵۰۰٬۰۰۰  بستانکار
#   ۱۴۰۵/۰۳/۱۰  پرداخت     ۳۰۰٬۰۰۰  بستانکار
#   ────────────────────────────────── ماندهٔ پایان = ۱٬۸۰۰٬۰۰۰
sec "۰) ساخت داده"
Q "INSERT INTO \"Customer\" (id,\"companyId\",\"firstName\",\"lastName\")
     VALUES ('st-c1','$CO','مشتری','صورت‌وضعیت');" >/dev/null

mk() { # id، شماره، تاریخ، مبلغ، وضعیت
  Q "INSERT INTO \"Sale\" (id,\"companyId\",\"customerId\",\"userId\",\"warehouseId\",
                           \"invoiceNo\",status,subtotal,discount,tax,total,\"createdAt\")
     VALUES ('$1','$CO','st-c1','$US','$WH','$2','$5',$4,0,0,$4,'$3')" >/dev/null
}
mk st-s1 INV-ST1 '2026-03-30T09:00:00Z' 1000000 PENDING
mk st-s2 INV-ST2 '2026-05-22T09:00:00Z' 2000000 PENDING
# فاکتورِ باطل — نباید در گردش بیاید.
mk st-s3 INV-ST3 '2026-05-23T09:00:00Z' 9000000 CANCELLED

Q "INSERT INTO \"Payment\" (id,\"saleId\",amount,method,status,\"referenceNo\",\"createdAt\")
   VALUES ('st-p1','st-s1',400000,'CASH','COMPLETED','PAY-1','2026-04-04T09:00:00Z'),
          ('st-p2','st-s2',300000,'CASH','COMPLETED','PAY-2','2026-05-31T09:00:00Z');" >/dev/null

Q "INSERT INTO \"ProductReturn\" (id,\"companyId\",\"returnNo\",type,\"saleId\",\"customerId\",
                                  status,\"totalAmount\",\"createdAt\")
   VALUES ('st-r1','$CO','RT-ST1','SALE','st-s2','st-c1','APPLIED',500000,'2026-05-26T09:00:00Z'),
          ('st-r2','$CO','RT-ST2','SALE','st-s2','st-c1','PENDING',777000,'2026-05-27T09:00:00Z');" >/dev/null
echo "  داده ساخته شد"

# ---------------------------------------------------------------- کلِ گردش
sec "۱) بدونِ بازه — همهٔ گردش"
R=$(curl -s "${A[@]}" "$API/customers/st-c1/statement")
J() { echo "$R" | P "import sys,json;d=json.load(sys.stdin);print($1)"; }

# دو فاکتور + دو پرداخت + یک مرجوعی = ۵.
# (نسخهٔ اول ۴ نوشته بود؛ جمع‌های پایین‌تر — ۳٬۰۰۰٬۰۰۰ بدهکار و
#  ۱٬۲۰۰٬۰۰۰ بستانکار — نشان دادند انتظار غلط بود، نه کد.)
chk "پنج رویداد"  "$(J "len(d['lines'])")" "5"
chk "فاکتورِ باطل نیامده" \
  "$(J "'INV-ST3' in [l['docNo'] for l in d['lines']]")" "False"
# ⚠️ مرجوعیِ در انتظار هنوز اتفاق نیفتاده؛ نباید مانده را کم کند.
chk "مرجوعیِ در انتظار نیامده" \
  "$(J "'RT-ST2' in [l['docNo'] for l in d['lines']]")" "False"
chk "ماندهٔ نهایی"  "$(J "int(d['totals']['closingBalance'])")" "1800000"
chk "جمع بدهکار"   "$(J "int(d['totals']['debit'])")"           "3000000"
chk "جمع بستانکار" "$(J "int(d['totals']['credit'])")"          "1200000"

# ---------------------------------------------------------------- ترتیب
sec "۲) ترتیب و ماندهٔ جاری"
chk "اولین سطر فاکتور است"   "$(J "d['lines'][0]['type']")"  "INVOICE"
chk "ماندهٔ سطر اول"          "$(J "int(d['lines'][0]['balance'])")" "1000000"
chk "ماندهٔ سطر دوم"          "$(J "int(d['lines'][1]['balance'])")" "600000"
chk "ماندهٔ جاری آخرِ سطرها با جمعِ کل یکی است" \
  "$(J "int(d['lines'][-1]['balance']) == int(d['totals']['closingBalance'])")" "True"
chk "تاریخ شمسی همراه سطر"   "$(J "d['lines'][0]['atJalali']")" "1405/01/10"

# ---------------------------------------------------------------- اول دوره
sec "۳) ماندهٔ اول دوره"
R=$(curl -s "${A[@]}" "$API/customers/st-c1/statement?from=2026-05-01")
# ⚠️ همان دو رویدادِ پیش از بازه باید در ماندهٔ اول دوره جمع شده باشند،
#    نه اینکه از قلم بیفتند.
chk "ماندهٔ اول دوره ۶۰۰ هزار است" "$(J "int(d['openingBalance'])")" "600000"
chk "سه رویداد در بازه"             "$(J "len(d['lines'])")"          "3"
chk "ماندهٔ پایان همان ۱٬۸۰۰٬۰۰۰ می‌ماند" \
  "$(J "int(d['totals']['closingBalance'])")" "1800000"
chk "سطر اولِ بازه از ماندهٔ اول دوره ادامه می‌دهد" \
  "$(J "int(d['lines'][0]['balance'])")" "2600000"

# ---------------------------------------------------------------- بازهٔ بسته
sec "۴) بازهٔ دوسر"
R=$(curl -s "${A[@]}" "$API/customers/st-c1/statement?from=2026-05-01&to=2026-05-27")
chk "پرداختِ ۳۱ اردیبهشت بیرون است" \
  "$(J "'PAY-2' in [l['docNo'] for l in d['lines']]")" "False"
chk "دو رویداد در بازهٔ بسته" "$(J "len(d['lines'])")" "2"

# ---------------------------------------------------------------- خالی
sec "۵) مشتریِ بی‌گردش"
Q "INSERT INTO \"Customer\" (id,\"companyId\",\"firstName\") VALUES ('st-c2','$CO','بی‌گردش')" >/dev/null
R=$(curl -s "${A[@]}" "$API/customers/st-c2/statement")
chk "خطا نمی‌دهد"        "$(J "len(d['lines'])")"                    "0"
chk "ماندهٔ صفر"          "$(J "int(d['totals']['closingBalance'])")" "0"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
