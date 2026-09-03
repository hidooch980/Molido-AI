#!/usr/bin/env bash
#
# گزارش فصلی خرید و فروش — ماده ۱۶۹ مکرر.
#
# ⚠️ داده مستقیم در پایگاه ساخته می‌شود، نه از راهِ API.
#
#    گزارش باید فاکتورِ **دقیقاً روی مرزِ فصل** را درست دسته‌بندی کند.
#    از راهِ API نمی‌شود `createdAt` را کنترل کرد، و بدونِ کنترلِ آن،
#    اصلی‌ترین سنجهٔ این گزارش اصلاً اجرا نمی‌شود.
#
# ⚠️ همهٔ داده با پیشوندِ `seas-` ساخته و در پایان پاک می‌شود.  یک بار
#    دستکاریِ کالای seed شش سنجهٔ e2e-cycles را قرمز کرد.

set -u
cd "$(dirname "$0")/.."

API=http://localhost:3000
CF="-f ../docker-compose.yml -f ../docker-compose.store.yml"
PASS=0; FAIL=0

chk() { # نام، گرفته، انتظار
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf '  OK   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi
}
sec() { printf -- '--- %s ---\n' "$*"; }

Q() { docker compose $CF exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>&1 | tr -d '\r'; }
P() { python -c "$1" 2>/dev/null; }

# ---------------------------------------------------------------- ورود
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
  Q "DELETE FROM \"ProductReturn\" WHERE id LIKE 'seas-%';
     DELETE FROM \"Sale\"     WHERE id LIKE 'seas-%';
     DELETE FROM \"Purchase\" WHERE id LIKE 'seas-%';
     DELETE FROM \"Customer\" WHERE id LIKE 'seas-%';
     DELETE FROM \"Supplier\" WHERE id LIKE 'seas-%';" >/dev/null
}
trap cleanup EXIT
cleanup

# ---------------------------------------------------------------- فیکسچر
#
# بهارِ ۱۴۰۵ = ۲۰۲۶-۰۳-۲۱ تا ۲۰۲۶-۰۶-۲۱ (به وقتِ تهران).
#
# ⚠️ سه فاکتور عمداً روی لبه‌ها نشسته‌اند:
#      ۲۰۲۶-۰۶-۲۱T۱۸:۰۰Z  = ۳۱ خرداد ۲۱:۳۰ تهران  ← بهار
#      ۲۰۲۶-۰۶-۲۱T۲۱:۰۰Z  = ۱ تیر ۰۰:۳۰ تهران     ← تابستان
#    اگر گزارش با UTC کار کند، هر دو در بهار می‌افتند و این دو سنجه
#    قرمز می‌شوند.  همان اشکالی که با UTC هیچ‌وقت دیده نمی‌شد.
sec "۰) ساخت داده"
Q "INSERT INTO \"Customer\" (id,\"companyId\",\"firstName\",\"lastName\",\"nationalCode\",\"personType\")
     VALUES ('seas-c1','$CO','رضا','شناسه‌دار','1234567890','REAL');
   INSERT INTO \"Customer\" (id,\"companyId\",\"firstName\")
     VALUES ('seas-c2','$CO','مشتریِ بی‌شناسه');
   INSERT INTO \"Supplier\" (id,\"companyId\",name,\"nationalCode\",\"personType\")
     VALUES ('seas-s1','$CO','تأمین‌کنندهٔ شناسه‌دار','12345678901','LEGAL');
   INSERT INTO \"Supplier\" (id,\"companyId\",name)
     VALUES ('seas-s2','$CO','تأمین‌کنندهٔ بی‌شناسه');" >/dev/null

mk_sale() { # id، مشتری (یا NULL)، وضعیت، تاریخ، مبلغ
  local cust="$2"; [ "$cust" = "NULL" ] || cust="'$cust'"
  Q "INSERT INTO \"Sale\" (id,\"companyId\",\"customerId\",\"userId\",\"warehouseId\",
                           \"invoiceNo\",status,subtotal,discount,tax,total,\"createdAt\")
     VALUES ('$1','$CO',$cust,'$US','$WH','INV-$1','$3',$5,0,0,$5,'$4')" >/dev/null
}

