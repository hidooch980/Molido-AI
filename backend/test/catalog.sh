#!/usr/bin/env bash
#
# فهرستِ مشترکِ بارکد — «هر جنسی ثبت شود، بعدی‌ها بشناسندش».
#
# ⚠️ سنجهٔ اصلیِ این فایل «بارکد پیدا می‌شود» نیست.
#
#    چیزی که واقعاً اهمیت دارد این است که **قیمت و موجودی به فهرستِ
#    مشترک نشت نکنند**.  فهرست بین‌شرکتی است و RLS ندارد؛ اگر روزی
#    کسی `price` را هم به آن اضافه کند، حاشیهٔ سودِ هر فروشگاه برای
#    رقیبش خواندنی می‌شود — بی‌آنکه چیزی خطا بدهد.
#
# ⚠️ سنجهٔ دوم: منبعِ بیرونی پیش‌فرض **خاموش** باشد.
#
#    سنجیده شد که Open Food Facts بارکدِ ایرانی را ندارد و برای
#    بارکدِ ناموجود ده ثانیه طول می‌کشد.  روشن بودنش یعنی صندوق‌دار
#    پشتِ باجه منتظر بماند تا «پیدا نشد» بشنود.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
JS="Content-Type: application/json"
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}

T=${MOLIDO_TOKEN:-$(curl -s -X POST $A/auth/login -H "$JS" \
  -d '{"email":"admin@molido.ai","password":"'"$PW"'"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)}
if [ -z "$T" ]; then
  echo "  ✗ ورود ناموفق"
  echo
  printf "   PASS: 0   FAIL: 1\n"
  exit 1
fi
AU="Authorization: Bearer $T"

P() { python3 -c "
import sys,json,io
sys.stdin=io.TextIOWrapper(sys.stdin.buffer,encoding='utf-8')
sys.stdout=io.TextIOWrapper(sys.stdout.buffer,encoding='utf-8')
raw=sys.stdin.read().strip()
if not raw:
    d=None            # بدنهٔ تهی یعنی «پیدا نشد» — همان چیزی که انتظار داریم
else:
    try:
        d=json.loads(raw)
    except ValueError:
        print('<<no-json:%d>>' % len(raw)); sys.exit(0)
print($1)"; }
Q() { $C exec -T postgres psql -U postgres -d molido_ai -tAq -c "$1" 2>/dev/null | tr -d ' \r'; }

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }

BC=6261234567892
cleanup() {
  Q "DELETE FROM \"BarcodeCatalog\" WHERE barcode IN ('$BC','1234567890128');" >/dev/null
  Q "DELETE FROM \"Product\" WHERE sku LIKE 'CATTEST%';" >/dev/null
}
trap cleanup EXIT
cleanup

echo '--- ۱) اسکنِ بارکدِ ناشناخته ---'
# ⚠️ «پیدا نشد» حالتِ عادی است، نه خطا: کاربر خودش ثبتش می‌کند.
chk "بارکدِ ناشناخته ۲۰۰ می‌دهد" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/catalog/$BC" -H "$AU")" "200"
chk "پاسخ تهی است" \
  "$(curl -s "$A/catalog/$BC" -H "$AU" | P "'empty' if d is None else 'has'")" "empty"

echo '--- ۲) ثبتِ کالا فهرست را پر می‌کند ---'
# ⚠️ همان چیزی که کلِ قابلیت به آن وابسته است: بدونِ این، حافظه هرگز
#    پر نمی‌شود و «اسکن کن، شناسایی شود» برای همیشه خالی می‌ماند.
curl -s -o /dev/null -X POST "$A/products" -H "$AU" -H "$JS" \
  -d "{\"name\":\"CATTEST Full Milk\",\"sku\":\"CATTEST-1\",\"barcode\":\"$BC\",\"unit\":\"pcs\",\"salePrice\":250000,\"purchasePrice\":180000}"

chk "کالا در فهرستِ مشترک نشست" "$(Q "SELECT count(*) FROM \"BarcodeCatalog\" WHERE barcode='$BC';")" "1"
chk "نام درست ذخیره شد"   "$(curl -s "$A/catalog/$BC" -H "$AU" | P "d.get('name','')")" "CATTEST Full Milk"

# ⚠️ **مهم‌ترین سنجهٔ فایل.**
#
#    فهرست بین‌شرکتی است و RLS ندارد.  اگر قیمت یا بهای خرید در آن
#    بنشیند، حاشیهٔ سودِ هر فروشگاه برای رقیبش خواندنی می‌شود.
chk "ستونِ قیمت اصلاً وجود ندارد" \
  "$(Q "SELECT count(*) FROM information_schema.columns
        WHERE table_name='BarcodeCatalog'
          AND column_name IN ('price','purchasePrice','cost','stock','quantity','supplierId','companyId');")" "0"

echo '--- ۳) اسکنِ دوباره شناسایی می‌کند ---'
R=$(curl -s "$A/catalog/$BC" -H "$AU")
chk "حالا شناخته می‌شود" "$(printf '%s' "$R" | P "d.get('barcode','')")" "$BC"
chk "منبع LOCAL است" "$(printf '%s' "$R" | P "d.get('source','')")" "LOCAL"

echo '--- ۴) ثبتِ دوباره نام را خراب نمی‌کند ---'
# ⚠️ اگر آخرین ثبت جایگزین می‌شد، فروشگاهی که کالا را «شیر» می‌نامد
#    نامِ دقیقی را که دیگری ثبت کرده پاک می‌کرد.
curl -s -o /dev/null -X POST "$A/catalog" -H "$AU" -H "$JS" \
  -d "{\"barcode\":\"$BC\",\"name\":\"Milk\",\"brand\":\"Kalleh\"}"

R2=$(curl -s "$A/catalog/$BC" -H "$AU")
chk "نامِ اصلی دست‌نخورده ماند" "$(printf '%s' "$R2" | P "d.get('name','')")" "CATTEST Full Milk"
chk "میدانِ تهی پر شد (برند)" "$(printf '%s' "$R2" | P "d.get('brand','')")" "Kalleh"
chk "شمارندهٔ دیده‌شدن بالا رفت" \
  "$(Q "SELECT CASE WHEN \"seenCount\" >= 2 THEN 'yes' ELSE 'no' END FROM \"BarcodeCatalog\" WHERE barcode='$BC';")" "yes"

