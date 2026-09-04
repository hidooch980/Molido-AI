#!/usr/bin/env bash
#
# چرخه‌های کامل کسب‌وکار — «یک روز کاری» از اول تا آخر.
#
# مجموعه‌های دیگر هر زیرسیستم را جدا می‌سنجند.  این یکی چیزی را می‌سنجد
# که هیچ‌کدام نمی‌بینند: **اتصالِ بین‌شان**.
#
# خرید انبار را زیاد می‌کند، فروش کمش می‌کند، هر دو سند حسابداری
# می‌سازند، و آخر روز تراز باید صفر بماند.  اگر جایی از این زنجیره
# بشکند، هر زیرسیستم به‌تنهایی سبز است و فقط جمعِ آخر غلط درمی‌آید —
# یعنی همان جایی که کسی نگاه نمی‌کند تا وقتی حسابدار شکایت کند.
#
# ⚠️ دادهٔ آزمون عمداً لاتین است: پوستهٔ ویندوز متن فارسی را در
#    `curl -d` به علامت سؤال بدل می‌کند.  برای متن فارسی، JSON در فایل
#    UTF-8 نوشته و با `--data-binary @file` فرستاده می‌شود.

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
    *)   echo "  ✗ ورود ناموفق — پاسخ $code از /auth/login" ;;
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
Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

pass=0; fail=0
chk() {
  if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"
  else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi
}