mk_sale seas-sp1 seas-c1 PAID    '2026-04-15T09:00:00Z' 1000000
mk_sale seas-sp2 seas-c1 PENDING '2026-05-20T09:00:00Z' 2000000
mk_sale seas-edge-in  seas-c1 PAID '2026-06-21T18:00:00Z' 500000
mk_sale seas-edge-out seas-c1 PAID '2026-06-21T21:00:00Z' 700000
mk_sale seas-cancel   seas-c1 CANCELLED '2026-04-16T09:00:00Z' 9000000
mk_sale seas-retail1  NULL    PAID '2026-04-17T09:00:00Z' 50000
mk_sale seas-retail2  seas-c2 PAID '2026-04-18T09:00:00Z' 70000

Q "INSERT INTO \"Purchase\" (id,\"companyId\",\"supplierId\",\"warehouseId\",\"purchaseNo\",
                             status,subtotal,discount,tax,total,\"createdAt\")
   VALUES ('seas-p1','$CO','seas-s1','$WH','PO-1','RECEIVED',3000000,0,0,3000000,'2026-04-20T09:00:00Z'),
          ('seas-p2','$CO','seas-s2','$WH','PO-2','RECEIVED',400000,0,0,400000,'2026-04-21T09:00:00Z');" >/dev/null

# WARN `type` و `status` از قیدهای واقعیِ جدول گرفته شده‌اند، نه حدس:
#      type ∈ (SALE, PURCHASE) و status ∈ (PENDING, APPLIED, CANCELLED).
#      نسخهٔ اول 'COMPLETED' نوشت و درج بی‌صدا شکست خورد.
Q "INSERT INTO \"ProductReturn\" (id,\"companyId\",\"returnNo\",type,\"saleId\",\"customerId\",
                                  status,\"totalAmount\",\"createdAt\")
   VALUES ('seas-r1','$CO','RT-1','SALE','seas-sp1','seas-c1','APPLIED',100000,'2026-04-25T09:00:00Z');
   INSERT INTO \"ProductReturn\" (id,\"companyId\",\"returnNo\",type,\"purchaseId\",\"supplierId\",
                                  status,\"totalAmount\",\"createdAt\")
   VALUES ('seas-r2','$CO','RT-2','PURCHASE','seas-p1','seas-s1','APPLIED',200000,'2026-04-26T09:00:00Z');
   INSERT INTO \"ProductReturn\" (id,\"companyId\",\"returnNo\",type,\"saleId\",\"customerId\",
                                  status,\"totalAmount\",\"createdAt\")
   VALUES ('seas-r3','$CO','RT-3','SALE','seas-sp1','seas-c1','PENDING',999000,'2026-04-27T09:00:00Z');" >/dev/null
echo "  داده ساخته شد"

R=$(curl -s "${A[@]}" "$API/tax/seasonal/1405/1")
J() { echo "$R" | P "import sys,json;d=json.load(sys.stdin);print($1)"; }

# ---------------------------------------------------------------- بازه
sec "۱) بازهٔ فصل"
chk "نامِ فصل"        "$(J "d['period']['name']")"       "بهار"
chk "آغازِ بهار"      "$(J "d['period']['fromJalali']")" "1405/01/01"
chk "پایانِ بهار"     "$(J "d['period']['toJalali']")"   "1405/03/31"
# ⚠️ نیمه‌شبِ تهران است نه UTC — تفاوتشان ۳ ساعت و نیم.
chk "آغاز به وقت تهران" "$(J "d['period']['fromUtc']")"  "2026-03-20T20:30:00.000Z"

# ---------------------------------------------------------------- مرز
sec "۲) مرزِ فصل"
chk "فاکتورِ ۳۱ خرداد داخل است" \
  "$(J "'seas-edge-in' in [r['docNo'].replace('INV-','') for r in d['sales']['detailed']]")" "True"