# ⚠️ `imageUrl` از بدنه پذیرفته **نمی‌شود** — و این سنجه‌اش است.
#
#    اگر پذیرفته می‌شد، هرکسی می‌توانست نشانیِ دلخواه در فهرستِ
#    بین‌شرکتی بنشاند: هر فروشگاهِ دیگری که آن بارکد را اسکن کند،
#    مرورگرش به آن نشانی درخواست می‌فرستد.  تصویر فقط از راهی که
#    خودمان دانلود کرده‌ایم می‌آید.
curl -s -o /dev/null -X POST "$A/catalog" -H "$AU" -H "$JS"   -d "{\"barcode\":\"$BC\",\"name\":\"Milk\",\"imageUrl\":\"https://evil.example/x.png\"}"
chk "نشانیِ تصویرِ بیرونی پذیرفته نشد"   "$(curl -s "$A/catalog/$BC" -H "$AU" | P "d.get('imageUrl') or 'none'")" "none"

echo '--- ۵) اعتبارسنجی ---'
chk "بارکدِ بدریخت پذیرفته نمی‌شود" \
  "$(curl -s "$A/catalog/abc" -H "$AU" | P "'empty' if d is None else 'has'")" "empty"

curl -s -o /dev/null -X POST "$A/catalog" -H "$AU" -H "$JS" -d '{"barcode":"12","name":"short"}'
chk "بارکدِ کوتاه ثبت نمی‌شود" "$(Q "SELECT count(*) FROM \"BarcodeCatalog\" WHERE barcode='12';")" "0"

echo '--- ۶) مسیرِ فهرست عمومی نیست ---'
# ⚠️ فهرست بین‌شرکتی است ولی مسیرش نه: مسیرِ باز یعنی هرکسی بتواند با
#    پیمایشِ بارکدها کلِ فهرست را بیرون بکشد.
chk "بدون توکن ۴۰۱" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$A/catalog/$BC")" "401"

echo '--- ۷) منبعِ بیرونی پیش‌فرض خاموش است ---'
# ⚠️ بارکدِ کوکاکولا در Open Food Facts هست.  اگر پاسخ بدهد، یعنی
#    منبعِ بیرونی روشن مانده — و آن یعنی صندوق‌دار برای هر بارکدِ
#    ایرانی ده ثانیه منتظر بماند.
chk "بارکدِ جهانی هم بی‌پاسخ است" \
  "$(curl -s "$A/catalog/5449000000996" -H "$AU" | P "'empty' if d is None else 'has'")" "empty"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
