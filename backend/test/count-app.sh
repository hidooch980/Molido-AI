#!/usr/bin/env bash
#
# اپ شمارش انبار — قرارداد API که رابط موبایل رویش سوار است.
#
# ⚠️ این مجموعه رابط را نمی‌سنجد، **قرارداد** را می‌سنجد.
#
#    اپ سه چیز از سرور می‌خواهد و اگر هرکدام عوض شود بی‌صدا خراب
#    می‌شود:
#
#      • `productBarcode` در خطوط — بدونش اسکن هیچ‌وقت چیزی پیدا نمی‌کند
#        و انباردار فکر می‌کند اسکنر خراب است
#      • `countedQty` تهی برای شمرده‌نشده — نشانهٔ پیشرفت همین است
#      • `PATCH lines/:id` که عدد را می‌پذیرد و نگه می‌دارد
#
# ⚠️ دادهٔ آزمون عمداً لاتین است — پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال تبدیل می‌کند و خطای کاذب می‌سازد.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@molido.ai","password":"'"$PW"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST $A/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"admin@molido.ai","password":"'"$PW"'"}')
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
    bad = chr(39) + chr(34) + chr(92)
    safe = ''.join(c for c in raw[:40] if c.isprintable() and c not in bad)
    print('<<پاسخ-JSON-نبود: %d نویسه: %s>>' % (len(raw), safe)); sys.exit(0)
print($1)"; }

Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d '\r'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

# ------------------------------------------------------------ آماده‌سازی
CO=$(Q "SELECT id FROM \"Company\" LIMIT 1;")
WH=$(Q "SELECT id FROM \"Warehouse\" WHERE \"companyId\"='$CO' LIMIT 1;")

# انبارگردانی باز قبلی لغو می‌شود تا این اجرا تکرارپذیر بماند
for old in $(Q "SELECT id FROM \"StockCount\" WHERE \"companyId\"='$CO' AND status IN ('OPEN','DRAFT');"); do
  curl -s -X POST "$A/stock-count/$old/cancel" -H "$AU" >/dev/null
done

# کالای آزمون با بارکد شناخته‌شده
Q "DELETE FROM \"Product\" WHERE sku LIKE 'CNT-%';" >/dev/null
Q "INSERT INTO \"Product\" (id,\"companyId\",name,sku,unit,barcode,\"salePrice\",\"purchasePrice\")
   VALUES (gen_random_uuid()::text,'$CO','CNT-A','CNT-A','ea','7770000000017',1000,900);" >/dev/null
PID=$(Q "SELECT id FROM \"Product\" WHERE sku='CNT-A';")
# ⚠️ `Inventory` ستون `companyId` **ندارد** — از طریق انبار محدود
#    می‌شود.  اولین نسخهٔ این آزمون آن ستون را داشت، درج بی‌صدا افتاد
#    (چون `Q` خطا را به /dev/null می‌فرستد)، و پنج سنجه با پیامی
#    شکستند که هیچ ربطی به علت نداشت.
Q "INSERT INTO \"Inventory\" (id,\"productId\",\"warehouseId\",quantity)
   VALUES (gen_random_uuid()::text,'$PID','$WH',25);" >/dev/null

# آماده‌سازی باید **خودش** سنجیده شود، وگرنه شکستش را به گردن کد
# می‌اندازیم.  `open()` کالاها را از `Inventory` این انبار برمی‌دارد؛
# بدون این ردیف، کالای آزمون اصلاً در انبارگردانی نمی‌آید.
chk "موجودی آزمون ساخته شد" "$(Q "SELECT count(*) FROM \"Inventory\" WHERE \"productId\"='$PID' AND \"warehouseId\"='$WH';")" "1"

CID=$(curl -s -X POST $A/stock-count -H "$AU" -H "$JS" -d "{\"warehouseId\":\"$WH\"}" | P "d.get('id','')")
chk "انبارگردانی ساخته شد" "$([ -n "$CID" ] && echo yes || echo no)" "yes"

D() { curl -s "$A/stock-count/$CID" -H "$AU" | P "$1"; }

echo '--- ۱) قرارداد خطوط ---'
chk "خط دارد" "$(D "'yes' if len(d.get('lines',[]))>0 else 'no'")" "yes"
# اپ روی این سه کلید سوار است؛ نبودشان یعنی خرابیِ بی‌صدا.
chk "productBarcode هست" "$(D "'yes' if 'productBarcode' in d['lines'][0] else 'no'")" "yes"
chk "productSku هست"     "$(D "'yes' if 'productSku' in d['lines'][0] else 'no'")" "yes"
chk "productUnit هست"    "$(D "'yes' if 'productUnit' in d['lines'][0] else 'no'")" "yes"

echo '--- ۲) بارکد واقعاً می‌رسد ---'
chk "بارکد کالای آزمون" "$(D "[l.get('productBarcode') for l in d['lines'] if l.get('productSku')=='CNT-A'][0]")" "7770000000017"

echo '--- ۳) شمرده‌نشده = تهی ---'
# نشانهٔ پیشرفتِ اپ همین است.  اگر روزی به صفر تبدیل شود، اپ همه‌چیز
# را «شمرده‌شده» نشان می‌دهد و انباردار کارِ نکرده را تمام‌شده می‌بیند.
chk "قبل از شمارش تهی است" "$(D "'null' if d['lines'][0]['countedQty'] is None else repr(d['lines'][0]['countedQty'])")" "null"

LINE=$(D "[l['id'] for l in d['lines'] if l.get('productSku')=='CNT-A'][0]")

echo '--- ۴) ثبت شمارش ---'
curl -s -X PATCH "$A/stock-count/$CID/lines/$LINE" -H "$AU" -H "$JS" -d '{"countedQty":22}' >/dev/null
chk "عدد ثبت شد" "$(D "[str(int(float(l['countedQty']))) for l in d['lines'] if l['id']=='$LINE'][0]")" "22"
chk "در پایگاه داده هست" "$(Q "SELECT \"countedQty\"::int FROM \"StockCountLine\" WHERE id='$LINE';")" "22"

echo '--- ۵) صفر با تهی یکی نیست ---'
# «صفر شمردم» با «هنوز نشمرده‌ام» دو چیزند: اولی یعنی کالا تمام شده و
# باید کسری ثبت شود، دومی یعنی کار ناتمام است.
curl -s -X PATCH "$A/stock-count/$CID/lines/$LINE" -H "$AU" -H "$JS" -d '{"countedQty":0}' >/dev/null
chk "صفر ثبت‌شدنی است" "$(D "[str(int(float(l['countedQty']))) for l in d['lines'] if l['id']=='$LINE'][0]")" "0"
chk "صفر تهی نیست" "$(D "'null' if [l['countedQty'] for l in d['lines'] if l['id']=='$LINE'][0] is None else 'not-null'")" "not-null"

echo '--- ۶) بدون توکن بسته است ---'
chk "بدون توکن ۴۰۱" "$(curl -s -o /dev/null -w '%{http_code}' "$A/stock-count/$CID")" "401"

# ------------------------------------------------------------ پاک‌سازی
curl -s -X POST "$A/stock-count/$CID/cancel" -H "$AU" >/dev/null
Q "DELETE FROM \"Inventory\" WHERE \"productId\"='$PID';" >/dev/null
Q "DELETE FROM \"Product\" WHERE sku LIKE 'CNT-%';" >/dev/null

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