chk "فاکتورِ ۱ تیر بیرون است" \
  "$(J "'seas-edge-out' in [r['docNo'].replace('INV-','') for r in d['sales']['detailed']]")" "False"

# ---------------------------------------------------------------- فروش
sec "۳) فروشِ تفصیلی"
chk "سه فروشِ شناسایی‌شده" "$(J "len(d['sales']['detailed'])")" "3"
chk "نسیه هم می‌آید" \
  "$(J "'INV-seas-sp2' in [r['docNo'] for r in d['sales']['detailed']]")" "True"
chk "باطل‌شده نمی‌آید" \
  "$(J "'INV-seas-cancel' in [r['docNo'] for r in d['sales']['detailed']]")" "False"
chk "جمعِ فروشِ تفصیلی" "$(J "int(d['totals']['salesDetailedTotal'])")" "3500000"
chk "شمارهٔ ملی همراه سطر است" \
  "$(J "d['sales']['detailed'][0]['nationalCode']")" "1234567890"
chk "تاریخ شمسی همراه سطر است" \
  "$(J "d['sales']['detailed'][0]['docDateJalali']")" "1405/01/26"

# ---------------------------------------------------------------- خرده‌فروشی
sec "۴) تجمیعِ خرده‌فروشی"
chk "دو فروشِ بی‌شناسه"      "$(J "d['sales']['retail']['count']")" "2"
chk "جمعشان تجمیعی است"      "$(J "int(d['sales']['retail']['total'])")" "120000"
# ⚠️ مشتریِ ثبت‌شده ولی بی‌شناسه هم خرده‌فروشی است، نه تفصیلی.
chk "مشتریِ بی‌شناسه تفصیلی نشد" \
  "$(J "'INV-seas-retail2' in [r['docNo'] for r in d['sales']['detailed']]")" "False"

# ---------------------------------------------------------------- خرید
sec "۵) خرید"
chk "هر دو خرید می‌آیند" "$(J "len(d['purchases']['detailed'])")" "2"
chk "جمعِ خرید"          "$(J "int(d['totals']['purchasesTotal'])")" "3400000"

# ---------------------------------------------------------------- برگشتی
sec "۶) برگشتی‌ها"
chk "برگشت از فروش"  "$(J "len(d['returns']['sales'])")"     "1"
# WARN برگشتیِ PENDING هنوز اتفاق نیفتاده؛ اگر گزارش شود، برگشتی بیش
#      از واقع می‌شود و با انبار و دفتر مغایرت پیدا می‌کند.
chk "برگشتیِ در انتظار نمی‌آید"   "$(J "'RT-3' in [r['docNo'] for r in d['returns']['sales']]")" "False"
chk "برگشت از خرید"  "$(J "len(d['returns']['purchases'])")" "1"
# ⚠️ برگشتی نباید از فروش کسر شود؛ جدا گزارش می‌شود.
chk "برگشتی از فروش کسر نشده" "$(J "int(d['totals']['salesTotal'])")" "3620000"

# ---------------------------------------------------------------- هشدار
sec "۷) هشدارها"
chk "تأمین‌کنندهٔ بی‌شناسه هشدار دارد" \
  "$(J "[w['count'] for w in d['warnings'] if w['code']=='SUPPLIER_WITHOUT_ID'][0]")" "1"
chk "خرده‌فروشی هشدار دارد" \
  "$(J "[w['count'] for w in d['warnings'] if w['code']=='RETAIL_AGGREGATED'][0]")" "2"

# ---------------------------------------------------------------- فصل خالی
sec "۸) فصلِ بدونِ معامله"
R=$(curl -s "${A[@]}" "$API/tax/seasonal/1404/3")
chk "فصلِ خالی خطا نمی‌دهد"  "$(J "len(d['sales']['detailed'])")" "0"
chk "جمعِ فصلِ خالی صفر است" "$(J "int(d['totals']['salesTotal'])")" "0"