# تراز پیش از شروع — همه‌چیز نسبت به همین سنجیده می‌شود، نه نسبت به صفر:
# پایگاه دادهٔ توسعه از آزمون‌های قبلی سند دارد.
TRIAL_BEFORE=$(Q "SELECT COALESCE(SUM(l.debit)-SUM(l.credit),0)::bigint
                    FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
                   WHERE e.status<>'DRAFT'")

# ⚠️ مهرِ زمانیِ آغاز — مرزِ «آنچه این اجرا ساخت».
T0=$(Q "SELECT now()")

cleanup() {
  $C exec -T postgres psql -U postgres -d molido_ai -q >/dev/null 2>&1 <<'SQL'
-- ⚠️ اسنادِ حسابداری **پیش از** فاکتورها حذف می‌شوند.
--
--    این مجموعه تا امروز اصلاً سندی پاک نمی‌کرد و فقط برای سنجشِ تراز
--    می‌خواندشان — یعنی هر اجرا چهار سند برای همیشه جا می‌گذاشت.
--
--    ترتیب مهم است: شناسایی از روی `note` فاکتور انجام می‌شود، پس اگر
--    فاکتور اول برود، سند دیگر پیدا نمی‌شود.  همین دام یک بار در
--    `integration` افتاد.
--
--    سندِ `REVERSAL` هم گرفته می‌شود: `sourceId`ِ آن شناسهٔ سندِ
--    معکوس‌شده است، نه فاکتور.
DELETE FROM "JournalLine" WHERE "entryId" IN (
  SELECT id FROM "JournalEntry" WHERE "sourceId" IN (
    SELECT id FROM "Sale" WHERE note LIKE 'E2E-%'
    UNION SELECT id FROM "Purchase" WHERE note LIKE 'E2E-%')
  UNION SELECT id FROM "JournalEntry" WHERE "sourceId" IN (
    SELECT id FROM "JournalEntry" WHERE "sourceId" IN (
      SELECT id FROM "Sale" WHERE note LIKE 'E2E-%'
      UNION SELECT id FROM "Purchase" WHERE note LIKE 'E2E-%')));
DELETE FROM "JournalEntry" WHERE "sourceId" IN (
  SELECT id FROM "Sale" WHERE note LIKE 'E2E-%'
  UNION SELECT id FROM "Purchase" WHERE note LIKE 'E2E-%')
  OR "sourceId" IN (
    SELECT id FROM "JournalEntry" WHERE "sourceId" IN (
      SELECT id FROM "Sale" WHERE note LIKE 'E2E-%'
      UNION SELECT id FROM "Purchase" WHERE note LIKE 'E2E-%'));
DELETE FROM "SaleItem" WHERE "saleId" IN (SELECT id FROM "Sale" WHERE note LIKE 'E2E-%');
DELETE FROM "Sale" WHERE note LIKE 'E2E-%';
DELETE FROM "PurchaseItem" WHERE "purchaseId" IN (SELECT id FROM "Purchase" WHERE note LIKE 'E2E-%');
DELETE FROM "Purchase" WHERE note LIKE 'E2E-%';
DELETE FROM "StockMovement" WHERE "productId" IN (SELECT id FROM "Product" WHERE sku LIKE 'E2E-%');
DELETE FROM "Inventory" WHERE "productId" IN (SELECT id FROM "Product" WHERE sku LIKE 'E2E-%');
DELETE FROM "Product" WHERE sku LIKE 'E2E-%';
DELETE FROM "SupplierQuote" WHERE "callId" IN (
  SELECT c.id FROM "SupplierCall" c JOIN "Supplier" s ON s.id = c."supplierId"
   WHERE s.name LIKE 'E2E-%');
DELETE FROM "SupplierCall" WHERE "supplierId" IN (SELECT id FROM "Supplier" WHERE name LIKE 'E2E-%');
DELETE FROM "PurchaseInquiryItem" WHERE "productId" IN (SELECT id FROM "Product" WHERE sku LIKE 'E2E-%');
DELETE FROM "PurchaseInquiry" WHERE id NOT IN (SELECT DISTINCT "inquiryId" FROM "PurchaseInquiryItem");
DELETE FROM "Supplier" WHERE name LIKE 'E2E-%';
-- ⚠️ بر اساس شماره هم پاک می‌شود، نه فقط نام.
--
--    اگر اجرای قبلی نیمه‌کاره مانده باشد، مشتری ساخته شده ولی نامش
--    ثبت نشده؛ آن‌وقت ساختِ دوباره ۴۰۹ می‌گیرد، شناسه خالی می‌ماند و
--    فروش با خطای کلید خارجی می‌افتد — شکستی که هیچ ربطی به کد ندارد.
DELETE FROM "Customer" WHERE "firstName" LIKE 'E2E-%' OR phone = '09127770001';
SQL

  # ⚠️ جاروی پایانی — چون شناساییِ نام‌محور کافی نیست.
  #
  #    این مجموعه یک فاکتور خرید هم از راهِ «استعلام ← سفارش» می‌سازد
  #    که یادداشتش `E2E-` نیست، پس با الگوی نام پیدا نمی‌شد و سندش
  #    هر اجرا جا می‌ماند.
  #
  #    قاعدهٔ مطمئن‌تر: سندی که **این اجرا** ساخته و سندِ مرجعش دیگر
  #    وجود ندارد، یتیم است و باید برود.  به یادداشت وابسته نیست، پس
  #    مسیرِ تازه‌ای هم که فردا اضافه شود خودبه‌خود پوشش می‌گیرد.
  $C exec -T postgres psql -U postgres -d molido_ai -q -c "
    DELETE FROM \"JournalLine\" WHERE \"entryId\" IN
      (SELECT id FROM \"JournalEntry\" WHERE \"createdAt\" > '$T0'
         AND \"sourceId\" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM \"Sale\" x WHERE x.id=\"sourceId\")
         AND NOT EXISTS (SELECT 1 FROM \"Purchase\" x WHERE x.id=\"sourceId\")
         AND NOT EXISTS (SELECT 1 FROM \"ProductReturn\" x WHERE x.id=\"sourceId\")
         AND NOT EXISTS (SELECT 1 FROM \"JournalEntry\" y WHERE y.id=\"sourceId\"));
    DELETE FROM \"JournalEntry\" WHERE \"createdAt\" > '$T0'
       AND \"sourceId\" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM \"Sale\" x WHERE x.id=\"sourceId\")
       AND NOT EXISTS (SELECT 1 FROM \"Purchase\" x WHERE x.id=\"sourceId\")
       AND NOT EXISTS (SELECT 1 FROM \"ProductReturn\" x WHERE x.id=\"sourceId\")
       AND NOT EXISTS (SELECT 1 FROM \"JournalEntry\" y WHERE y.id=\"sourceId\");" >/dev/null 2>&1
}
cleanup
# ⚠️ `trap` لازم است، نه فقط فراخوانیِ پایانی.
#
#    اگر اسکریپت وسطِ راه بیفتد — خطای شبکه، ۴۲۹، Ctrl+C — فراخوانیِ
#    پایانی هرگز اجرا نمی‌شود و داده‌اش برای مجموعه‌های بعدی می‌ماند.
trap cleanup EXIT

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۱: کالا وارد می‌شود ━━━'
# ═══════════════════════════════════════════════════════════════

WH=$(Q "SELECT id FROM \"Warehouse\" LIMIT 1")
chk "انبار هست" "$([ -n "$WH" ] && echo yes || echo no)" "yes"

PROD=$(curl -s -X POST $A/products -H "$AU" -H "$JS" \
  -d '{"name":"E2E Rice","sku":"E2E-RICE","salePrice":500000,"purchasePrice":300000,"unit":"kg","minStock":5}' \
  | P "d.get('id','')")
chk "کالا ساخته شد" "$([ -n "$PROD" ] && echo yes || echo no)" "yes"
chk "موجودی اولیه صفر" "$(Q "SELECT COALESCE((SELECT quantity FROM \"Inventory\" WHERE \"productId\"='$PROD'),0)::int")" "0"

SUP=$(curl -s -X POST $A/suppliers -H "$AU" -H "$JS" \
  -d '{"name":"E2E-Supplier","phone":"02100000001"}' | P "d.get('id','')")
chk "تأمین‌کننده ساخته شد" "$([ -n "$SUP" ] && echo yes || echo no)" "yes"

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۲: خرید — انبار پر می‌شود و سند می‌خورد ━━━'
# ═══════════════════════════════════════════════════════════════

BUY=$(curl -s -X POST $A/purchases -H "$AU" -H "$JS" -d "{
  \"supplierId\":\"$SUP\",\"warehouseId\":\"$WH\",\"note\":\"E2E-buy\",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":100,\"purchasePrice\":300000}]}")
BUY_ID=$(echo "$BUY" | P "d.get('id','')")
chk "خرید ثبت شد" "$([ -n "$BUY_ID" ] && echo yes || echo no)" "yes"

# ⚠️ خرید دو مرحله دارد و تفکیکش مهم است.
#
#    `POST /purchases` فاکتور را با وضعیت `PENDING` می‌سازد و انبار را
#    **دست نمی‌زند**.  فاکتوری که بنکدار فرستاده ولی کالایش هنوز نرسیده
#    نباید موجودی بسازد — وگرنه فروشگاه چیزی می‌فروشد که در راه است.
chk "وضعیت اولیه PENDING" \
  "$(Q "SELECT status FROM \"Purchase\" WHERE id='$BUY_ID'")" "PENDING"
chk "پیش از دریافت، انبار دست‌نخورده" \
  "$(Q "SELECT COALESCE((SELECT quantity FROM \"Inventory\" WHERE \"productId\"='$PROD'),0)::int")" "0"

# و حالا کالا می‌رسد.
RECV=$(curl -s -X PATCH "$A/purchases/$BUY_ID/receive" -H "$AU")
chk "دریافت ثبت شد" "$(echo "$RECV" | P "d.get('status')")" "RECEIVED"

# ⚠️ گره اصلی: دریافت باید انبار را زیاد کند.  اگر این بشکند، ماژول
#    خرید سبز است و ماژول انبار هم سبز است — فقط عددها به هم نمی‌رسند.
chk "انبار ۱۰۰ شد" "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE \"productId\"='$PROD' AND \"warehouseId\"='$WH'")" "100"
# `StockMovement` ستون `type` ندارد؛ جهت با علامتِ `delta` مشخص
# می‌شود.  مثبت یعنی ورود.
chk "حرکت ورود ثبت شد" \
  "$(Q "SELECT count(*) FROM \"StockMovement\" WHERE \"productId\"='$PROD' AND delta > 0")" "1"

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۳: فروش — انبار کم می‌شود و پول می‌آید ━━━'
# ═══════════════════════════════════════════════════════════════

CUST=$(curl -s -X POST $A/customers -H "$AU" -H "$JS" \
  -d '{"firstName":"E2E-Customer","phone":"09127770001"}' | P "d.get('id','')")

SALE=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"customerId\":\"$CUST\",\"warehouseId\":\"$WH\",\"note\":\"E2E-sale\",
  \"paymentMethod\":\"CASH\",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":30,\"price\":500000}]}")
SALE_ID=$(echo "$SALE" | P "d.get('id','')")
# ⚠️ اگر فروش ثبت نشد، **پاسخِ سرور را چاپ کن**.
#
#    این مجموعه در اجرای تنها ۳۱/۳۱ می‌داد و در اجرای کامل شش شکست —
#    و هر شش‌تا پیامدِ همین یک سطر بودند.  ولی پیامِ شکست فقط
#    «got=no want=yes» بود: نه کدِ وضعیت، نه علت.
#
#    دو بار وقت صرفِ حدس زدن شد (قفلِ حساب؟ سقفِ نرخ؟ دادهٔ جامانده؟)
#    در حالی که خودِ سرور جواب را در بدنه فرستاده بود و آزمون دورش
#    می‌انداخت.
#
#    آزمونی که نمی‌گوید چرا افتاد، از آزمون نداشتن گران‌تر است.
if [ -z "$SALE_ID" ]; then
  printf '       ↳ پاسخ /sales: %s
' "$(printf '%s' "$SALE" | head -c 300)"
fi
chk "فروش ثبت شد" "$([ -n "$SALE_ID" ] && echo yes || echo no)" "yes"
chk "مبلغ فروش" "$(echo "$SALE" | P "int(float(d.get('total',0)))")" "15000000"
# ۱۰۰ خرید − ۳۰ فروش = ۷۰
chk "انبار ۷۰ ماند" "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE \"productId\"='$PROD' AND \"warehouseId\"='$WH'")" "70"
chk "حرکت خروج ثبت شد" \
  "$(Q "SELECT count(*) FROM \"StockMovement\" WHERE \"productId\"='$PROD' AND delta < 0")" "1"

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۴: فروش بیش از موجودی رد می‌شود ━━━'
# ═══════════════════════════════════════════════════════════════
# بدون این، فروشگاه چیزی می‌فروشد که ندارد و موجودی منفی می‌شود —
# خطایی که تا انبارگردانی دیده نمی‌شود.
#
# ⚠️ عدد عمداً معقول است (۲۰۰ در برابر ۷۰)، نه نجومی.
#
#    نسخهٔ اول ۹۹۹۹ می‌فرستاد و ۴۰۰ می‌گرفت — ولی به دلیلِ **سرریز
#    عددی**، نه نگهبانِ موجودی.  سنجه سبز بود و چیزی را که ادعا می‌کرد
#    نمی‌سنجید: اگر نگهبان اصلاً وجود نداشت، باز هم سبز می‌ماند.
OVER=$(curl -s -X POST $A/sales -H "$AU" -H "$JS" -d "{
  \"warehouseId\":\"$WH\",\"note\":\"E2E-over\",\"paymentMethod\":\"CASH\",
  \"items\":[{\"productId\":\"$PROD\",\"quantity\":200,\"price\":500000}]}")
chk "فروش بیش از موجودی رد شد" "$(echo "$OVER" | P "d.get('statusCode')")" "400"
# پیام باید دربارهٔ **موجودی** باشد: هر ۴۰۰ ای کافی نیست.
chk "پیام دربارهٔ موجودی است"   "$(echo "$OVER" | P "'موجودی' in str(d.get('message',''))")" "True"
chk "انبار دست‌نخورد" "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE \"productId\"='$PROD' AND \"warehouseId\"='$WH'")" "70"

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۵: کسری، استعلام و مقایسه ━━━'
# ═══════════════════════════════════════════════════════════════

# ⚠️ انبار در **خودِ استعلام** لازم است.
#
#    `order` انبار را از استعلام می‌خواند، نه از بدنهٔ سفارش.  استعلامِ
#    بی‌انبار پیش از این با «یکی از مقدارهای الزامی خالی است» می‌شکست —
#    پیامی که نمی‌گفت مشکل کجاست.
INQ=$(curl -s -X POST $A/purchasing/inquiries -H "$AU" -H "$JS" \
  -d "{\"warehouseId\":\"$WH\",\"items\":[{\"productId\":\"$PROD\",\"qty\":50}]}")
IID=$(echo "$INQ" | P "d.get('id','')")
chk "استعلام ساخته شد" "$([ -n "$IID" ] && echo yes || echo no)" "yes"

# استعلامِ بی‌انبار باید پیامِ روشن بگیرد، نه خطای قیدِ دیتابیس.
#
# ⚠️ ترتیب مهم است: اول باید قیمتی وجود داشته باشد.  بررسیِ «پیشنهادی
#    نیست» پیش از «انبار ندارد» می‌آید و همین درست است — کسی که هنوز
#    زنگ نزده، پیامِ «انبار نداری» گیجش می‌کند.
NOWH=$(curl -s -X POST $A/purchasing/inquiries -H "$AU" -H "$JS" \
  -d "{\"items\":[{\"productId\":\"$PROD\",\"qty\":1}]}" | P "d.get('id','')")
curl -s -X POST "$A/purchasing/inquiries/$NOWH/calls" -H "$AU" -H "$JS" -d "{
  \"supplierId\":\"$SUP\",\"channel\":\"MANUAL\",
  \"quotes\":[{\"productId\":\"$PROD\",\"unitPrice\":300000,\"availableQty\":1}]}" >/dev/null
chk "سفارشِ استعلامِ بی‌انبار، پیام روشن دارد" \
  "$(curl -s -X POST "$A/purchasing/inquiries/$NOWH/order" -H "$AU" -H "$JS" -d '{}' \
     | P "'انبار' in str(d.get('message',''))")" "True"

SUP2=$(curl -s -X POST $A/suppliers -H "$AU" -H "$JS" \
  -d '{"name":"E2E-Supplier2","phone":"02100000002"}' | P "d.get('id','')")

curl -s -X POST "$A/purchasing/inquiries/$IID/calls" -H "$AU" -H "$JS" -d "{
  \"supplierId\":\"$SUP\",\"channel\":\"MANUAL\",
  \"quotes\":[{\"productId\":\"$PROD\",\"unitPrice\":310000,\"availableQty\":50}]}" >/dev/null
curl -s -X POST "$A/purchasing/inquiries/$IID/calls" -H "$AU" -H "$JS" -d "{
  \"supplierId\":\"$SUP2\",\"channel\":\"MANUAL\",
  \"quotes\":[{\"productId\":\"$PROD\",\"unitPrice\":290000,\"availableQty\":50}]}" >/dev/null

CMP=$(curl -s "$A/purchasing/inquiries/$IID/compare" -H "$AU")
chk "ارزان‌ترین برنده شد" \
  "$(echo "$CMP" | P "[w['quote']['supplierName'] for w in d['winners'] if w.get('quote')][0]")" "E2E-Supplier2"
chk "صرفه‌جویی محاسبه شد" "$(echo "$CMP" | P "d['brief']['totalSaved'] > 0")" "True"

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۶: سفارش خرید — انبار دوباره پر می‌شود ━━━'
# ═══════════════════════════════════════════════════════════════

# بدنه خالی است: انبار از استعلام خوانده می‌شود.
ORD=$(curl -s -X POST "$A/purchasing/inquiries/$IID/order" -H "$AU" -H "$JS" -d '{}')
# پاسخ `{ordered, purchaseIds, total, uncovered}` است — از خودِ کد
# خوانده شد، نه حدس.
chk "سفارش صادر شد" "$(echo "$ORD" | P "d.get('ordered', 0) >= 1")" "True"
chk "شناسهٔ فاکتور برگشت" "$(echo "$ORD" | P "len(d.get('purchaseIds', [])) >= 1")" "True"

# سفارشِ استعلام هم فاکتورِ `PENDING` می‌سازد، نه موجودی.  هر فاکتور
# باید جدا دریافت شود.
NEWBUY=$(Q "SELECT id FROM \"Purchase\" WHERE \"supplierId\"='$SUP2' ORDER BY \"createdAt\" DESC LIMIT 1")
chk "فاکتور سفارش ساخته شد" "$([ -n "$NEWBUY" ] && echo yes || echo no)" "yes"
curl -s -X PATCH "$A/purchases/$NEWBUY/receive" -H "$AU" >/dev/null

# ۷۰ + ۵۰ = ۱۲۰
chk "انبار ۱۲۰ شد" "$(Q "SELECT quantity::int FROM \"Inventory\" WHERE \"productId\"='$PROD' AND \"warehouseId\"='$WH'")" "120"
# قیمت خرید کالا باید به قیمتِ توافق‌شده به‌روز شود، وگرنه حاشیهٔ سود
# ماه‌ها با عدد قدیمی حساب می‌شود.
chk "قیمت خرید به‌روز شد" "$(Q "SELECT \"purchasePrice\"::int FROM \"Product\" WHERE id='$PROD'")" "290000"

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۷: تراز حسابداری ━━━'
# ═══════════════════════════════════════════════════════════════
# مهم‌ترین سنجهٔ این فایل: هر خرید و فروش سند می‌سازد، و اگر یکی از
# سندها ناتراز باشد جمعِ کل صفر نمی‌ماند.  هیچ ماژولی به‌تنهایی این را
# نمی‌بیند.
TRIAL_AFTER=$(Q "SELECT COALESCE(SUM(l.debit)-SUM(l.credit),0)::bigint
                   FROM \"JournalLine\" l JOIN \"JournalEntry\" e ON e.id=l.\"entryId\"
                  WHERE e.status<>'DRAFT'")
chk "تراز صفر ماند" "$TRIAL_AFTER" "$TRIAL_BEFORE"

ENTRIES=$(Q "SELECT count(*) FROM \"JournalEntry\" WHERE status<>'DRAFT'")
chk "سند حسابداری ساخته شد" "$([ "$ENTRIES" -gt 0 ] && echo yes || echo no)" "yes"

# ═══════════════════════════════════════════════════════════════
echo '━━━ چرخهٔ ۸: جداسازی شرکت ━━━'
# ═══════════════════════════════════════════════════════════════
# هر رکوردی که این آزمون ساخت باید `companyId` داشته باشد.  ردیف
# بی‌شرکت یعنی نشتِ بین‌مستأجری — و چون هیچ خطایی نمی‌دهد، تا روزی که
# شرکت دوم اضافه شود دیده نمی‌شود.
chk "کالا شرکت دارد" "$(Q "SELECT count(*) FROM \"Product\" WHERE sku='E2E-RICE' AND \"companyId\" IS NULL")" "0"
chk "فروش شرکت دارد" "$(Q "SELECT count(*) FROM \"Sale\" WHERE note='E2E-sale' AND \"companyId\" IS NULL")" "0"
chk "خرید شرکت دارد" "$(Q "SELECT count(*) FROM \"Purchase\" WHERE note LIKE 'E2E-%' AND \"companyId\" IS NULL")" "0"

# پاک‌سازی را `trap` انجام می‌دهد.

echo
printf '   PASS: %s   FAIL: %s\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
