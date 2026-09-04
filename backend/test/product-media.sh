#!/usr/bin/env bash
#
# تصویر کالا و میدان‌های فروشگاه اینترنتی.
#
# سه ایراد پشت سر هم در همین مسیر بود: `imageUrl` در DTO نبود، بعد در
# فهرست ستون‌های قابل نوشتن نبود، و `isOnline`/`onlinePrice` هم همان‌طور.
# هر سه یک شکل داشتند — **PATCH موفق برمی‌گشت ولی هیچ‌چیز ذخیره نمی‌شد**،
# که بدترین شکل شکست است چون شبیه موفقیت به نظر می‌رسد.

cd "$(dirname "$0")/../.." || exit 1
A=${MOLIDO_API:-http://localhost:3000}
PW=${MOLIDO_ADMIN_PASSWORD:-admin123}
C=${MOLIDO_COMPOSE:-"docker compose -f docker-compose.yml -f docker-compose.store.yml"}
SP="${TMPDIR:-/tmp}"

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

pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"; else fail=$((fail+1)); printf '  FAIL %s (got=%s want=%s)\n' "$1" "$2" "$3"; fi; }
psqlv() { $C exec -T postgres psql -U postgres -d molido_ai -tAc "$1" 2>/dev/null | tr -d '\r'; }

# کوچک‌ترین PNG معتبر
python3 - "$SP/media-test.png" <<'PY'
import base64, sys
open(sys.argv[1], 'wb').write(base64.b64decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='))
PY

echo '--- 1) upload returns a served path ---'
UP=$(curl -s -X POST $A/uploads -H "$AU" \
  -F "file=@$SP/media-test.png" -F 'entityType=PRODUCT' -F 'entityId=seed-p2')
FP=$(echo "$UP" | P "d.get('filePath','')")
chk "path returned"  "$([ -n "$FP" ] && echo yes || echo no)" "yes"
chk "under /uploads" "$(printf '%s' "$FP" | grep -c '^/uploads/')" "1"
chk "file is served" "$(curl -s -o /dev/null -w '%{http_code}' "$A$FP")" "200"
chk "served as image" "$(curl -s -o /dev/null -w '%{content_type}' "$A$FP")" "image/png"

echo '--- 2) the path actually attaches to the product ---'
curl -s -X PATCH "$A/products/seed-p2" -H "$AU" -H "$JS" \
  -d "{\"imageUrl\":\"$FP\"}" >/dev/null
chk "stored in database" "$(psqlv "SELECT COALESCE(\"imageUrl\",'') FROM \"Product\" WHERE id='seed-p2'")" "$FP"
chk "returned by the API" "$(curl -s "$A/products?search=OIL&limit=1" -H "$AU" \
  | P "(d if isinstance(d,list) else d['data'])[0].get('imageUrl','')")" "$FP"

echo '--- 3) an external URL is refused ---'
# پذیرفتن نشانی دلخواه یعنی فروشگاه تصویری از سرور ناشناس بار کند، و
# نشانی `javascript:` هم بی‌سروصدا در `src` بنشیند.
chk "remote url refused" "$(curl -s -X PATCH "$A/products/seed-p2" -H "$AU" -H "$JS" \
  -d '{"imageUrl":"https://evil.example/x.png"}' | P "d.get('statusCode')")" "400"
chk "javascript url refused" "$(curl -s -X PATCH "$A/products/seed-p2" -H "$AU" -H "$JS" \
  -d '{"imageUrl":"javascript:alert(1)"}' | P "d.get('statusCode')")" "400"
chk "path traversal refused" "$(curl -s -X PATCH "$A/products/seed-p2" -H "$AU" -H "$JS" \
  -d '{"imageUrl":"/uploads/../../etc/passwd"}' | P "d.get('statusCode')")" "400"
chk "still the good one" "$(psqlv "SELECT COALESCE(\"imageUrl\",'') FROM \"Product\" WHERE id='seed-p2'")" "$FP"

echo '--- 4) online fields are settable at all ---'
curl -s -X PATCH "$A/products/seed-p2" -H "$AU" -H "$JS" \
  -d '{"isOnline":true,"onlinePrice":149000}' >/dev/null
chk "isOnline saved"    "$(psqlv "SELECT \"isOnline\" FROM \"Product\" WHERE id='seed-p2'")" "t"
chk "onlinePrice saved" "$(psqlv "SELECT \"onlinePrice\"::int FROM \"Product\" WHERE id='seed-p2'")" "149000"

echo '--- 5) the storefront shows the image ---'
chk "image reaches the shop" "$(curl -s "$A/shop/products" \
  | P "'yes' if any(p.get('imageUrl') for p in d) else 'no'")" "yes"

# بازگرداندن
curl -s -X PATCH "$A/products/seed-p2" -H "$AU" -H "$JS" \
  -d '{"isOnline":false}' >/dev/null
$C exec -T postgres psql -U postgres -d molido_ai -q -c \
  "UPDATE \"Product\" SET \"imageUrl\"=NULL, \"onlinePrice\"=NULL WHERE id='seed-p2';" >/dev/null 2>&1
rm -f "$SP/media-test.png"

echo
printf "   PASS: %s   FAIL: %s\n" "$pass" "$fail"
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