# ---------------------------------------------------------------- ورودی بد
sec "۹) ورودیِ نامعتبر"
chk "فصلِ ۵ رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "$API/tax/seasonal/1405/5")" "400"
chk "سالِ ۹۹ رد می‌شود" \
  "$(curl -s -o /dev/null -w '%{http_code}' "${A[@]}" "$API/tax/seasonal/99/1")" "400"

# ---------------------------------------------------------------- دوره
sec "۱۰) فصلِ پیشنهادی"
R=$(curl -s "${A[@]}" "$API/tax/seasonal/period")
chk "فصلِ جاری برمی‌گردد"  "$(J "d['current']['jy']>1400")" "True"
chk "فصلِ پیشین هم می‌آید" "$(J "1<=d['previous']['quarter']<=4")" "True"

# ---------------------------------------------------------------- خروجی
sec "۱۱) خروجی CSV"
#
# WARN محتوا از راهِ **stdin** به پایتون می‌رود، نه با مسیرِ فایل.
#      پایتونِ ویندوز مسیرِ `/tmp/...`ِ Git Bash را نمی‌بیند و
#      FileNotFoundError می‌دهد — که `P()` می‌بلعدش و سنجه بی‌صدا خالی
#      برمی‌گردد.  شش سنجه همین‌طور «خالی» شدند تا علتش پیدا شد.
CSVF=$(mktemp)
curl -s "${A[@]}" "$API/tax/seasonal/1405/1/csv?kind=sales" > "$CSVF"

# WARN `newline=''` لازم است و بی‌دقتی نیست.
#      TextIOWrapper به‌طور پیش‌فرض «خطوطِ جهانی» را ترجمه می‌کند و
#      CRLF را به LF تبدیل می‌کند.  پس سنجهٔ شمارشِ خط همیشه ۱ می‌داد،
#      در حالی که خروجی از همان اول درست بود — آزمون خراب بود، نه کد.
#
#      (نویسه‌های گریز اینجا با نامشان نوشته شده‌اند، نه با بک‌اسلش:
#       سه بار در این کار، بک‌اسلش در لایه‌های bash←python←فایل گم شد
#       و همین خط را به دستورِ اجراشدنی تبدیل کرد.)
RD="import sys,io;d=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8',newline='').read();"

# WARN بدونِ BOM، اکسلِ ویندوز فارسی را با کدپیجِ سیستم می‌خواند و
#      «رضا» به «Ø±Ø¶Ø§» تبدیل می‌شود — بی‌آنکه خطایی بدهد.
chk "با BOM شروع می‌شود"   "$(head -c 3 "$CSVF" | od -An -tx1 | tr -d ' 
')" "efbbbf"

chk "سرستون فارسی است"   "$(cat "$CSVF" | P "${RD}print('نام' in d.split(chr(13))[0])")" "True"

# WARN مسیرِ csv باید پیش از :jy/:quarter تعریف شده باشد، وگرنه Nest
#      آن را با quarter='1' می‌گیرد و JSON برمی‌گرداند نه CSV.
chk "CSV است نه JSON"   "$(cat "$CSVF" | P "${RD}print(d.lstrip(chr(65279))[0] != '{')")" "True"

chk "سرستون + سه فروش + سطر تجمیعی"   "$(cat "$CSVF" | P "${RD}print(len([l for l in d.strip().split(chr(13)+chr(10)) if l]))")" "5"

chk "سطرِ تجمیعیِ خرده‌فروشی هست"   "$(cat "$CSVF" | P "${RD}print('تجمیعی' in d)")" "True"

chk "تاریخِ شمسی نوشته شده نه میلادی"   "$(cat "$CSVF" | P "${RD}print('1405/01/26' in d)")" "True"

curl -s "${A[@]}" "$API/tax/seasonal/1405/1/csv?kind=purchases" > "$CSVF"
chk "خروجی خرید هم می‌آید"   "$(cat "$CSVF" | P "${RD}print(len([l for l in d.strip().split(chr(13)+chr(10)) if l]))")" "3"
rm -f "$CSVF"

printf '\n   PASS: %s   FAIL: %s\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
